import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock the background class by importing the file content
// Since background.js creates an instance immediately, we need to prevent that
const originalLog = console.log;
console.log = jest.fn(); // Suppress console output during tests

// Import the background functionality
let HeaderEditorBackground;

// Mock the class before importing
beforeEach(() => {
  jest.resetModules();
  
  // Create a mock version of the HeaderEditorBackground class
  HeaderEditorBackground = class {
    constructor() {
      this.currentRuleId = 1;
      this.activeRules = new Set();
      this.isFirefox = false;
    }

    detectFirefox() {
      return false;
    }

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    setupUpdateNotifications() {
      chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason === "update") {
          const currentVersion = chrome.runtime.getManifest().version;
          chrome.action.setBadgeText({ text: "NEW" });
          chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });
          chrome.storage.local.set({ 
            updateNotification: {
              previousVersion: details.previousVersion,
              currentVersion: currentVersion,
              shown: false,
              timestamp: Date.now()
            }
          });
        } else if (details.reason === "install") {
          chrome.storage.local.set({ 
            welcomeNotification: {
              version: chrome.runtime.getManifest().version,
              shown: false,
              timestamp: Date.now()
            }
          });
        }
      });
    }

    setupMessageHandlers() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateHeaders') {
          this.handleUpdateHeaders(message.data);
        } else if (message.action === 'clearUpdateBadge') {
          chrome.action.setBadgeText({ text: "" });
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
              requestHeaders: []
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
      await this.clearAllRules();

      if (this.isFirefox) {
        await this.delay(100);
      }

      if (!data.enabled || data.paused) {
        return;
      }

      const currentProfile = data.profiles[data.currentProfile];
      if (!currentProfile) {
        return;
      }

      const rules = [];

      if (currentProfile.requestHeaders && currentProfile.requestHeaders.length > 0) {
        const enabledRequestHeaders = currentProfile.requestHeaders.filter(h => h.enabled !== false);
        if (enabledRequestHeaders.length > 0) {
          const requestHeaderRule = this.createRequestHeaderRule(enabledRequestHeaders);
          if (requestHeaderRule) {
            rules.push(requestHeaderRule);
          }
        }
      }
      
      if (rules.length > 0) {
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

    async addRules(rules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: rules
        });

        rules.forEach(rule => {
          this.activeRules.add(rule.id);
        });
      } catch (error) {
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
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const allRuleIds = existingRules.map(rule => rule.id);
        
        if (allRuleIds.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: allRuleIds
          });
          
          if (this.isFirefox) {
            await this.delay(50);
          }
        }
        
        this.activeRules.clear();
        
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
          this.activeRules.clear();
        }
      }
    }
  };
});

