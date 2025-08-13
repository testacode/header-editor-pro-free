class ModHeaderBackground {
  constructor() {
    this.currentRuleId = 1;
    this.activeRules = new Set();
    this.init();
  }

  init() {
    this.setupMessageHandlers();
    this.loadAndApplyRules();
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateHeaders') {
        this.handleUpdateHeaders(message.data);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.modHeaderData) {
        this.loadAndApplyRules();
      }
    });
  }

  async loadAndApplyRules() {
    try {
      const result = await chrome.storage.local.get(['modHeaderData']);
      const data = result.modHeaderData || {
        profiles: {
          default: { requestHeaders: [], responseHeaders: [] }
        },
        currentProfile: 'default',
        enabled: false
      };

      await this.applyHeaderRules(data);
    } catch (error) {
      await this.clearAllRules();
    }
  }

  async handleUpdateHeaders(data) {
    await this.applyHeaderRules(data);
  }

  async applyHeaderRules(data) {
    // Clear existing rules
    await this.clearAllRules();

    if (!data.enabled) {
      return;
    }

    const currentProfile = data.profiles[data.currentProfile];
    if (!currentProfile) {
      return;
    }

    const rules = [];

    // Process request headers
    if (currentProfile.requestHeaders && currentProfile.requestHeaders.length > 0) {
      const requestHeaderRule = this.createRequestHeaderRule(currentProfile.requestHeaders);
      if (requestHeaderRule) {
        rules.push(requestHeaderRule);
      }
    }

    // Process response headers
    if (currentProfile.responseHeaders && currentProfile.responseHeaders.length > 0) {
      const responseHeaderRule = this.createResponseHeaderRule(currentProfile.responseHeaders);
      if (responseHeaderRule) {
        rules.push(responseHeaderRule);
      }
    }

    if (rules.length > 0) {
      await this.addRules(rules);
    }
  }

  createRequestHeaderRule(headers) {
    const validHeaders = headers.filter(h => h.name && h.name.trim());
    if (validHeaders.length === 0) return null;

    const requestHeaders = validHeaders.map(header => ({
      header: header.name.trim(),
      operation: header.value ? 'set' : 'remove',
      value: header.value || undefined
    }));

    return {
      id: this.currentRuleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: requestHeaders
      },
      condition: {
        urlFilter: '*',
        resourceTypes: [
          'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
          'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
        ]
      }
    };
  }

  createResponseHeaderRule(headers) {
    const validHeaders = headers.filter(h => h.name && h.name.trim());
    if (validHeaders.length === 0) return null;

    const responseHeaders = validHeaders.map(header => ({
      header: header.name.trim(),
      operation: header.value ? 'set' : 'remove',
      value: header.value || undefined
    }));

    return {
      id: this.currentRuleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: responseHeaders
      },
      condition: {
        urlFilter: '*',
        resourceTypes: [
          'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
          'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
        ]
      }
    };
  }

  async addRules(rules) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules
      });

      rules.forEach(rule => {
        this.activeRules.add(rule.id);
      });

    } catch (error) {
      // Fallback for individual rule addition if batch fails
      for (const rule of rules) {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule]
          });
          this.activeRules.add(rule.id);
        } catch (ruleError) {
          // Skip invalid rules
        }
      }
    }
  }

  async clearAllRules() {
    try {
      if (this.activeRules.size > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: Array.from(this.activeRules)
        });
        this.activeRules.clear();
      }
    } catch (error) {
      // If specific removal fails, try to get and remove all dynamic rules
      try {
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        if (existingRules.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRules.map(rule => rule.id)
          });
        }
        this.activeRules.clear();
      } catch (fallbackError) {
        // Reset rule tracking if all else fails
        this.activeRules.clear();
      }
    }
  }
}

// Initialize the background service
new ModHeaderBackground();