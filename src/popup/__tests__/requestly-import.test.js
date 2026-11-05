import { describe, test, expect } from 'vitest';
import { parseRequestlyExport } from '../requestly-import.js';

// Fixtures follow the shape Requestly writes to `requestly_export_<date>.json`:
// a flat array with the rules first and their groups after them.

let counter = 0;

function pair(source, destination, extra = {}) {
  return {
    id: `pair_${++counter}`,
    source: { key: 'Url', filters: [{}], ...source },
    destination,
    destinationType: 'url',
    ...extra,
  };
}

function redirectRule(pairs, extra = {}) {
  return {
    id: `Redirect_${++counter}`,
    name: 'Redirect rule',
    description: '',
    objectType: 'rule',
    ruleType: 'Redirect',
    status: 'Active',
    groupId: '',
    isSample: false,
    schemaVersion: '3.0.0',
    creationDate: 1730000000000,
    modificationDate: 1730000000000,
    pairs,
    ...extra,
  };
}

function group(id, name, status = 'Active') {
  return {
    id,
    name,
    description: '',
    objectType: 'group',
    status,
    children: [],
    creationDate: 1730000000000,
    modificationDate: 1730000000000,
  };
}

function patternFor(source) {
  const { profiles } = parseRequestlyExport([redirectRule([pair(source, 'https://target.test/')])]);
  return profiles[0].redirects[0].pattern;
}

describe('URL source operators', () => {
  test('Equals escapes the value and anchors both ends', () => {
    expect(patternFor({ operator: 'Equals', value: 'https://api.example.com/v1?x=1' })).toBe(
      '^https://api\\.example\\.com/v1\\?x=1$'
    );
  });

  test('Contains escapes the value without anchors', () => {
    expect(patternFor({ operator: 'Contains', value: 'example.com/app.js' })).toBe(
      'example\\.com/app\\.js'
    );
  });

  test('Matches strips the /.../ delimiters', () => {
    expect(patternFor({ operator: 'Matches', value: '/^https://cdn\\.example\\.com/(.*)$/' })).toBe(
      '^https://cdn\\.example\\.com/(.*)$'
    );
  });

  test('Matches with the i flag prefixes (?i)', () => {
    expect(patternFor({ operator: 'Matches', value: '/example\\.com/(v\\d+)/ig' })).toBe(
      '(?i)example\\.com/(v\\d+)'
    );
  });

  test('Matches with other flags drops them', () => {
    expect(patternFor({ operator: 'Matches', value: '/example\\.com/gm' })).toBe('example\\.com');
  });

  test('Matches without delimiters keeps the value as-is', () => {
    expect(patternFor({ operator: 'Matches', value: 'example\\.com/(.*)' })).toBe(
      'example\\.com/(.*)'
    );
  });

  test('Wildcard_Matches turns each * into a capture group and anchors', () => {
    expect(patternFor({ operator: 'Wildcard_Matches', value: 'https://*.example.com/*?v=1' })).toBe(
      '^https://(.*)\\.example\\.com/(.*)\\?v=1$'
    );
  });

  test('converted patterns match the URLs Requestly would match', () => {
    const cases = [
      [{ operator: 'Equals', value: 'https://a.test/x' }, 'https://a.test/x', 'https://a.test/xy'],
      [{ operator: 'Contains', value: 'a.test' }, 'https://www.a.test/', 'https://aXtest/'],
      [
        { operator: 'Wildcard_Matches', value: 'https://*.a.test/*' },
        'https://cdn.a.test/f.js',
        'http://cdn.a.test/',
      ],
    ];
    for (const [source, hit, miss] of cases) {
      const regex = new RegExp(patternFor(source));
      expect(regex.test(hit)).toBe(true);
      expect(regex.test(miss)).toBe(false);
    }
  });

  test('wildcard capture groups line up with $1, $2 in the target', () => {
    const regex = new RegExp(
      patternFor({ operator: 'Wildcard_Matches', value: 'https://*.prod.test/*' })
    );
    expect('https://api.prod.test/v1/users'.replace(regex, 'http://localhost/$1/$2')).toBe(
      'http://localhost/api/v1/users'
    );
  });
});