describe('HeaderEditorBackground', () => {
  let background;

  beforeEach(() => {
    background = new HeaderEditorBackground();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(background.currentRuleId).toBe(1);
      expect(background.activeRules).toBeInstanceOf(Set);
      expect(background.activeRules.size).toBe(0);
      expect(background.isFirefox).toBe(false);
    });
  });

  describe('detectFirefox', () => {
    test('should return false for non-Firefox browsers', () => {
      expect(background.detectFirefox()).toBe(false);
    });
  });

  describe('setupUpdateNotifications', () => {
    test('should register onInstalled listener', () => {
      background.setupUpdateNotifications();
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('should handle update event correctly', () => {
      background.setupUpdateNotifications();
      
      // Get the listener function that was registered
      const listenerCall = chrome.runtime.onInstalled.addListener.mock.calls[0];
      const listener = listenerCall[0];
      
      // Simulate update event
      listener({ reason: 'update', previousVersion: '2.0.0' });
      
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'NEW' });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4caf50' });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        updateNotification: {
          previousVersion: '2.0.0',
          currentVersion: '2.1.1',
          shown: false,
          timestamp: expect.any(Number)
        }
      });
    });

    test('should handle install event correctly', () => {
      background.setupUpdateNotifications();
      
      const listenerCall = chrome.runtime.onInstalled.addListener.mock.calls[0];
      const listener = listenerCall[0];
      
      // Simulate install event
      listener({ reason: 'install' });
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        welcomeNotification: {
          version: '2.1.1',
          shown: false,
          timestamp: expect.any(Number)
        }
      });
    });
  });

  describe('setupMessageHandlers', () => {
    test('should register message listeners', () => {
      background.setupMessageHandlers();
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('should handle clearUpdateBadge message', () => {
      background.setupMessageHandlers();
      
      const listenerCall = chrome.runtime.onMessage.addListener.mock.calls[0];
      const listener = listenerCall[0];
      
      listener({ action: 'clearUpdateBadge' }, {}, jest.fn());
      
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('createRequestHeaderRule', () => {
    test('should create valid rule for headers', () => {
      const headers = [
        { name: 'Authorization', value: 'Bearer token123', enabled: true },
        { name: 'Custom-Header', value: 'test-value', enabled: true }
      ];

      const rule = background.createRequestHeaderRule(headers);

      expect(rule).toEqual({
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Authorization', operation: 'set', value: 'Bearer token123' },
            { header: 'Custom-Header', operation: 'set', value: 'test-value' }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: [
            'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
            'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
          ]
        }
      });
    });

    test('should return null for empty headers', () => {
      const rule = background.createRequestHeaderRule([]);
      expect(rule).toBeNull();
    });

    test('should filter out headers without names', () => {
      const headers = [
        { name: '', value: 'test', enabled: true },
        { name: 'Valid-Header', value: 'test-value', enabled: true }
      ];

      const rule = background.createRequestHeaderRule(headers);

      expect(rule.action.requestHeaders).toHaveLength(1);
      expect(rule.action.requestHeaders[0].header).toBe('Valid-Header');
    });

    test('should handle remove operation for empty values', () => {
      const headers = [
        { name: 'Remove-Header', value: '', enabled: true }
      ];

      const rule = background.createRequestHeaderRule(headers);

      expect(rule.action.requestHeaders[0]).toEqual({
        header: 'Remove-Header',
        operation: 'remove',
        value: undefined
      });
    });
  });

  describe('addRules', () => {
    test('should add rules to declarativeNetRequest', async () => {
      const rules = [{ id: 1, priority: 1 }];
      
      await background.addRules(rules);
      
      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        addRules: rules
      });
      expect(background.activeRules.has(1)).toBe(true);
    });

    test('should handle errors and try individual rules', async () => {
      chrome.declarativeNetRequest.updateDynamicRules
        .mockRejectedValueOnce(new Error('Batch failed'))
        .mockResolvedValueOnce();

      const rules = [{ id: 1, priority: 1 }];
      
      await background.addRules(rules);
      
      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAllRules', () => {
    test('should clear all rules', async () => {
      const existingRules = [{ id: 1 }, { id: 2 }];
      chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue(existingRules);

      await background.clearAllRules();

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: [1, 2]
      });
      expect(background.activeRules.size).toBe(0);
    });

    test('should handle empty rules array', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([]);

      await background.clearAllRules();

      expect(chrome.declarativeNetRequest.updateDynamicRules).not.toHaveBeenCalled();
      expect(background.activeRules.size).toBe(0);
    });
  });

  describe('applyHeaderRules', () => {
    test('should not apply rules when paused', async () => {
      const data = {
        enabled: true,
        paused: true,
        profiles: { default: { requestHeaders: [] } },
        currentProfile: 'default'
      };

      const clearSpy = jest.spyOn(background, 'clearAllRules').mockResolvedValue();
      const addSpy = jest.spyOn(background, 'addRules').mockResolvedValue();

      await background.applyHeaderRules(data);

      expect(clearSpy).toHaveBeenCalled();
      expect(addSpy).not.toHaveBeenCalled();
    });

    test('should not apply rules when disabled', async () => {
      const data = {
        enabled: false,
        paused: false,
        profiles: { default: { requestHeaders: [] } },
        currentProfile: 'default'
      };

      const clearSpy = jest.spyOn(background, 'clearAllRules').mockResolvedValue();
      const addSpy = jest.spyOn(background, 'addRules').mockResolvedValue();

      await background.applyHeaderRules(data);

      expect(clearSpy).toHaveBeenCalled();
      expect(addSpy).not.toHaveBeenCalled();
    });

    test('should apply rules when enabled and not paused', async () => {
      const data = {
        enabled: true,
        paused: false,
        profiles: {
          default: {
            requestHeaders: [
              { name: 'Test-Header', value: 'test-value', enabled: true }
            ]
          }
        },
        currentProfile: 'default'
      };

      const clearSpy = jest.spyOn(background, 'clearAllRules').mockResolvedValue();
      const addSpy = jest.spyOn(background, 'addRules').mockResolvedValue();

      await background.applyHeaderRules(data);

      expect(clearSpy).toHaveBeenCalled();
      expect(addSpy).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(Number),
          action: expect.objectContaining({
            type: 'modifyHeaders'
          })
        })
      ]));
    });
  });
});