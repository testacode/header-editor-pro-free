import { isHeaderEnabled } from '../popup/header-normalize.js';
import { defaultHeaderEditorData } from '../popup/default-data.js';

// Chrome's declarativeNetRequest only allows the `append` operation on this set
// of REQUEST headers; response headers have no such restriction. Emitting an
// append rule for a request header outside this list makes updateDynamicRules
// reject the whole rule, so we degrade to `set` with a warning instead.
// Source: MDN declarativeNetRequest.ModifyHeaderInfo (verified 2026-07-05).
// This is a Chrome-defined list and may change — update it if append stops
// working for a header that used to be allowed.
const APPEND_ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'forwarded',
  'if-match',
  'if-none-match',
  'keep-alive',
  'range',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  'want-digest',
  'x-forwarded-for',
]);

export class HeaderEditorBackground {
  constructor() {
    this.currentRuleId = 1;
    this.activeRules = new Set();
    this.lastAppliedSignature = null;
    this.isFirefox = this.detectFirefox();
    this.init();
  }

  detectFirefox() {
    const isFirefox = typeof browser !== 'undefined' || navigator.userAgent.includes('Firefox');
    console.log(
      'HeaderEditor: Browser detection - isFirefox:',
      isFirefox,
      'userAgent:',
      navigator.userAgent
    );
    return isFirefox;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  init() {
    this.setupMessageHandlers();
    this.setupUpdateNotifications();
    this.setupTabGroupTracking();
    this.loadAndApplyRules();
  }

  setupUpdateNotifications() {
    chrome.runtime.onInstalled.addListener(details => {
      if (details.reason === 'update') {
        const currentVersion = chrome.runtime.getManifest().version;

        // Reloading an unpacked extension fires 'update' with the same version;
        // only notify when the version actually changed.
        if (details.previousVersion === currentVersion) {
          return;
        }

        // Show "NEW" badge on extension icon
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });

        // Store update notification data
        chrome.storage.local.set({
          updateNotification: {
            previousVersion: details.previousVersion,
            currentVersion: currentVersion,
            shown: false,
            timestamp: Date.now(),
          },
        });
      } else if (details.reason === 'install') {
        // Welcome message for first-time installation
        chrome.storage.local.set({
          welcomeNotification: {
            version: chrome.runtime.getManifest().version,
            shown: false,
            timestamp: Date.now(),
          },
        });
      }
    });
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (message.action === 'clearUpdateBadge') {
        chrome.action.setBadgeText({ text: '' });
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.headerEditorData) {
        this.loadAndApplyRules();
      }
    });
  }

  ruleStateSignature(data, tabIds) {
    const profile = data.profiles?.[data.currentProfile];
    return JSON.stringify({
      enabled: data.enabled,
      paused: data.paused,
      currentProfile: data.currentProfile,
      requestHeaders: profile?.requestHeaders ?? null,
      responseHeaders: profile?.responseHeaders ?? null,
      filters: profile?.filters ?? null,
      tabIds: tabIds ?? null,
    });
  }

  async loadAndApplyRules() {
    try {
      const result = await chrome.storage.local.get(['headerEditorData']);
      const data = result.headerEditorData || defaultHeaderEditorData();

      const profile = data.profiles?.[data.currentProfile];
      const tabIds = await this.resolveTabIds(profile?.filters);

      const signature = this.ruleStateSignature(data, tabIds);
      if (signature === this.lastAppliedSignature) {
        return;
      }

      await this.applyHeaderRules(data, tabIds);
      this.lastAppliedSignature = signature;
    } catch (error) {
      console.error('Failed to apply header rules, clearing all rules:', error);
      this.lastAppliedSignature = null;
      await this.clearAllRules();
    }
  }

  supportsTabGroupFilter() {
    // Firefox's declarativeNetRequest has no tabIds condition, and session-rule
    // tab scoping is the only way to implement the filter — Chrome only.
    return !this.isFirefox && Boolean(chrome.tabGroups) && Boolean(chrome.tabs);
  }

  // Resolve the tab group filter to the concrete tab ids it covers right now.
  // Returns null when no tab scoping applies (filter off, unsupported browser)
  // and an array (possibly empty = match nothing) when it does.
  async resolveTabIds(filters) {
    const tabGroup = filters?.tabGroup;
    if (!tabGroup?.enabled || !tabGroup.group) {
      return null;
    }
    if (!this.supportsTabGroupFilter()) {
      console.warn('HeaderEditor: tab group filter is not supported in this browser; ignoring it');
      return null;
    }

    try {
      let groupId = tabGroup.group.id;
      try {
        await chrome.tabGroups.get(groupId);
      } catch (_missingGroup) {
        // Group ids do not survive a browser restart — re-match by title+color.
        const candidates = await chrome.tabGroups.query({
          title: tabGroup.group.title ?? '',
          color: tabGroup.group.color,
        });
        if (candidates.length === 0) {
          return [];
        }
        groupId = candidates[0].id;
      }

      const tabs = await chrome.tabs.query({ groupId });
      return tabs.map(tab => tab.id);
    } catch (error) {
      console.error('HeaderEditor: failed to resolve tab group tabs:', error);
      return [];
    }
  }

  // Re-apply rules when tab group membership can have changed. The signature
  // check in loadAndApplyRules makes redundant firings cheap.
  setupTabGroupTracking() {
    if (!this.supportsTabGroupFilter()) {
      return;
    }
    const reapply = () => this.loadAndApplyRules();

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if ('groupId' in changeInfo) {
        reapply();
      }
    });
    chrome.tabs.onRemoved.addListener(reapply);
    chrome.tabGroups.onUpdated.addListener(reapply);
    chrome.tabGroups.onRemoved.addListener(reapply);
    chrome.runtime.onStartup.addListener(reapply);
  }

  async applyHeaderRules(data, tabIds = null) {
    console.log('HeaderEditor: Applying header rules', {
      enabled: data.enabled,
      paused: data.paused,
      currentProfile: data.currentProfile,
      isFirefox: this.isFirefox,
      tabIds,
    });

    // Clear existing rules first
    await this.clearAllRules();

    // Firefox needs extra time between clearing and applying rules
    if (this.isFirefox) {
      console.log('HeaderEditor: Firefox detected - adding delay');
      await this.delay(100);
    }

    // If extension is disabled or paused, don't apply any new rules
    if (!data.enabled || data.paused) {
      console.log('HeaderEditor: Extension disabled or paused - not applying rules');
      return;
    }

    const currentProfile = data.profiles[data.currentProfile];
    if (!currentProfile) {
      return;
    }

    // Tab group filter resolved to zero tabs (group empty or gone): the profile
    // is scoped to nothing, so no rules at all.
    if (tabIds !== null && tabIds.length === 0) {
      console.log('HeaderEditor: Tab group filter matches no tabs - not applying rules');
      return;
    }

    const conditions = this.buildConditions(currentProfile.filters, tabIds);
    const rules = [];

    // Process request headers - only enabled ones
    if (currentProfile.requestHeaders && currentProfile.requestHeaders.length > 0) {
      const enabledRequestHeaders = currentProfile.requestHeaders.filter(isHeaderEnabled);
      if (enabledRequestHeaders.length > 0) {
        rules.push(
          ...this.createModifyHeadersRules(enabledRequestHeaders, 'requestHeaders', conditions)
        );
      }
    }

    // Process response headers - only enabled ones
    if (currentProfile.responseHeaders && currentProfile.responseHeaders.length > 0) {
      const enabledResponseHeaders = currentProfile.responseHeaders.filter(isHeaderEnabled);
      if (enabledResponseHeaders.length > 0) {
        rules.push(
          ...this.createModifyHeadersRules(enabledResponseHeaders, 'responseHeaders', conditions)
        );
      }
    }

    console.log('HeaderEditor: Rules to apply:', rules.length);

    if (rules.length > 0) {
      // Firefox needs extra time before adding new rules
      if (this.isFirefox) {
        console.log('HeaderEditor: Firefox - adding delay before applying rules');
        await this.delay(100);
      }

      console.log('HeaderEditor: About to add rules:', rules);
      // tabIds conditions are only valid on session rules
      await this.addRules(rules, { session: tabIds !== null });
      console.log('HeaderEditor: Rules added successfully');
    } else {
      console.log('HeaderEditor: No rules to apply');
    }
  }

  activeDomainList(filters) {
    if (!filters?.domains?.enabled) {
      return [];
    }
    // DNR requires lowercase domains
    return (filters.domains.list || []).map(domain => domain.trim().toLowerCase()).filter(Boolean);
  }

  // Build the DNR conditions the profile's rules must carry. With a domain
  // filter, a request should match when it goes TO one of the domains or is
  // initiated FROM one of them; DNR ANDs fields inside a condition, so that OR
  // takes one rule (condition) per field.
  buildConditions(filters, tabIds) {
    const base = {
      urlFilter: '*',
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'stylesheet',
        'script',
        'image',
        'font',
        'object',
        'xmlhttprequest',
        'ping',
        'csp_report',
        'media',
        'websocket',
        'other',
      ],
    };
    if (tabIds !== null) {
      base.tabIds = tabIds;
    }

    const domains = this.activeDomainList(filters);
    if (domains.length === 0) {
      return [base];
    }
    return [
      { ...base, requestDomains: domains },
      { ...base, initiatorDomains: domains },
    ];
  }

  // Decide the DNR operation for a header: append (multi-value) when the user
  // enabled append mode and there is a value, else set (has value) or remove.
  // Request-header append is degraded to set (with a warning) when the header
  // is outside Chrome's append whitelist, to avoid a rule Chrome would reject.
  resolveOperation(header, name, direction) {
    if (header.appendMode && header.value) {
      if (
        direction === 'requestHeaders' &&
        !APPEND_ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())
      ) {
        console.warn(
          `HeaderEditor: append not supported for request header "${name}"; falling back to set`
        );
        return 'set';
      }
      return 'append';
    }
    return header.value ? 'set' : 'remove';
  }

  // Build the modifyHeaders rules for a header direction, one per condition.
  // `direction` is 'requestHeaders' or 'responseHeaders' — the DNR action field.
  createModifyHeadersRules(headers, direction, conditions) {
    const validHeaders = headers.filter(h => h.name && h.name.trim());
    if (validHeaders.length === 0) {
      return [];
    }

    const modifications = validHeaders.map(header => {
      const name = header.name.trim();
      return {
        header: name,
        operation: this.resolveOperation(header, name, direction),
        value: header.value || undefined,
      };
    });

    return conditions.map(condition => ({
      id: this.currentRuleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        [direction]: modifications,
      },
      condition,
    }));
  }

  async addRules(rules, { session = false } = {}) {
    const updateRules = options =>
      session
        ? chrome.declarativeNetRequest.updateSessionRules(options)
        : chrome.declarativeNetRequest.updateDynamicRules(options);

    try {
      await updateRules({ addRules: rules });

      rules.forEach(rule => {
        this.activeRules.add(rule.id);
      });
    } catch (error) {
      console.error('Batch addRules failed, retrying rules individually:', error);
      // Fallback for individual rule addition if batch fails
      for (const rule of rules) {
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential is intentional: isolate which rule fails in the per-rule fallback
          await updateRules({ addRules: [rule] });
          this.activeRules.add(rule.id);
        } catch (_ruleError) {
          // Skip invalid rules
        }
      }
    }
  }

  async clearSessionRules() {
    // Session rules (tab group scoping) live in a separate rule set
    if (!chrome.declarativeNetRequest.getSessionRules) {
      return;
    }
    const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
    if (sessionRules.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: sessionRules.map(rule => rule.id),
      });
    }
  }

  async clearAllRules() {
    try {
      await this.clearSessionRules();

      // Always get current dynamic rules to ensure we remove everything
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const allRuleIds = existingRules.map(rule => rule.id);

      if (allRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: allRuleIds,
        });

        // Firefox needs extra time to process rule removal
        if (this.isFirefox) {
          await this.delay(50);
        }
      }

      // Clear our tracking
      this.activeRules.clear();

      // Firefox: Double-check and clear any remaining rules
      if (this.isFirefox) {
        await this.delay(50);
        const remainingRules = await chrome.declarativeNetRequest.getDynamicRules();
        if (remainingRules.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: remainingRules.map(rule => rule.id),
          });
          await this.delay(50);
        }
      }
    } catch (error) {
      console.error('clearAllRules primary path failed, falling back to tracked rules:', error);
      // Fallback: try to remove tracked rules
      try {
        if (this.activeRules.size > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from(this.activeRules),
          });

          if (this.isFirefox) {
            await this.delay(50);
          }
        }
        this.activeRules.clear();
      } catch (_fallbackError) {
        // Reset rule tracking if all else fails
        this.activeRules.clear();
      }
    }
  }
}

// Initialize the background service
new HeaderEditorBackground();
