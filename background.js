class HeaderEditorBackground {
  constructor() {
    this.currentRuleId = 1;
    this.activeRules = new Set();
    this.isFirefox = this.detectFirefox();
    this.init();
  }

  detectFirefox() {
    return typeof browser !== 'undefined' || navigator.userAgent.includes('Firefox');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
            responseHeaders: [] 
          }
        },
        currentProfile: 'default',
        enabled: true,
        paused: false,
        profileCounter: 1
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
    // Clear existing rules first
    await this.clearAllRules();

    // Firefox needs extra time between clearing and applying rules
    if (this.isFirefox) {
      await this.delay(100);
    }

    // If extension is disabled or paused, don't apply any new rules
    if (!data.enabled || data.paused) {
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

    // Process response headers - only enabled ones
    if (currentProfile.responseHeaders && currentProfile.responseHeaders.length > 0) {
      const enabledResponseHeaders = currentProfile.responseHeaders.filter(h => h.enabled !== false);
      if (enabledResponseHeaders.length > 0) {
        const responseHeaderRule = this.createResponseHeaderRule(enabledResponseHeaders);
        if (responseHeaderRule) {
          rules.push(responseHeaderRule);
        }
      }
    }

    if (rules.length > 0) {
      // Firefox needs extra time before adding new rules
      if (this.isFirefox) {
        await this.delay(100);
      }
      
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
      // Always get current dynamic rules to ensure we remove everything
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const allRuleIds = existingRules.map(rule => rule.id);
      
      if (allRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: allRuleIds
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
            removeRuleIds: remainingRules.map(rule => rule.id)
          });
          await this.delay(50);
        }
      }
      
    } catch (error) {
      // Fallback: try to remove tracked rules
      try {
        if (this.activeRules.size > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from(this.activeRules)
          });
          
          if (this.isFirefox) {
            await this.delay(50);
          }
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
new HeaderEditorBackground();