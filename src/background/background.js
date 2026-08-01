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
    this.activeDynamicRuleIds = new Set();
    this.activeSessionRuleIds = new Set();
    this.badgedTabIds = new Set();
    this.lastAppliedSignature = null;
    this.applyQueue = Promise.resolve();
    this.isFirefox = this.detectFirefox();
    this.init();
  }

  detectFirefox() {
    // Chrome 137+ also defines the `browser` global as an alias of `chrome`,
    // so its mere presence no longer identifies Firefox. getBrowserInfo()
    // exists only in Firefox.
    const isFirefox =
      (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') ||
      navigator.userAgent.includes('Firefox');
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
        // The post-update tooltip and its "NEW" badge were removed; drop the key
        // so installs updating from <=2.5.3 don't keep an orphan around.
        chrome.storage.local.remove('updateNotification');
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
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.headerEditorData) {
        this.loadAndApplyRules();
      }
    });
  }

  ruleStateSignature(data, activeProfiles) {
    return JSON.stringify({
      enabled: data.enabled,
      paused: data.paused,
      currentProfile: data.currentProfile,
      active: (activeProfiles || []).map(({ key, profile, tabIds }) => ({
        key,
        name: profile.name ?? null,
        backgroundColor: profile.backgroundColor ?? null,
        requestHeaders: profile.requestHeaders ?? null,
        responseHeaders: profile.responseHeaders ?? null,
        filters: profile.filters ?? null,
        tabIds,
      })),
    });
  }

  // The profiles that apply right now: the selected one (as always) plus every
  // profile whose tab group filter is enabled — those stay active inside their
  // group even when another profile is selected, so sandbox
  // headers never depend on which profile the popup shows.
  // Each entry: { key, profile, tabIds } with tabIds null = no tab scoping.
  async resolveActiveProfiles(data) {
    const active = [];
    for (const [key, profile] of Object.entries(data.profiles || {})) {
      const isCurrent = key === data.currentProfile;
      // eslint-disable-next-line no-await-in-loop -- profiles are few; sequential keeps rule building deterministic
      const tabIds = await this.resolveTabIds(profile.filters);
      if (!isCurrent && tabIds === null) {
        continue; // not selected and not tab-scoped → inactive
      }
      active.push({ key, profile, tabIds });
    }
    return active;
  }

  // Concurrent triggers (storage change, tab/group events, startup) interleave
  // their DNR clear/add calls and can leave rules duplicated or missing —
  // serialize every application through a queue.
  loadAndApplyRules() {
    this.applyQueue = this.applyQueue.then(() => this.doLoadAndApplyRules());
    return this.applyQueue;
  }

  async doLoadAndApplyRules() {
    try {
      const result = await chrome.storage.local.get(['headerEditorData']);
      const data = result.headerEditorData || defaultHeaderEditorData();

      const activeProfiles = await this.resolveActiveProfiles(data);

      const signature = this.ruleStateSignature(data, activeProfiles);
      if (signature === this.lastAppliedSignature) {
        return;
      }

      await this.applyHeaderRules(data, activeProfiles);
      await this.updateBadges(data, activeProfiles);
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
        if (candidates.length !== 1) {
          if (candidates.length > 1) {
            console.warn(
              `HeaderEditor: ${candidates.length} tab groups match "${tabGroup.group.title}" (${tabGroup.group.color}); not applying the tab group filter to avoid scoping headers to the wrong tabs`
            );
          }
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

  async applyHeaderRules(data, activeProfiles = null) {
    console.log('HeaderEditor: Applying header rules', {
      enabled: data.enabled,
      paused: data.paused,
      currentProfile: data.currentProfile,
      isFirefox: this.isFirefox,
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

    if (activeProfiles === null) {
      const currentProfile = data.profiles[data.currentProfile];
      activeProfiles = currentProfile
        ? [{ key: data.currentProfile, profile: currentProfile, tabIds: null }]
        : [];
    }

    const dynamicRules = [];
    const sessionRules = [];

    for (const { profile, tabIds } of activeProfiles) {
      // Tab group filter resolved to zero tabs (group empty or gone): the
      // profile is scoped to nothing, so no rules for it.
      if (tabIds !== null && tabIds.length === 0) {
        continue;
      }

      const conditions = this.buildConditions(profile.filters, tabIds);
      // Tab-scoped rules outrank the selected profile's global rules when both
      // touch the same header on the same tab.
      const priority = tabIds !== null ? 2 : 1;
      // tabIds conditions are only valid on session rules
      const target = tabIds !== null ? sessionRules : dynamicRules;

      for (const direction of ['requestHeaders', 'responseHeaders']) {
        const headers = (profile[direction] || []).filter(isHeaderEnabled);
        if (headers.length > 0) {
          target.push(...this.createModifyHeadersRules(headers, direction, conditions, priority));
        }
      }
    }

    console.log('HeaderEditor: Rules to apply:', {
      dynamic: dynamicRules.length,
      session: sessionRules.length,
    });

    if (dynamicRules.length === 0 && sessionRules.length === 0) {
      console.log('HeaderEditor: No rules to apply');
      return;
    }

    // Firefox needs extra time before adding new rules
    if (this.isFirefox) {
      console.log('HeaderEditor: Firefox - adding delay before applying rules');
      await this.delay(100);
    }

    if (dynamicRules.length > 0) {
      await this.addRules(dynamicRules);
    }
    if (sessionRules.length > 0) {
      await this.addRules(sessionRules, { session: true });
    }
    console.log('HeaderEditor: Rules added successfully');
  }

  // Show which profile governs each tab: per-tab badge (letter + profile color)
  // for tab-group-scoped profiles, global badge for the selected profile.
  async updateBadges(data, activeProfiles) {
    if (!chrome.action?.setBadgeText) {
      return;
    }
    try {
      // Restore persisted badged-tab list (survives SW restart but not browser restart)
      if (chrome.storage.session) {
        const { badgedTabIds = [] } = await chrome.storage.session.get(['badgedTabIds']);
        for (const tabId of badgedTabIds) {
          this.badgedTabIds.add(tabId);
        }
      }

      // Clear per-tab badges from the previous application (closed tabs throw — fine)
      for (const tabId of this.badgedTabIds) {
        // eslint-disable-next-line no-await-in-loop -- small set; sequential keeps error handling per tab
        await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      }
      this.badgedTabIds.clear();

      if (!data.enabled || data.paused) {
        await chrome.action.setBadgeText({ text: '' });
        // Persist the (now empty) badged-tab list
        if (chrome.storage.session) {
          await chrome.storage.session.set({ badgedTabIds: Array.from(this.badgedTabIds) });
        }
        return;
      }

      const initialOf = profile => (profile.name || '').trim().charAt(0).toUpperCase() || '•';

      const current = data.profiles[data.currentProfile];
      if (current) {
        await chrome.action.setBadgeText({ text: initialOf(current) });
        await chrome.action.setBadgeBackgroundColor({
          color: current.backgroundColor || '#4caf50',
        });
      }

      for (const { profile, tabIds } of activeProfiles) {
        if (tabIds === null) {
          continue;
        }
        for (const tabId of tabIds) {
          // eslint-disable-next-line no-await-in-loop -- small set; sequential keeps error handling per tab
          await chrome.action.setBadgeText({ tabId, text: initialOf(profile) });
          // eslint-disable-next-line no-await-in-loop
          await chrome.action.setBadgeBackgroundColor({
            tabId,
            color: profile.backgroundColor || '#4caf50',
          });
          this.badgedTabIds.add(tabId);
        }
      }

      // Persist badged-tab list (survives SW restart but not browser restart)
      if (chrome.storage.session) {
        await chrome.storage.session.set({ badgedTabIds: Array.from(this.badgedTabIds) });
      }
    } catch (error) {
      console.error('HeaderEditor: failed to update badges:', error);
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
  createModifyHeadersRules(headers, direction, conditions, priority = 1) {
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
      priority,
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

    const tracked = session ? this.activeSessionRuleIds : this.activeDynamicRuleIds;

    try {
      await updateRules({ addRules: rules });

      rules.forEach(rule => {
        tracked.add(rule.id);
      });
    } catch (error) {
      console.error('Batch addRules failed, retrying rules individually:', error);
      // Fallback for individual rule addition if batch fails
      for (const rule of rules) {
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential is intentional: isolate which rule fails in the per-rule fallback
          await updateRules({ addRules: [rule] });
          tracked.add(rule.id);
        } catch (ruleError) {
          console.error(
            `HeaderEditor: dropping rule ${rule.id} (headers: ${(
              rule.action?.requestHeaders ||
              rule.action?.responseHeaders ||
              []
            )
              .map(h => h.header)
              .join(', ')}):`,
            ruleError
          );
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
      this.activeDynamicRuleIds.clear();
      this.activeSessionRuleIds.clear();

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
      try {
        if (this.activeSessionRuleIds.size > 0 && chrome.declarativeNetRequest.updateSessionRules) {
          await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: Array.from(this.activeSessionRuleIds),
          });
        }
        this.activeSessionRuleIds.clear();
      } catch (sessionFallbackError) {
        console.error('clearAllRules session fallback failed:', sessionFallbackError);
        this.activeSessionRuleIds.clear();
      }
      try {
        if (this.activeDynamicRuleIds.size > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from(this.activeDynamicRuleIds),
          });
          if (this.isFirefox) {
            await this.delay(50);
          }
        }
        this.activeDynamicRuleIds.clear();
      } catch (dynamicFallbackError) {
        console.error('clearAllRules dynamic fallback failed:', dynamicFallbackError);
        this.activeDynamicRuleIds.clear();
      }
    }
  }
}

// Initialize the background service
new HeaderEditorBackground();