describe('host source operators', () => {
  test('Equals matches that exact host with any path', () => {
    const pattern = patternFor({ key: 'host', operator: 'Equals', value: 'api.example.com' });
    const regex = new RegExp(pattern);
    expect(regex.test('https://api.example.com/v1?x=1')).toBe(true);
    expect(regex.test('http://api.example.com')).toBe(true);
    expect(regex.test('https://api.example.com.evil.test/')).toBe(false);
  });

  test('Contains matches the substring inside the host only', () => {
    const regex = new RegExp(patternFor({ key: 'host', operator: 'Contains', value: 'example' }));
    expect(regex.test('https://cdn.example.com/a')).toBe(true);
    expect(regex.test('https://other.test/example')).toBe(false);
  });

  test('Wildcard_Matches captures within the host', () => {
    const regex = new RegExp(
      patternFor({ key: 'host', operator: 'Wildcard_Matches', value: '*.example.com' })
    );
    expect(regex.test('https://cdn.example.com/a')).toBe(true);
    expect(regex.test('https://example.com/x.example.com')).toBe(false);
    expect('https://cdn.example.com/a'.replace(regex, '$1')).toBe('cdn');
  });

  test('Matches on host and any path source are skipped', () => {
    const result = parseRequestlyExport([
      redirectRule([
        pair({ key: 'host', operator: 'Matches', value: '/example/' }, 'https://t.test/'),
        pair({ key: 'path', operator: 'Contains', value: '/api' }, 'https://t.test/'),
      ]),
    ]);
    expect(result).toEqual({ profiles: [], skipped: 2 });
  });
});

describe('rules, pairs and status', () => {
  test('each pair becomes one redirect with the trimmed destination as target', () => {
    const { profiles } = parseRequestlyExport([
      redirectRule([
        pair({ operator: 'Contains', value: 'a.test' }, ' https://local.test/a '),
        pair({ operator: 'Contains', value: 'b.test' }, 'https://local.test/b'),
      ]),
    ]);
    expect(profiles[0].redirects).toEqual([
      { pattern: 'a\\.test', target: 'https://local.test/a', enabled: true, cors: false },
      { pattern: 'b\\.test', target: 'https://local.test/b', enabled: true, cors: false },
    ]);
  });

  test('enabled follows the rule status', () => {
    const { profiles } = parseRequestlyExport([
      redirectRule([pair({ operator: 'Contains', value: 'on' }, 'https://t.test/')], {
        status: 'Active',
      }),
      redirectRule([pair({ operator: 'Contains', value: 'off' }, 'https://t.test/')], {
        status: 'Inactive',
      }),
    ]);
    expect(profiles[0].redirects.map(r => r.enabled)).toEqual([true, false]);
  });

  test('rules inside an inactive group are imported disabled', () => {
    const { profiles } = parseRequestlyExport([
      redirectRule([pair({ operator: 'Contains', value: 'x' }, 'https://t.test/')], {
        groupId: 'Group_off',
      }),
      group('Group_off', 'Paused', 'Inactive'),
    ]);
    expect(profiles[0].redirects[0].enabled).toBe(false);
  });

  test('redirects have no id', () => {
    const { profiles } = parseRequestlyExport([
      redirectRule([pair({ operator: 'Contains', value: 'x' }, 'https://t.test/')]),
    ]);
    expect(profiles[0].redirects[0]).not.toHaveProperty('id');
  });

  test('pairs with a local file, mock or empty destination are skipped', () => {
    const result = parseRequestlyExport([
      redirectRule([
        pair({ operator: 'Contains', value: 'a' }, '/Users/me/app.js', {
          destinationType: 'map_local',
        }),
        pair({ operator: 'Contains', value: 'b' }, 'file:///Users/me/app.js'),
        pair({ operator: 'Contains', value: 'c' }, 'https://mock.test/', {
          destinationType: 'mock_or_file_picker',
        }),
        pair({ operator: 'Contains', value: 'd' }, ''),
        pair({ operator: 'Contains', value: '' }, 'https://t.test/'),
        pair({ operator: 'Contains', value: 'e' }, 'https://t.test/e'),
      ]),
    ]);
    expect(result.skipped).toBe(5);
    expect(result.profiles[0].redirects.map(r => r.target)).toEqual(['https://t.test/e']);
  });

  test('pairs from older exports without destinationType are treated as URLs', () => {
    const legacyPair = pair({ operator: 'Contains', value: 'x' }, 'https://t.test/');
    delete legacyPair.destinationType;
    const { profiles } = parseRequestlyExport([redirectRule([legacyPair])]);
    expect(profiles[0].redirects).toHaveLength(1);
  });
});

