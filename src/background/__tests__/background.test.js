import { describe, test, expect, beforeEach, vi } from 'vitest';
import { HeaderEditorBackground } from '../background.js';

// The module-level `new HeaderEditorBackground()` at the bottom of background.js
// runs once on import. setup.js mocks chrome.* and console, so it is harmless.

describe('HeaderEditorBackground', () => {
  let background;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default implementations for mocks that tests may override with
    // mockRejectedValue/mockResolvedValue — vi.clearAllMocks does NOT reset these.
    chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue(undefined);
    chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([]);
    chrome.storage.local.get.mockImplementation(keys => {
      const result = {};
      if (Array.isArray(keys)) {
        keys.forEach(k => {
          result[k] = undefined;
        });
      }
      return Promise.resolve(result);
    });

    // Suppress init() side effects during construction so mock call counts
    // start clean in each test. Methods are tested individually below.
    const initSpy = vi.spyOn(HeaderEditorBackground.prototype, 'init').mockImplementation(() => {});
    background = new HeaderEditorBackground();
    initSpy.mockRestore(); // restore only init; chrome.* mocks keep their implementations
  });

  // ─── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    test('initializes currentRuleId to 1', () => {
      expect(background.currentRuleId).toBe(1);
    });

    test('initializes activeRules as empty Set', () => {
      expect(background.activeRules).toBeInstanceOf(Set);
      expect(background.activeRules.size).toBe(0);
    });

    test('calls init on construction', () => {
      vi.clearAllMocks();
      const initSpy = vi
        .spyOn(HeaderEditorBackground.prototype, 'init')
        .mockImplementation(() => {});
      new HeaderEditorBackground();
      expect(initSpy).toHaveBeenCalledOnce();
      initSpy.mockRestore();
    });
  });

  // ─── detectFirefox ───────────────────────────────────────────────────────

  describe('detectFirefox', () => {
    test('returns true when browser global is defined (setup.js sets it)', () => {
      // setup.js sets global.browser = global.chrome
      expect(background.detectFirefox()).toBe(true);
    });

    test('returns false when browser global is not defined and UA has no Firefox', () => {
      vi.stubGlobal('browser', undefined);
      try {
        // navigator.userAgent is 'Mozilla/5.0 (Chrome Test)' per setup.js — no Firefox
        expect(background.detectFirefox()).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // ─── createRequestHeaderRule ─────────────────────────────────────────────

  describe('createRequestHeaderRule', () => {
    test('returns rule with modifyHeaders action and 13 resourceTypes', () => {
      const rule = background.createRequestHeaderRule([
        { name: 'Authorization', value: 'Bearer token', enabled: true },
        { name: 'X-Custom', value: 'val', enabled: true },
      ]);

      expect(rule).not.toBeNull();
      expect(rule.action.type).toBe('modifyHeaders');
      expect(rule.condition.urlFilter).toBe('*');
      expect(rule.condition.resourceTypes).toHaveLength(13);
      expect(rule.action.requestHeaders).toHaveLength(2);
    });

    test('increments id on successive calls', () => {
      const startId = background.currentRuleId;
      const headers = [{ name: 'X-A', value: 'a', enabled: true }];
      const rule1 = background.createRequestHeaderRule(headers);
      const rule2 = background.createRequestHeaderRule(headers);
      expect(rule1.id).toBe(startId);
      expect(rule2.id).toBe(startId + 1);
    });

    test('value present → operation set', () => {
      const rule = background.createRequestHeaderRule([
        { name: 'X-H', value: 'something', enabled: true },
      ]);
      expect(rule.action.requestHeaders[0].operation).toBe('set');
      expect(rule.action.requestHeaders[0].value).toBe('something');
    });

    test('empty value → operation remove, value undefined', () => {
      const rule = background.createRequestHeaderRule([
        { name: 'X-Remove', value: '', enabled: true },
      ]);
      expect(rule.action.requestHeaders[0].operation).toBe('remove');
      expect(rule.action.requestHeaders[0].value).toBeUndefined();
    });

    test('all headers without name → null', () => {
      const rule = background.createRequestHeaderRule([
        { name: '', value: 'x', enabled: true },
        { name: '   ', value: 'y', enabled: true },
      ]);
      expect(rule).toBeNull();
    });

    test('empty array → null', () => {
      expect(background.createRequestHeaderRule([])).toBeNull();
    });

    test('filters headers without truthy name, keeps valid ones', () => {
      const rule = background.createRequestHeaderRule([
        { name: '', value: 'skip', enabled: true },
        { name: 'Valid', value: 'keep', enabled: true },
      ]);
      expect(rule.action.requestHeaders).toHaveLength(1);
      expect(rule.action.requestHeaders[0].header).toBe('Valid');
    });

    test('resourceTypes contains all 13 expected types', () => {
      const rule = background.createRequestHeaderRule([{ name: 'X-H', value: 'v', enabled: true }]);
      expect(rule.condition.resourceTypes).toEqual([
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
      ]);
    });

    test('priority is 1', () => {
      const rule = background.createRequestHeaderRule([{ name: 'X-H', value: 'v', enabled: true }]);
      expect(rule.priority).toBe(1);
    });
  });

  // ─── clearAllRules ───────────────────────────────────────────────────────

  describe('clearAllRules', () => {
    test('removes all existing rule ids and clears activeRules', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([{ id: 1 }, { id: 5 }]);
      background.activeRules.add(1);
      background.activeRules.add(5);

      await background.clearAllRules();

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
        expect.objectContaining({ removeRuleIds: [1, 5] })
      );
      expect(background.activeRules.size).toBe(0);
    });

    test('does not call updateDynamicRules when getDynamicRules returns empty', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([]);

      await background.clearAllRules();

      // background.isFirefox = true (setup.js sets global.browser), so clearAllRules
      // calls getDynamicRules a second time for the Firefox double-check.
      // Neither call yields rules, so updateDynamicRules should never be called.
      expect(chrome.declarativeNetRequest.updateDynamicRules).not.toHaveBeenCalled();
      expect(background.activeRules.size).toBe(0);
    });

    test('falls back to tracked rules when getDynamicRules throws', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockRejectedValue(new Error('fail'));
      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue(undefined);
      background.activeRules.add(3);

      await background.clearAllRules();

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
        expect.objectContaining({ removeRuleIds: [3] })
      );
      expect(background.activeRules.size).toBe(0);
    });

    test('does not throw when both getDynamicRules and fallback fail', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockRejectedValue(new Error('fail'));
      chrome.declarativeNetRequest.updateDynamicRules.mockRejectedValue(new Error('also fail'));
      background.activeRules.add(9);

      await expect(background.clearAllRules()).resolves.not.toThrow();
      expect(background.activeRules.size).toBe(0);
    });
  });

  // ─── applyHeaderRules ────────────────────────────────────────────────────

  describe('applyHeaderRules', () => {
    test('always calls clearAllRules first', async () => {
      const clearSpy = vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await background.applyHeaderRules({
        enabled: true,
        paused: false,
        profiles: { p1: { requestHeaders: [] } },
        currentProfile: 'p1',
      });

      expect(clearSpy).toHaveBeenCalledOnce();
    });

    test('paused:true → clearAllRules called, no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await background.applyHeaderRules({
        enabled: true,
        paused: true,
        profiles: { p: { requestHeaders: [{ name: 'X', value: 'v', enabled: true }] } },
        currentProfile: 'p',
      });

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('enabled:false → clearAllRules called, no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await background.applyHeaderRules({
        enabled: false,
        paused: false,
        profiles: { p: { requestHeaders: [{ name: 'X', value: 'v', enabled: true }] } },
        currentProfile: 'p',
      });

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('2 enabled + 1 disabled headers → rule contains only the 2 enabled', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await background.applyHeaderRules({
        enabled: true,
        paused: false,
        profiles: {
          p: {
            requestHeaders: [
              { name: 'X-A', value: 'a', enabled: true },
              { name: 'X-B', value: 'b', enabled: true },
              { name: 'X-C', value: 'c', enabled: false },
            ],
          },
        },
        currentProfile: 'p',
      });

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(1);
      const rule = addCalls[0][0].addRules[0];
      expect(rule.action.requestHeaders).toHaveLength(2);
      const names = rule.action.requestHeaders.map(h => h.header);
      expect(names).toContain('X-A');
      expect(names).toContain('X-B');
      expect(names).not.toContain('X-C');
    });

    test('currentProfile not in profiles → no addRules, no throw', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await expect(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: { other: { requestHeaders: [] } },
          currentProfile: 'nonexistent',
        })
      ).resolves.not.toThrow();

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('empty requestHeaders → no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await background.applyHeaderRules({
        enabled: true,
        paused: false,
        profiles: { p: { requestHeaders: [] } },
        currentProfile: 'p',
      });

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });
  });

  // ─── loadAndApplyRules ───────────────────────────────────────────────────

  describe('loadAndApplyRules', () => {
    test('storage empty → default profile, no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);
      // Default mock returns {headerEditorData: undefined}
      await background.loadAndApplyRules();

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('storage with profile with headers → updateDynamicRules addRules called', async () => {
      chrome.storage.local.get.mockResolvedValue({
        headerEditorData: {
          profiles: {
            p1: { requestHeaders: [{ name: 'X-Test', value: 'hello', enabled: true }] },
          },
          currentProfile: 'p1',
          enabled: true,
          paused: false,
        },
      });
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await background.loadAndApplyRules();

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(1);
      expect(addCalls[0][0].addRules[0].action.requestHeaders[0].header).toBe('X-Test');
    });

    test('storage.local.get throws → calls clearAllRules, does not propagate', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('storage error'));
      const clearSpy = vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await expect(background.loadAndApplyRules()).resolves.not.toThrow();
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  // ─── setupMessageHandlers ────────────────────────────────────────────────

  describe('setupMessageHandlers', () => {
    test('registers onMessage and storage.onChanged listeners', () => {
      background.setupMessageHandlers();

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('updateHeaders message → calls applyHeaderRules with data', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules').mockResolvedValue(undefined);
      background.setupMessageHandlers();

      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const testData = { enabled: true, paused: false, profiles: {}, currentProfile: 'p' };
      listener({ action: 'updateHeaders', data: testData }, {}, vi.fn());
      await Promise.resolve();

      expect(applySpy).toHaveBeenCalledWith(testData);
    });

    test('clearUpdateBadge message → action.setBadgeText with empty string', () => {
      background.setupMessageHandlers();

      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      listener({ action: 'clearUpdateBadge' }, {}, vi.fn());

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    test('storage.onChanged with headerEditorData in local area → loadAndApplyRules', async () => {
      const loadSpy = vi.spyOn(background, 'loadAndApplyRules').mockResolvedValue(undefined);
      background.setupMessageHandlers();

      const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
      listener({ headerEditorData: { newValue: {} } }, 'local');
      await Promise.resolve();

      expect(loadSpy).toHaveBeenCalled();
    });

    test('storage.onChanged in sync area → does NOT call loadAndApplyRules', async () => {
      const loadSpy = vi.spyOn(background, 'loadAndApplyRules').mockResolvedValue(undefined);
      background.setupMessageHandlers();

      const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
      listener({ headerEditorData: { newValue: {} } }, 'sync');
      await Promise.resolve();

      expect(loadSpy).not.toHaveBeenCalled();
    });
  });

  // ─── setupUpdateNotifications ────────────────────────────────────────────

  describe('setupUpdateNotifications', () => {
    test('registers onInstalled listener', () => {
      background.setupUpdateNotifications();

      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('reason update → badge NEW + stores updateNotification', () => {
      background.setupUpdateNotifications();

      const listener = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      listener({ reason: 'update', previousVersion: '2.0.0' });

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'NEW' });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4caf50' });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updateNotification: expect.objectContaining({
            previousVersion: '2.0.0',
            shown: false,
          }),
        })
      );
    });

    test('reason install → stores welcomeNotification', () => {
      background.setupUpdateNotifications();

      const listener = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      listener({ reason: 'install' });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          welcomeNotification: expect.objectContaining({ shown: false }),
        })
      );
    });
  });

  // ─── addRules ────────────────────────────────────────────────────────────

  describe('addRules', () => {
    test('calls updateDynamicRules with addRules and tracks id in activeRules', async () => {
      const rules = [{ id: 42, priority: 1 }];
      await background.addRules(rules);

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        addRules: rules,
      });
      expect(background.activeRules.has(42)).toBe(true);
    });

    test('batch failure → falls back to per-rule addition', async () => {
      chrome.declarativeNetRequest.updateDynamicRules
        .mockRejectedValueOnce(new Error('batch fail'))
        .mockResolvedValueOnce(undefined);

      const rules = [{ id: 99, priority: 1 }];
      await background.addRules(rules);

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledTimes(2);
      expect(background.activeRules.has(99)).toBe(true);
    });

    test('both batch and individual fail → does not throw', async () => {
      chrome.declarativeNetRequest.updateDynamicRules.mockRejectedValue(new Error('always fail'));

      await expect(background.addRules([{ id: 77, priority: 1 }])).resolves.not.toThrow();
    });
  });
});
