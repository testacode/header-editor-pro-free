import { defaultHeaderEditorData, migrateLegacyFlags } from '../popup/default-data.js';
import { APPLY_RULES_MESSAGE } from '../messages.js';
import { compileRules } from './rule-compiler.js';

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

    // storage.onChanged alone is not a dependable wake-up: dynamic DNR rules
    // keep modifying headers while the service worker is asleep, so a missed
    // event leaves pause (or a disabled header) written to storage but still
    // applied to traffic. An explicit sendMessage from the popup always starts
    // the worker, so the popup pings us after every write.
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== APPLY_RULES_MESSAGE) {
        return false;
      }
      this.loadAndApplyRules().then(() => sendResponse({ ok: true }));
      return true; // keep the message channel open for the async response
    });
  }

  // Everything an application writes to the browser: the compiled rules and
  // what the badges show. Fields that reach neither (descriptions, notes,
  // text colour...) can change without re-applying anything.
  ruleStateSignature(data, activeProfiles, compiled) {
    const badgeOf = profile =>
      profile ? { name: profile.name ?? null, color: profile.backgroundColor ?? null } : null;
    return JSON.stringify({
      compiled,
      badges: {
        paused: data.paused,
        current: badgeOf(data.profiles?.[data.currentProfile]),
        scoped: activeProfiles
          .filter(({ tabIds }) => tabIds !== null)
          .map(({ profile, tabIds }) => ({ ...badgeOf(profile), tabIds })),
      },
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
  // The queue never rejects: a rejection would be inherited by every later
  // .then() on it, so one failure would silently freeze the rules until the
  // worker restarts. Failures are logged and the chain moves on.
  loadAndApplyRules() {
    this.applyQueue = this.applyQueue.then(() =>
      this.doLoadAndApplyRules().catch(error => {
        console.error('HeaderEditor: rule application failed:', error);
      })
    );
    return this.applyQueue;
  }

  async doLoadAndApplyRules() {
    try {
      const result = await chrome.storage.local.get(['headerEditorData']);
      const { data } = migrateLegacyFlags(result.headerEditorData || defaultHeaderEditorData());

      const activeProfiles = await this.resolveActiveProfiles(data);
      const compiled = compileRules(data, activeProfiles);

      const signature = this.ruleStateSignature(data, activeProfiles, compiled);
      if (signature === this.lastAppliedSignature) {
        return;
      }

      await this.applyHeaderRules(data, activeProfiles, compiled);
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

  async applyHeaderRules(
    data,
    activeProfiles = null,
    compiled = compileRules(data, activeProfiles)
  ) {
    console.log('HeaderEditor: Applying header rules', {
      paused: data.paused,
      currentProfile: data.currentProfile,
      isFirefox: this.isFirefox,
    });

    const existingDynamic = await chrome.declarativeNetRequest.getDynamicRules();
    const existingSession = await this.getSessionRules();

    // New ids must not collide with rules still installed in either store —
    // after a worker restart the in-memory counter starts over at 1.
    for (const rule of [...existingDynamic, ...existingSession]) {
      this.currentRuleId = Math.max(this.currentRuleId, rule.id + 1);
    }

    const withId = rule => ({ id: this.currentRuleId++, ...rule });
    const dynamicRules = compiled.dynamicRules.map(withId);
    const sessionRules = compiled.sessionRules.map(withId);

    console.log('HeaderEditor: Rules to apply:', {
      dynamic: dynamicRules.length,
      session: sessionRules.length,
    });

    await this.replaceRules(dynamicRules, existingDynamic);
    await this.replaceRules(sessionRules, existingSession, { session: true });
  }

  async getSessionRules() {
    // Session rules (tab group scoping) live in a separate rule set
    if (!chrome.declarativeNetRequest.getSessionRules) {
      return [];
    }
    return chrome.declarativeNetRequest.getSessionRules();
  }

  // Swap a whole rule set in one call: DNR applies removeRuleIds before
  // addRules, so traffic never goes through a window with no rules at all
  // (with a clear-then-add pair it did, and Firefox padded it with delays).
  async replaceRules(rules, existingRules, { session = false } = {}) {
    const removeRuleIds = existingRules.map(rule => rule.id);
    if (removeRuleIds.length === 0 && rules.length === 0) {
      return;
    }
    const updateRules = options =>
      session
        ? chrome.declarativeNetRequest.updateSessionRules(options)
        : chrome.declarativeNetRequest.updateDynamicRules(options);
    const tracked = session ? this.activeSessionRuleIds : this.activeDynamicRuleIds;

    try {
      await updateRules({ removeRuleIds, ...(rules.length > 0 ? { addRules: rules } : {}) });
      tracked.clear();
      rules.forEach(rule => tracked.add(rule.id));
    } catch (error) {
      // One invalid rule rejects the whole batch. Give up atomicity to keep
      // the valid ones: clear, then let addRules isolate the culprit.
      console.error('HeaderEditor: atomic rule swap failed, falling back:', error);
      await updateRules({ removeRuleIds });
      tracked.clear();
      await this.addRules(rules, { session });
    }
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

      if (data.paused) {
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
    const sessionRules = await this.getSessionRules();
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
