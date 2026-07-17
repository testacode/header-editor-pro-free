import { describe, test, expect, beforeEach, vi } from 'vitest';
import { HeaderEditorBackground } from '../background.js';

// The module-level `new HeaderEditorBackground()` at the bottom of background.js
// runs once on import. setup.js mocks chrome.* and console, so it is harmless.

// With fake timers active, start an async op then drain the Firefox DNR delays
// (this.delay → setTimeout) so the returned promise can settle. Safe no-op when
// the call path schedules no timers (e.g. Chrome, or early-exit paths).
async function settle(promise) {
  await vi.runAllTimersAsync();
  return promise;
}

describe('HeaderEditorBackground', () => {
  let background;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Restore default implementations for mocks that tests may override with
    // mockRejectedValue/mockResolvedValue — vi.clearAllMocks does NOT reset these.
    chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue(undefined);
    chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue(undefined);
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.tabGroups.get.mockResolvedValue({ id: 1, title: '', color: 'grey' });
    chrome.tabGroups.query.mockResolvedValue([]);
    chrome.tabs.query.mockResolvedValue([]);
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

  afterEach(() => {
    vi.useRealTimers();
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
    test('returns false when browser is just the Chrome 137+ alias (no getBrowserInfo)', () => {
      // setup.js sets global.browser = global.chrome, whose runtime mock has
      // no getBrowserInfo — exactly what modern Chrome exposes.
      expect(background.detectFirefox()).toBe(false);
    });

    test('returns true when browser.runtime.getBrowserInfo exists (Firefox)', () => {
      vi.stubGlobal('browser', { runtime: { getBrowserInfo: vi.fn() } });
      try {
        expect(background.detectFirefox()).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    test('returns true when the user agent mentions Firefox', () => {
      vi.stubGlobal('browser', undefined);
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Firefox/139.0)' });
      try {
        expect(background.detectFirefox()).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
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

  // ─── createModifyHeadersRules ────────────────────────────────────────────

  describe('createModifyHeadersRules', () => {
    // No filters → buildConditions yields the single unrestricted condition
    const requestRules = headers =>
      background.createModifyHeadersRules(
        headers,
        'requestHeaders',
        background.buildConditions(undefined, null)
      );

    test('returns one rule with modifyHeaders action and 13 resourceTypes', () => {
      const rules = requestRules([
        { name: 'Authorization', value: 'Bearer token', enabled: true },
        { name: 'X-Custom', value: 'val', enabled: true },
      ]);

      expect(rules).toHaveLength(1);
      expect(rules[0].action.type).toBe('modifyHeaders');
      expect(rules[0].condition.urlFilter).toBe('*');
      expect(rules[0].condition.resourceTypes).toHaveLength(13);
      expect(rules[0].action.requestHeaders).toHaveLength(2);
    });

    test('increments id on successive calls', () => {
      const startId = background.currentRuleId;
      const headers = [{ name: 'X-A', value: 'a', enabled: true }];
      const [rule1] = requestRules(headers);
      const [rule2] = requestRules(headers);
      expect(rule1.id).toBe(startId);
      expect(rule2.id).toBe(startId + 1);
    });

    test('value present → operation set', () => {
      const [rule] = requestRules([{ name: 'X-H', value: 'something', enabled: true }]);
      expect(rule.action.requestHeaders[0].operation).toBe('set');
      expect(rule.action.requestHeaders[0].value).toBe('something');
    });

    test('empty value → operation remove, value undefined', () => {
      const [rule] = requestRules([{ name: 'X-Remove', value: '', enabled: true }]);
      expect(rule.action.requestHeaders[0].operation).toBe('remove');
      expect(rule.action.requestHeaders[0].value).toBeUndefined();
    });

    test('all headers without name → empty array', () => {
      const rules = requestRules([
        { name: '', value: 'x', enabled: true },
        { name: '   ', value: 'y', enabled: true },
      ]);
      expect(rules).toEqual([]);
    });

    test('empty array → empty array', () => {
      expect(requestRules([])).toEqual([]);
    });

    test('filters headers without truthy name, keeps valid ones', () => {
      const [rule] = requestRules([
        { name: '', value: 'skip', enabled: true },
        { name: 'Valid', value: 'keep', enabled: true },
      ]);
      expect(rule.action.requestHeaders).toHaveLength(1);
      expect(rule.action.requestHeaders[0].header).toBe('Valid');
    });

    test('resourceTypes contains all 13 expected types', () => {
      const [rule] = requestRules([{ name: 'X-H', value: 'v', enabled: true }]);
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
      const [rule] = requestRules([{ name: 'X-H', value: 'v', enabled: true }]);
      expect(rule.priority).toBe(1);
    });

    test('one rule per condition, same action in each', () => {
      const conditions = background.buildConditions(
        { domains: { enabled: true, list: ['example.com'] } },
        null
      );
      const rules = background.createModifyHeadersRules(
        [{ name: 'X-H', value: 'v', enabled: true }],
        'requestHeaders',
        conditions
      );
      expect(rules).toHaveLength(2);
      expect(rules[0].action).toEqual(rules[1].action);
      expect(rules[0].id).not.toBe(rules[1].id);
    });
  });

  // ─── buildConditions / activeDomainList ──────────────────────────────────

  describe('buildConditions', () => {
    test('no filters → single unrestricted condition', () => {
      const conditions = background.buildConditions(undefined, null);
      expect(conditions).toHaveLength(1);
      expect(conditions[0].urlFilter).toBe('*');
      expect(conditions[0].requestDomains).toBeUndefined();
      expect(conditions[0].tabIds).toBeUndefined();
    });

    test('domain filter → two conditions: requestDomains OR initiatorDomains', () => {
      const filters = { domains: { enabled: true, list: ['Api.Example.com', ' hub.io ', ''] } };
      const conditions = background.buildConditions(filters, null);

      expect(conditions).toHaveLength(2);
      expect(conditions[0].requestDomains).toEqual(['api.example.com', 'hub.io']);
      expect(conditions[1].initiatorDomains).toEqual(['api.example.com', 'hub.io']);
    });

    test('domain filter disabled or empty list → unrestricted condition', () => {
      expect(
        background.buildConditions({ domains: { enabled: false, list: ['a.com'] } }, null)
      ).toHaveLength(1);
      expect(
        background.buildConditions({ domains: { enabled: true, list: ['  '] } }, null)
      ).toHaveLength(1);
    });

    test('tabIds are attached to every condition', () => {
      const filters = { domains: { enabled: true, list: ['a.com'] } };
      const conditions = background.buildConditions(filters, [7, 9]);

      expect(conditions).toHaveLength(2);
      conditions.forEach(condition => expect(condition.tabIds).toEqual([7, 9]));
    });
  });

  // ─── resolveTabIds ───────────────────────────────────────────────────────

  describe('resolveTabIds', () => {
    const groupFilters = {
      tabGroup: { enabled: true, group: { id: 42, title: 'SANDBOX', color: 'purple' } },
    };

    test('filter disabled or without group → null', async () => {
      expect(await background.resolveTabIds(undefined)).toBeNull();
      expect(
        await background.resolveTabIds({ tabGroup: { enabled: false, group: null } })
      ).toBeNull();
      expect(
        await background.resolveTabIds({ tabGroup: { enabled: true, group: null } })
      ).toBeNull();
    });

    test('Firefox → null with warning (unsupported)', async () => {
      background.isFirefox = true;
      expect(await background.resolveTabIds(groupFilters)).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });

    test('group exists → returns ids of its tabs', async () => {
      background.isFirefox = false;
      chrome.tabGroups.get.mockResolvedValue({ id: 42 });
      chrome.tabs.query.mockResolvedValue([{ id: 7 }, { id: 9 }]);

      expect(await background.resolveTabIds(groupFilters)).toEqual([7, 9]);
      expect(chrome.tabs.query).toHaveBeenCalledWith({ groupId: 42 });
    });

    test('group id gone (browser restart) → re-matches by title+color', async () => {
      background.isFirefox = false;
      chrome.tabGroups.get.mockRejectedValue(new Error('No group with id 42'));
      chrome.tabGroups.query.mockResolvedValue([{ id: 77 }]);
      chrome.tabs.query.mockResolvedValue([{ id: 3 }]);

      expect(await background.resolveTabIds(groupFilters)).toEqual([3]);
      expect(chrome.tabGroups.query).toHaveBeenCalledWith({ title: 'SANDBOX', color: 'purple' });
      expect(chrome.tabs.query).toHaveBeenCalledWith({ groupId: 77 });
    });

    test('no re-match candidates → empty array (headers apply nowhere)', async () => {
      background.isFirefox = false;
      chrome.tabGroups.get.mockRejectedValue(new Error('gone'));
      chrome.tabGroups.query.mockResolvedValue([]);

      expect(await background.resolveTabIds(groupFilters)).toEqual([]);
    });

    test('ambiguous re-match (multiple candidates) → empty array, warning logged, tabs.query NOT called', async () => {
      background.isFirefox = false;
      chrome.tabGroups.get.mockRejectedValue(new Error('gone'));
      chrome.tabGroups.query.mockResolvedValue([
        { id: 77, title: 'SANDBOX', color: 'purple' },
        { id: 88, title: 'SANDBOX', color: 'purple' },
      ]);

      expect(await background.resolveTabIds(groupFilters)).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        'HeaderEditor: 2 tab groups match "SANDBOX" (purple); not applying the tab group filter to avoid scoping headers to the wrong tabs'
      );
      expect(chrome.tabs.query).not.toHaveBeenCalled();
    });

    test('tabs.query failure → empty array, error logged', async () => {
      background.isFirefox = false;
      chrome.tabGroups.get.mockResolvedValue({ id: 42 });
      chrome.tabs.query.mockRejectedValue(new Error('boom'));

      expect(await background.resolveTabIds(groupFilters)).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  // ─── session rules (tab group scoping) ───────────────────────────────────

  describe('tab group session rules', () => {
    const dataWithHeaders = {
      enabled: true,
      paused: false,
      profiles: { p: { requestHeaders: [{ name: 'X', value: 'v', enabled: true }] } },
      currentProfile: 'p',
    };

    const activeOf = (data, key, tabIds) => [{ key, profile: data.profiles[key], tabIds }];

    test('applyHeaderRules with tabIds → session rules with priority 2, not dynamic', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules(dataWithHeaders, activeOf(dataWithHeaders, 'p', [7, 9]))
      );

      const sessionAdds = chrome.declarativeNetRequest.updateSessionRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(sessionAdds).toHaveLength(1);
      expect(sessionAdds[0][0].addRules[0].condition.tabIds).toEqual([7, 9]);
      expect(sessionAdds[0][0].addRules[0].priority).toBe(2);

      const dynamicAdds = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(dynamicAdds).toHaveLength(0);
    });

    test('applyHeaderRules with empty tabIds → no rules at all', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules(dataWithHeaders, activeOf(dataWithHeaders, 'p', []))
      );

      const anyAdds = [
        ...chrome.declarativeNetRequest.updateSessionRules.mock.calls,
        ...chrome.declarativeNetRequest.updateDynamicRules.mock.calls,
      ].filter(c => c[0].addRules);
      expect(anyAdds).toHaveLength(0);
    });

    test('selected global profile + scoped profile apply concurrently', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);
      const data = {
        enabled: true,
        paused: false,
        currentProfile: 'default',
        profiles: {
          default: { requestHeaders: [{ name: 'X-Global', value: 'g', enabled: true }] },
          sandbox: { requestHeaders: [{ name: 'X-Sandbox', value: 's', enabled: true }] },
        },
      };
      const active = [
        { key: 'default', profile: data.profiles.default, tabIds: null },
        { key: 'sandbox', profile: data.profiles.sandbox, tabIds: [3] },
      ];

      await settle(background.applyHeaderRules(data, active));

      const dynamicAdds = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(dynamicAdds[0][0].addRules[0].action.requestHeaders[0].header).toBe('X-Global');

      const sessionAdds = chrome.declarativeNetRequest.updateSessionRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(sessionAdds[0][0].addRules[0].action.requestHeaders[0].header).toBe('X-Sandbox');
      expect(sessionAdds[0][0].addRules[0].condition.tabIds).toEqual([3]);
    });

    test('resolveActiveProfiles skips non-selected profiles without tab scope', async () => {
      background.isFirefox = false;
      chrome.tabGroups.get.mockResolvedValue({ id: 42 });
      chrome.tabs.query.mockResolvedValue([{ id: 7 }]);
      const data = {
        currentProfile: 'default',
        profiles: {
          default: { requestHeaders: [] },
          scoped: {
            requestHeaders: [],
            filters: {
              tabGroup: { enabled: true, group: { id: 42, title: 'SANDBOX', color: 'purple' } },
            },
          },
          inactive: { requestHeaders: [{ name: 'X', value: 'v', enabled: true }] },
        },
      };

      const active = await background.resolveActiveProfiles(data);

      expect(active.map(a => a.key)).toEqual(['default', 'scoped']);
      expect(active[0].tabIds).toBeNull();
      expect(active[1].tabIds).toEqual([7]);
    });

    test('clearAllRules also clears existing session rules', async () => {
      chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([{ id: 11 }, { id: 12 }]);

      await settle(background.clearAllRules());

      expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith(
        expect.objectContaining({ removeRuleIds: [11, 12] })
      );
    });

    test('setupTabGroupTracking registers listeners on Chrome', () => {
      background.isFirefox = false;
      background.setupTabGroupTracking();

      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled();
    });

    test('setupTabGroupTracking is a no-op on Firefox', () => {
      background.isFirefox = true;
      background.setupTabGroupTracking();

      expect(chrome.tabs.onUpdated.addListener).not.toHaveBeenCalled();
    });

    test('tabs.onUpdated listener reapplies only on groupId changes', () => {
      background.isFirefox = false;
      background.setupTabGroupTracking();
      const reapplySpy = vi.spyOn(background, 'loadAndApplyRules').mockResolvedValue(undefined);

      const listener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      listener(1, { status: 'complete' });
      expect(reapplySpy).not.toHaveBeenCalled();

      listener(1, { groupId: 5 });
      expect(reapplySpy).toHaveBeenCalledOnce();
    });
  });

  // ─── clearAllRules ───────────────────────────────────────────────────────

  describe('clearAllRules', () => {
    test('removes all existing rule ids and clears activeRules', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([{ id: 1 }, { id: 5 }]);
      background.activeRules.add(1);
      background.activeRules.add(5);

      await settle(background.clearAllRules());

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
        expect.objectContaining({ removeRuleIds: [1, 5] })
      );
      expect(background.activeRules.size).toBe(0);
    });

    test('does not call updateDynamicRules when getDynamicRules returns empty', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([]);

      await settle(background.clearAllRules());

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

      await settle(background.clearAllRules());

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
        expect.objectContaining({ removeRuleIds: [3] })
      );
      expect(background.activeRules.size).toBe(0);
    });

    test('does not throw when both getDynamicRules and fallback fail', async () => {
      chrome.declarativeNetRequest.getDynamicRules.mockRejectedValue(new Error('fail'));
      chrome.declarativeNetRequest.updateDynamicRules.mockRejectedValue(new Error('also fail'));
      background.activeRules.add(9);

      await expect(settle(background.clearAllRules())).resolves.not.toThrow();
      expect(background.activeRules.size).toBe(0);
    });
  });

  // ─── applyHeaderRules ────────────────────────────────────────────────────

  describe('applyHeaderRules', () => {
    test('always calls clearAllRules first', async () => {
      const clearSpy = vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: { p1: { requestHeaders: [] } },
          currentProfile: 'p1',
        })
      );

      expect(clearSpy).toHaveBeenCalledOnce();
    });

    test('paused:true → clearAllRules called, no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: true,
          profiles: { p: { requestHeaders: [{ name: 'X', value: 'v', enabled: true }] } },
          currentProfile: 'p',
        })
      );

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('enabled:false → clearAllRules called, no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: false,
          paused: false,
          profiles: { p: { requestHeaders: [{ name: 'X', value: 'v', enabled: true }] } },
          currentProfile: 'p',
        })
      );

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('2 enabled + 1 disabled headers → rule contains only the 2 enabled', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
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
        })
      );

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
        settle(
          background.applyHeaderRules({
            enabled: true,
            paused: false,
            profiles: { other: { requestHeaders: [] } },
            currentProfile: 'nonexistent',
          })
        )
      ).resolves.not.toThrow();

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('empty requestHeaders → no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: { p: { requestHeaders: [] } },
          currentProfile: 'p',
        })
      );

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });
  });

  // ─── response headers (plan 027) ─────────────────────────────────────────

  describe('response headers', () => {
    const addedRules = () =>
      chrome.declarativeNetRequest.updateDynamicRules.mock.calls
        .filter(c => c[0].addRules)
        .flatMap(c => c[0].addRules);

    test('response headers only → one rule with action.responseHeaders', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: {
            p: {
              requestHeaders: [],
              responseHeaders: [{ name: 'X-Resp', value: 'r', enabled: true }],
            },
          },
          currentProfile: 'p',
        })
      );

      const rules = addedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].action.responseHeaders).toHaveLength(1);
      expect(rules[0].action.responseHeaders[0]).toMatchObject({
        header: 'X-Resp',
        operation: 'set',
        value: 'r',
      });
      expect(rules[0].action.requestHeaders).toBeUndefined();
    });

    test('request + response → two rules with distinct ids', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: {
            p: {
              requestHeaders: [{ name: 'X-Req', value: 'q', enabled: true }],
              responseHeaders: [{ name: 'X-Resp', value: 'r', enabled: true }],
            },
          },
          currentProfile: 'p',
        })
      );

      const rules = addedRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].id).not.toBe(rules[1].id);
      expect(rules[0].action.requestHeaders).toBeDefined();
      expect(rules[1].action.responseHeaders).toBeDefined();
    });

    test('response header with empty value → operation remove', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: {
            p: {
              requestHeaders: [],
              responseHeaders: [{ name: 'X-Drop', value: '', enabled: true }],
            },
          },
          currentProfile: 'p',
        })
      );

      const rules = addedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].action.responseHeaders[0].operation).toBe('remove');
      expect(rules[0].action.responseHeaders[0].value).toBeUndefined();
    });

    test('disabled response headers are filtered out → no rule', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: {
            p: {
              requestHeaders: [],
              responseHeaders: [{ name: 'X-Resp', value: 'r', enabled: false }],
            },
          },
          currentProfile: 'p',
        })
      );

      expect(addedRules()).toHaveLength(0);
    });
  });

  // ─── append mode (plan 028) ──────────────────────────────────────────────

  describe('append mode', () => {
    const applyProfile = profile =>
      settle(
        background.applyHeaderRules({
          enabled: true,
          paused: false,
          profiles: { p: profile },
          currentProfile: 'p',
        })
      );
    const addedRules = () =>
      chrome.declarativeNetRequest.updateDynamicRules.mock.calls
        .filter(c => c[0].addRules)
        .flatMap(c => c[0].addRules);

    beforeEach(() => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);
    });

    test('response header with appendMode+value → operation append', async () => {
      await applyProfile({
        requestHeaders: [],
        responseHeaders: [{ name: 'Set-Cookie', value: 'a=1', enabled: true, appendMode: true }],
      });
      expect(addedRules()[0].action.responseHeaders[0].operation).toBe('append');
    });

    test('whitelisted request header (accept) with appendMode → operation append', async () => {
      await applyProfile({
        requestHeaders: [{ name: 'Accept', value: 'text/html', enabled: true, appendMode: true }],
      });
      expect(addedRules()[0].action.requestHeaders[0].operation).toBe('append');
    });

    test('non-whitelisted request header with appendMode → degraded to set + warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn');
      await applyProfile({
        requestHeaders: [{ name: 'X-Custom', value: 'v', enabled: true, appendMode: true }],
      });
      expect(addedRules()[0].action.requestHeaders[0].operation).toBe('set');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('X-Custom'));
    });

    test('appendMode without value → operation remove', async () => {
      await applyProfile({
        requestHeaders: [],
        responseHeaders: [{ name: 'X-Resp', value: '', enabled: true, appendMode: true }],
      });
      expect(addedRules()[0].action.responseHeaders[0].operation).toBe('remove');
    });

    test('mix of append/set/remove in one response rule', async () => {
      await applyProfile({
        requestHeaders: [],
        responseHeaders: [
          { name: 'X-Append', value: 'a', enabled: true, appendMode: true },
          { name: 'X-Set', value: 's', enabled: true, appendMode: false },
          { name: 'X-Remove', value: '', enabled: true, appendMode: false },
        ],
      });
      const ops = addedRules()[0].action.responseHeaders.map(h => h.operation);
      expect(ops).toEqual(['append', 'set', 'remove']);
    });
  });

  // ─── loadAndApplyRules ───────────────────────────────────────────────────

  describe('loadAndApplyRules', () => {
    test('storage empty → default profile, no addRules', async () => {
      vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);
      // Default mock returns {headerEditorData: undefined}
      await settle(background.loadAndApplyRules());

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(0);
    });

    test('storage empty → applies the shared rich default (pinned + description)', async () => {
      // Proves background and popup share one default source: the old inline
      // background default had neither `pinned` nor `profiles.default.description`.
      const applySpy = vi.spyOn(background, 'applyHeaderRules').mockResolvedValue(undefined);

      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pinned: false,
          profiles: expect.objectContaining({
            default: expect.objectContaining({ description: 'Click to edit description' }),
          }),
        }),
        expect.any(Array)
      );
    });

    test('concurrent loadAndApplyRules calls are serialized, not interleaved', async () => {
      const order = [];
      let releaseFirst;
      vi.spyOn(background, 'doLoadAndApplyRules')
        .mockImplementationOnce(async () => {
          order.push('start1');
          await new Promise(resolve => {
            releaseFirst = resolve;
          });
          order.push('end1');
        })
        .mockImplementationOnce(async () => {
          order.push('start2');
        });

      background.loadAndApplyRules();
      const second = background.loadAndApplyRules();
      await Promise.resolve();

      expect(order).toEqual(['start1']); // la segunda espera a la primera

      releaseFirst();
      await second;
      expect(order).toEqual(['start1', 'end1', 'start2']);
    });

    test('updateBadges: global letter for selected profile, per-tab for scoped', async () => {
      const data = {
        enabled: true,
        paused: false,
        currentProfile: 'default',
        profiles: {
          default: { name: 'Default', backgroundColor: '#4caf50' },
          sandbox: { name: 'sandbox', backgroundColor: '#ff9800' },
        },
      };
      const active = [
        { key: 'default', profile: data.profiles.default, tabIds: null },
        { key: 'sandbox', profile: data.profiles.sandbox, tabIds: [7] },
      ];

      await background.updateBadges(data, active);

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'D' });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4caf50' });
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: 'S' });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 7,
        color: '#ff9800',
      });
      expect(background.badgedTabIds.has(7)).toBe(true);
    });

    test('updateBadges: paused → global badge cleared, previous per-tab badges wiped', async () => {
      background.badgedTabIds.add(3);
      const data = { enabled: true, paused: true, currentProfile: 'default', profiles: {} };

      await background.updateBadges(data, []);

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '' });
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
      expect(background.badgedTabIds.size).toBe(0);
    });

    test('updateBadges: pending NEW badge is not overwritten', async () => {
      chrome.storage.local.get.mockResolvedValue({
        updateNotification: { shown: false },
      });
      const data = {
        enabled: true,
        paused: false,
        currentProfile: 'default',
        profiles: { default: { name: 'Default' } },
      };

      await background.updateBadges(data, []);

      expect(chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: 'D' });
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

      await settle(background.loadAndApplyRules());

      const addCalls = chrome.declarativeNetRequest.updateDynamicRules.mock.calls.filter(
        c => c[0].addRules
      );
      expect(addCalls).toHaveLength(1);
      expect(addCalls[0][0].addRules[0].action.requestHeaders[0].header).toBe('X-Test');
    });

    test('storage.local.get throws → calls clearAllRules, does not propagate', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('storage error'));
      const clearSpy = vi.spyOn(background, 'clearAllRules').mockResolvedValue(undefined);

      await expect(settle(background.loadAndApplyRules())).resolves.not.toThrow();
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  // ─── rule state signature (plan 022) ─────────────────────────────────────

  describe('rule state signature (plan 022)', () => {
    const baseState = () => ({
      pinned: false,
      profiles: {
        p1: {
          name: 'Profile 1',
          backgroundColor: '#111111',
          requestHeaders: [{ name: 'X-Test', value: 'hello', enabled: true }],
        },
      },
      currentProfile: 'p1',
      enabled: true,
      paused: false,
    });

    const mockStorage = state => {
      chrome.storage.local.get.mockResolvedValue({ headerEditorData: state });
    };

    test('same state twice → applyHeaderRules only called on the first loadAndApplyRules', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    test('pinned change only → second loadAndApplyRules does not re-apply', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());

      mockStorage({ ...baseState(), pinned: true });
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    test('profile description change only → second loadAndApplyRules does not re-apply', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());

      const changed = baseState();
      changed.profiles.p1.description = 'something else';
      mockStorage(changed);
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    test('profile backgroundColor change → re-applies (badge color depends on it)', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());

      const changed = baseState();
      changed.profiles.p1.backgroundColor = '#ff0000';
      mockStorage(changed);
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(2);
    });

    test('header value change → second loadAndApplyRules re-applies', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());

      const changed = baseState();
      changed.profiles.p1.requestHeaders[0].value = 'changed';
      mockStorage(changed);
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(2);
    });

    test('response header change → second loadAndApplyRules re-applies (plan 027)', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      const state = baseState();
      state.profiles.p1.responseHeaders = [{ name: 'X-Resp', value: 'a', enabled: true }];
      mockStorage(state);

      await settle(background.loadAndApplyRules());

      const changed = baseState();
      changed.profiles.p1.responseHeaders = [{ name: 'X-Resp', value: 'b', enabled: true }];
      mockStorage(changed);
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(2);
    });

    test('currentProfile change → second loadAndApplyRules re-applies', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      const state = baseState();
      state.profiles.p2 = {
        name: 'Profile 2',
        requestHeaders: [{ name: 'X-Test', value: 'hello', enabled: true }],
      };
      mockStorage(state);

      await settle(background.loadAndApplyRules());

      mockStorage({ ...state, currentProfile: 'p2' });
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(2);
    });

    test('paused change → second loadAndApplyRules re-applies', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());

      mockStorage({ ...baseState(), paused: true });
      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(2);
    });

    test('applyHeaderRules failure → signature not saved, next call with same state retries', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules');
      applySpy.mockRejectedValueOnce(new Error('boom'));
      mockStorage(baseState());

      await settle(background.loadAndApplyRules());
      expect(background.lastAppliedSignature).toBeNull();

      await settle(background.loadAndApplyRules());

      expect(applySpy).toHaveBeenCalledTimes(2);
    });
  });

  // ─── setupMessageHandlers ────────────────────────────────────────────────

  describe('setupMessageHandlers', () => {
    test('registers onMessage and storage.onChanged listeners', () => {
      background.setupMessageHandlers();

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('updateHeaders message → no longer triggers applyHeaderRules (removed handler)', async () => {
      const applySpy = vi.spyOn(background, 'applyHeaderRules').mockResolvedValue(undefined);
      background.setupMessageHandlers();

      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const testData = { enabled: true, paused: false, profiles: {}, currentProfile: 'p' };
      listener({ action: 'updateHeaders', data: testData }, {}, vi.fn());
      await Promise.resolve();

      expect(applySpy).not.toHaveBeenCalled();
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

    test('reason update with same version (unpacked reload) → no badge, no notification', () => {
      background.setupUpdateNotifications();

      const listener = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      listener({ reason: 'update', previousVersion: chrome.runtime.getManifest().version });

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ updateNotification: expect.anything() })
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

    test('individual rule fails during fallback → console.error with rule id and headers', async () => {
      chrome.declarativeNetRequest.updateDynamicRules
        .mockRejectedValueOnce(new Error('batch fail'))
        .mockRejectedValueOnce(new Error('rule 88 invalid'));

      const rules = [
        {
          id: 88,
          priority: 1,
          action: {
            requestHeaders: [
              { header: 'X-Test', operation: 'set', value: 'test' },
              { header: 'Authorization', operation: 'set', value: 'Bearer token' },
            ],
          },
        },
      ];

      await background.addRules(rules);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('HeaderEditor: dropping rule 88'),
        expect.any(Error)
      );
      // The dropping rule message is the second console.error call (first is batch failure)
      const dropMessage = console.error.mock.calls.find(call =>
        call[0].includes('HeaderEditor: dropping rule 88')
      )?.[0];
      expect(dropMessage).toContain('X-Test');
      expect(dropMessage).toContain('Authorization');
    });
  });
});