describe('groups', () => {
  test('one profile per group, ungrouped rules under groupName null', () => {
    const result = parseRequestlyExport([
      redirectRule([pair({ operator: 'Contains', value: 'staging' }, 'https://staging.test/')], {
        groupId: 'Group_staging',
      }),
      redirectRule([pair({ operator: 'Contains', value: 'loose' }, 'https://loose.test/')]),
      redirectRule([pair({ operator: 'Contains', value: 'staging2' }, 'https://staging.test/2')], {
        groupId: 'Group_staging',
      }),
      redirectRule([pair({ operator: 'Contains', value: 'local' }, 'http://localhost:3000/')], {
        groupId: 'Group_local',
      }),
      group('Group_staging', 'Staging'),
      group('Group_local', 'Local dev'),
    ]);
    expect(result.skipped).toBe(0);
    expect(result.profiles.map(p => [p.groupName, p.redirects.length])).toEqual([
      ['Staging', 2],
      [null, 1],
      ['Local dev', 1],
    ]);
  });

  test('a groupId that points to no group counts as ungrouped', () => {
    const { profiles } = parseRequestlyExport([
      redirectRule([pair({ operator: 'Contains', value: 'x' }, 'https://t.test/')], {
        groupId: 'Group_gone',
      }),
    ]);
    expect(profiles[0].groupName).toBeNull();
  });

  test('groups without Redirect rules produce no profile', () => {
    const { profiles } = parseRequestlyExport([
      redirectRule([pair({ operator: 'Contains', value: 'x' }, 'https://t.test/')]),
      { ...redirectRule([]), ruleType: 'Headers', groupId: 'Group_headers' },
      group('Group_headers', 'Only headers'),
      group('Group_empty', 'Empty'),
    ]);
    expect(profiles.map(p => p.groupName)).toEqual([null]);
  });
});

describe('mixed rule types', () => {
  test('non-Redirect rules are skipped and counted', () => {
    const result = parseRequestlyExport([
      { ...redirectRule([]), ruleType: 'Headers', pairs: [{ modifications: {} }] },
      { ...redirectRule([]), ruleType: 'Replace', pairs: [{ from: 'a', to: 'b' }] },
      { ...redirectRule([]), ruleType: 'Cancel' },
      redirectRule([pair({ operator: 'Contains', value: 'x' }, 'https://t.test/')]),
    ]);
    expect(result.skipped).toBe(3);
    expect(result.profiles).toHaveLength(1);
  });

  test('an export with no redirects returns no profiles', () => {
    const result = parseRequestlyExport([
      { ...redirectRule([]), ruleType: 'Headers' },
      group('G', 'G'),
    ]);
    expect(result).toEqual({ profiles: [], skipped: 1 });
  });

  test('stray non-record entries are ignored', () => {
    const result = parseRequestlyExport([
      null,
      'noise',
      redirectRule([pair({ operator: 'Contains', value: 'x' }, 'https://t.test/')]),
    ]);
    expect(result.profiles).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });
});

describe('unrecognised input', () => {
  test.each([
    ['null', null],
    ['a string', 'hello'],
    ['an empty array', []],
    ['an array without Requestly records', [{ name: 'X-Foo', value: 'bar' }]],
    ['a Header Editor export', { profiles: {}, currentProfile: 'default' }],
    ['a Requestly array wrapped in an object', { rules: [redirectRule([])] }],
  ])('throws notRequestlyExport for %s', (_label, input) => {
    expect(() => parseRequestlyExport(input)).toThrow(
      expect.objectContaining({ code: 'notRequestlyExport' })
    );
  });
});
