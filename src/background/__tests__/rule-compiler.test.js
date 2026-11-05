import { describe, test, expect } from 'vitest';
import {
  buildConditions,
  buildModifyHeadersRules,
  compileRules,
  PRIORITY,
} from '../rule-compiler.js';

// ─── buildModifyHeadersRules ────────────────────────────────────────────

describe('buildModifyHeadersRules', () => {
  // No filters → buildConditions yields the single unrestricted condition
  const requestRules = headers =>
    buildModifyHeadersRules(headers, 'requestHeaders', buildConditions(undefined, null));

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

  test('rules carry no id — the background assigns them on apply', () => {
    const [rule] = requestRules([{ name: 'X-A', value: 'a', enabled: true }]);
    expect(rule).not.toHaveProperty('id');
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
    const conditions = buildConditions({ domains: { enabled: true, list: ['example.com'] } }, null);
    const rules = buildModifyHeadersRules(
      [{ name: 'X-H', value: 'v', enabled: true }],
      'requestHeaders',
      conditions
    );
    expect(rules).toHaveLength(2);
    expect(rules[0].action).toEqual(rules[1].action);
  });
});

// ─── buildConditions / activeDomainList ──────────────────────────────────

describe('buildConditions', () => {
  test('no filters → single unrestricted condition', () => {
    const conditions = buildConditions(undefined, null);
    expect(conditions).toHaveLength(1);
    expect(conditions[0].urlFilter).toBe('*');
    expect(conditions[0].requestDomains).toBeUndefined();
    expect(conditions[0].tabIds).toBeUndefined();
  });

  test('domain filter → two conditions: requestDomains OR initiatorDomains', () => {
    const filters = { domains: { enabled: true, list: ['Api.Example.com', ' hub.io ', ''] } };
    const conditions = buildConditions(filters, null);

    expect(conditions).toHaveLength(2);
    expect(conditions[0].requestDomains).toEqual(['api.example.com', 'hub.io']);
    expect(conditions[1].initiatorDomains).toEqual(['api.example.com', 'hub.io']);
  });

  test('domain filter disabled or empty list → unrestricted condition', () => {
    expect(buildConditions({ domains: { enabled: false, list: ['a.com'] } }, null)).toHaveLength(1);
    expect(buildConditions({ domains: { enabled: true, list: ['  '] } }, null)).toHaveLength(1);
  });

  test('tabIds are attached to every condition', () => {
    const filters = { domains: { enabled: true, list: ['a.com'] } };
    const conditions = buildConditions(filters, [7, 9]);

    expect(conditions).toHaveLength(2);
    conditions.forEach(condition => expect(condition.tabIds).toEqual([7, 9]));
  });
});

// ─── compileRules ─────────────────────────────────────────────────────────

describe('compileRules', () => {
  const header = (name, value = 'v') => ({ name, value, enabled: true });
  const data = (profiles, extra = {}) => ({
    paused: false,
    currentProfile: Object.keys(profiles)[0],
    profiles,
    ...extra,
  });

  test('no activeProfiles given → only the selected profile, as global rules', () => {
    const state = data({
      a: { requestHeaders: [header('X-A')] },
      b: { requestHeaders: [header('X-B')] },
    });

    const { dynamicRules, sessionRules } = compileRules(state);

    expect(dynamicRules).toHaveLength(1);
    expect(dynamicRules[0].action.requestHeaders[0].header).toBe('X-A');
    expect(dynamicRules[0].priority).toBe(PRIORITY.global);
    expect(sessionRules).toEqual([]);
  });

  test('paused → no rules at all', () => {
    const state = data({ a: { requestHeaders: [header('X-A')] } }, { paused: true });

    expect(compileRules(state)).toEqual({ dynamicRules: [], sessionRules: [] });
  });

  test('tab-scoped profile → session rules with tabIds and higher priority', () => {
    const state = data({ a: { requestHeaders: [header('X-A')] } });
    const active = [{ key: 'a', profile: state.profiles.a, tabIds: [4, 5] }];

    const { dynamicRules, sessionRules } = compileRules(state, active);

    expect(dynamicRules).toEqual([]);
    expect(sessionRules[0].condition.tabIds).toEqual([4, 5]);
    expect(sessionRules[0].priority).toBe(PRIORITY.tabScoped);
  });

  test('tab group resolved to no tabs → nothing for that profile', () => {
    const state = data({ a: { requestHeaders: [header('X-A')] } });
    const active = [{ key: 'a', profile: state.profiles.a, tabIds: [] }];

    expect(compileRules(state, active)).toEqual({ dynamicRules: [], sessionRules: [] });
  });

  test('disabled headers and fields outside the rules (note, description) are ignored', () => {
    const state = data({
      a: {
        description: 'whatever',
        requestHeaders: [
          { ...header('X-A'), note: 'why' },
          { ...header('X-Off'), enabled: false },
        ],
      },
    });

    const [rule] = compileRules(state).dynamicRules;

    expect(rule.action.requestHeaders).toEqual([{ header: 'X-A', operation: 'set', value: 'v' }]);
  });

  test('same input → same output (deterministic, comparable between runs)', () => {
    const state = data({
      a: { requestHeaders: [header('X-A')], responseHeaders: [header('X-R')] },
    });

    expect(compileRules(state)).toEqual(compileRules(state));
  });
});
