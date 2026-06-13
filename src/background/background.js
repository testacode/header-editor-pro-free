export class HeaderEditorBackground {
  constructor() {
    this.currentRuleId = 1;
    this.activeRules = new Set();
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
    this.loadAndApplyRules();
  }

  setupUpdateNotifications() {
    chrome.runtime.onInstalled.addListener(details => {
      if (details.reason === 'update') {
        const currentVersion = chrome.runtime.getManifest().version;

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
      if (message.action === 'updateHeaders') {
        this.handleUpdateHeaders(message.data);
      } else if (message.action === 'clearUpdateBadge') {
        chrome.action.setBadgeText({ text: '' });
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.headerEditorData) {
        this.loadAndApplyRules();
      }
    });
  }

  async loadAndApplyRules() {
    try {
      const result = await chrome.storage.local.get(['headerEditorData']);
      const data = result.headerEditorData || {
        profiles: {
          default: {
            name: 'Default',
            requestHeaders: [],
          },
        },
        currentProfile: 'default',
        enabled: true,
        paused: false,
        profileCounter: 1,
      };

      await this.applyHeaderRules(data);
    } catch (_error) {
      await this.clearAllRules();
    }
  }

  async handleUpdateHeaders(data) {
    await this.applyHeaderRules(data);
  }

  async applyHeaderRules(data) {
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

    const currentProfile = data.profiles[data.currentProfile];
    if (!currentProfile) {
      return;
    }

    const rules = [];

    // Process request headers - only enabled ones
    if (currentProfile.requestHeaders && currentProfile.requestHeaders.length > 0) {
      const enabledRequestHeaders = currentProfile.requestHeaders.filter(h => h.enabled !== false);
      if (enabledRequestHeaders.length > 0) {
        const requestHeaderRule = this.createRequestHeaderRule(enabledRequestHeaders);
        if (requestHeaderRule) {
          rules.push(requestHeaderRule);
        }
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
      await this.addRules(rules);
      console.log('HeaderEditor: Rules added successfully');
    } else {
      console.log('HeaderEditor: No rules to apply');
    }
  }

  createRequestHeaderRule(headers) {
    const validHeaders = headers.filter(h => h.name && h.name.trim());
    if (validHeaders.length === 0) {
      return null;
    }

    const requestHeaders = validHeaders.map(header => ({
      header: header.name.trim(),
      operation: header.value ? 'set' : 'remove',
      value: header.value || undefined,
    }));

    return {
      id: this.currentRuleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: requestHeaders,
      },
      condition: {
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
      },
    };
  }

  async addRules(rules) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules,
      });

      rules.forEach(rule => {
        this.activeRules.add(rule.id);
      });
    } catch (_error) {
      // Fallback for individual rule addition if batch fails
      for (const rule of rules) {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule],
          });
          this.activeRules.add(rule.id);
        } catch (_ruleError) {
          // Skip invalid rules
        }
      }
    }
  }

  async clearAllRules() {
    try {
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
    } catch (_error) {
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
