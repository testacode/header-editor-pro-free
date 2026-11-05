import { describe, test, expect } from 'vitest';
import {
  buildConditions,
  buildCorsRules,
  REDIRECT_RESOURCE_TYPES,
  toRegexSubstitution,
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

  test('default priority is the global one', () => {
    const [rule] = requestRules([{ name: 'X-H', value: 'v', enabled: true }]);
    expect(rule.priority).toBe(PRIORITY.global);
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

// ─── redirects ────────────────────────────────────────────────────────────

describe('redirects', () => {
  const redirect = (overrides = {}) => ({
    id: 'r1',
    pattern: '^https://desa\\.example\\.com/(.*)',
    target: 'https://www.example.com/$1',
    enabled: true,
    cors: false,
    ...overrides,
  });
  const compile = (redirects, extra = {}) =>
    compileRules({
      paused: false,
      currentProfile: 'p',
      profiles: { p: { requestHeaders: [], redirects, ...extra } },
    });

  test('active redirect → regexFilter rule with \\1 substitution, no main_frame', () => {
    const [rule] = compile([redirect()]).dynamicRules;

    expect(rule.action).toEqual({
      type: 'redirect',
      redirect: { regexSubstitution: 'https://www.example.com/\\1' },
    });
    expect(rule.condition.regexFilter).toBe('^https://desa\\.example\\.com/(.*)');
    expect(rule.condition.urlFilter).toBeUndefined();
    expect(rule.condition.resourceTypes).toEqual(REDIRECT_RESOURCE_TYPES);
    expect(rule.condition.resourceTypes).not.toContain('main_frame');
    expect(rule.condition.resourceTypes).not.toContain('sub_frame');
    expect(rule.priority).toBe(PRIORITY.global);
  });

  test('disabled or incomplete redirects produce nothing', () => {
    const rules = compile([
      redirect({ enabled: false }),
      redirect({ pattern: '  ' }),
      redirect({ target: '' }),
    ]).dynamicRules;

    expect(rules).toEqual([]);
  });

  test('domain filter → one redirect rule per condition', () => {
    const rules = compile([redirect()], {
      filters: { domains: { enabled: true, list: ['example.com'] } },
    }).dynamicRules;

    expect(rules).toHaveLength(2);
    expect(rules[0].condition.requestDomains).toEqual(['example.com']);
    expect(rules[1].condition.initiatorDomains).toEqual(['example.com']);
  });

  test('tab-scoped profile → redirect lands in session rules with tabIds', () => {
    const state = {
      paused: false,
      currentProfile: 'other',
      profiles: { other: {}, p: { redirects: [redirect({ cors: true })] } },
    };
    const active = [{ key: 'p', profile: state.profiles.p, tabIds: [8] }];

    const { dynamicRules, sessionRules } = compileRules(state, active);

    expect(dynamicRules).toEqual([]);
    expect(sessionRules.map(r => r.condition.tabIds)).toEqual([[8], [8]]);
    expect(sessionRules[0].priority).toBe(PRIORITY.tabScoped);
  });

  test('cors off → no CORS rule; on → one per target host, lowest priority', () => {
    expect(compile([redirect()]).dynamicRules).toHaveLength(1);

    const rules = compile([
      redirect({ cors: true }),
      redirect({ id: 'r2', cors: true, target: 'https://www.example.com/other/$1' }),
    ]).dynamicRules;
    const cors = rules.filter(r => r.action.type === 'modifyHeaders');

    expect(cors).toHaveLength(1);
    expect(cors[0].priority).toBe(PRIORITY.cors);
    expect(cors[0].condition.requestDomains).toEqual(['www.example.com']);
    expect(cors[0].action.responseHeaders.map(h => h.header)).toContain(
      'Access-Control-Allow-Origin'
    );
  });

  test('CORS loses to any header the user sets explicitly', () => {
    expect(PRIORITY.cors).toBeLessThan(PRIORITY.global);
    expect(PRIORITY.global).toBeLessThan(PRIORITY.tabScoped);
  });

  test('target whose host is a placeholder gets no CORS rule', () => {
    expect(buildCorsRules([redirect({ target: 'https://$1/path' })], null)).toEqual([]);
  });

  test('paused → no redirects either', () => {
    const state = {
      paused: true,
      currentProfile: 'p',
      profiles: { p: { redirects: [redirect()] } },
    };
    expect(compileRules(state)).toEqual({ dynamicRules: [], sessionRules: [] });
  });
});

describe('toRegexSubstitution', () => {
  test('$n → \\n', () => {
    expect(toRegexSubstitution('https://a.com/$1?x=$2')).toBe('https://a.com/\\1?x=\\2');
  });

  test('literal backslashes are escaped so they are not read as groups', () => {
    expect(toRegexSubstitution('https://a.com/\\1')).toBe('https://a.com/\\\\1');
  });

  test('no placeholders → unchanged', () => {
    expect(toRegexSubstitution('https://a.com/static')).toBe('https://a.com/static');
  });
});
