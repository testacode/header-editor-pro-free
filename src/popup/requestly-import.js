/**
 * Requestly import — turn a Requestly rules export into per-group redirect lists.
 * Pure function: no DOM, no chrome.*, no translations.
 *
 * Format verified 2026-11-05 against requestly/interceptor@3ba50dc (the
 * HTTP Interceptor source moved there from requestly/requestly in June 2026):
 * - Export file = flat JSON array of rules followed by groups:
 *   app/src/components/common/SharingModal/actions.ts (prepareContentToExport)
 * - Record shapes (objectType, status, groupId, pairs, source.key/operator):
 *   shared/src/types/entities/rules/{base,rule}.ts
 * - Operator semantics mirrored from Requestly's own MV3 conversion:
 *   app/src/modules/extension/mv3RuleParser/utils.ts (parseUrlParametersFromSourceV2)
 * https://github.com/requestly/interceptor/tree/3ba50dcd96be7f0d82b10c2aa41d646a717cd968
 */

const ACTIVE = 'Active';
const INACTIVE = 'Inactive';

// Anything after the host: path, query or fragment (or nothing).
const REST_OF_URL = '(?:[/?#].*)?';
const HOST_CHARS = '[^/?#]*';

// Why a rule (or one of its pairs) was left out. The caller translates these.
export const SKIP_REASON = {
  notRedirect: 'notRedirect', // other rule types (headers, mocks…) aren't redirects
  hasFilters: 'hasFilters', // method/resource/page filters we can't express: it would redirect more
  unsupportedSource: 'unsupportedSource', // path, host+Matches
  incomplete: 'incomplete', // empty source or destination
  localDestination: 'localDestination', // local file or mock: only exists inside Requestly
};

/**
 * @param {unknown} data - Parsed JSON of a Requestly export.
 * @returns {{ profiles: Array<{ groupName: string|null, redirects: Array<{ pattern: string, target: string, enabled: boolean, cors: false }> }>, skipped: Array<{ name: string, reason: string }> }}
 *   `groupName: null` holds the rules that belong to no group.
 *   `skipped` lists each rule left out (once per reason), so the user can see
 *   which ones didn't make it.
 * @throws {Error} with `code = 'notRequestlyExport'` when `data` is not a Requestly export.
 */
export function parseRequestlyExport(data) {
  if (!isRequestlyExport(data)) {
    const error = new Error('Not a Requestly rules export');
    error.code = 'notRequestlyExport';
    throw error;
  }

  const groups = new Map(data.filter(r => r?.objectType === 'group').map(g => [g.id, g]));
  const profiles = new Map(); // groupId (or null) → profile, in order of first appearance
  const skipped = new Map(); // `${name}|${reason}` → entry, one per rule and reason
  const skip = (rule, reason) => {
    const name = typeof rule.name === 'string' && rule.name.trim() ? rule.name.trim() : '';
    skipped.set(`${name}|${reason}`, { name, reason });
  };

  for (const rule of data) {
    if (rule?.objectType !== 'rule') {
      continue;
    }
    if (rule.ruleType !== 'Redirect' || !Array.isArray(rule.pairs)) {
      skip(rule, SKIP_REASON.notRedirect);
      continue;
    }

    // Like Requestly's own importer, a groupId that points nowhere means ungrouped.
    const group = groups.get(rule.groupId) || null;
    const enabled = rule.status === ACTIVE && group?.status !== INACTIVE;

    for (const pair of rule.pairs) {
      const { redirect, reason } = pairToRedirect(pair, enabled);
      if (!redirect) {
        skip(rule, reason);
        continue;
      }
      const key = group?.id ?? null;
      if (!profiles.has(key)) {
        profiles.set(key, { groupName: group?.name ?? null, redirects: [] });
      }
      profiles.get(key).redirects.push(redirect);
    }
  }

  return { profiles: [...profiles.values()], skipped: [...skipped.values()] };
}

function isRequestlyExport(data) {
  return (
    Array.isArray(data) &&
    data.some(r => r && (r.objectType === 'rule' || r.objectType === 'group'))
  );
}

function pairToRedirect(pair, enabled) {
  const target = typeof pair?.destination === 'string' ? pair.destination.trim() : '';
  const sourceValue = typeof pair?.source?.value === 'string' ? pair.source.value.trim() : '';
  if (!target || !sourceValue) {
    return { reason: SKIP_REASON.incomplete };
  }
  // Local files and mocks only exist inside Requestly.
  if ((pair.destinationType ?? 'url') !== 'url' || target.startsWith('file://')) {
    return { reason: SKIP_REASON.localDestination };
  }
  if (hasActiveFilters(pair.source)) {
    return { reason: SKIP_REASON.hasFilters };
  }

  const pattern = sourceToPattern(pair.source);
  if (!pattern) {
    return { reason: SKIP_REASON.unsupportedSource };
  }

  return { redirect: { pattern, target, enabled, cors: false } };
}

// Requestly stores `filters: [{}]` by default; only a filter with a value
// narrows the rule. Shape: RuleSourceFilter in shared/src/types/entities/rules/rule.ts.
function hasActiveFilters(source) {
  const filters = Array.isArray(source?.filters) ? source.filters : [];
  return filters.some(
    filter =>
      Boolean(filter?.pageUrl?.value) ||
      filter?.requestMethod?.length > 0 ||
      filter?.resourceType?.length > 0 ||
      filter?.pageDomains?.length > 0 ||
      Boolean(filter?.requestPayload?.key || filter?.requestPayload?.value)
  );
}

/** Returns an RE2 pattern for the request URL, or null when unsupported. */
function sourceToPattern(source) {
  const value = typeof source?.value === 'string' ? source.value.trim() : '';
  if (!value) {
    return null;
  }

  if (source.key === 'Url') {
    switch (source.operator) {
      // Whole URL, literally.
      case 'Equals':
        return `^${escapeRegex(value)}$`;
      // Literal substring anywhere in the URL.
      case 'Contains':
        return escapeRegex(value);
      // Stored as `/regex/flags`; RE2 takes case-insensitivity as an inline `(?i)`.
      case 'Matches':
        return matchesToPattern(value);
      // Whole URL; each `*` becomes a capture group so `$1`, `$2`… keep working.
      case 'Wildcard_Matches':
        return `^${wildcardToRegex(value, '(.*)')}$`;
    }
  }

  // Host operators: the host part of an http(s) URL, any path after it.
  // Host + Matches (regex over a substring of the host) is left out.
  if (source.key === 'host') {
    switch (source.operator) {
      case 'Equals':
        return `^https?://${escapeRegex(value)}${REST_OF_URL}$`;
      case 'Contains':
        return `^https?://${HOST_CHARS}${escapeRegex(value)}${HOST_CHARS}${REST_OF_URL}$`;
      case 'Wildcard_Matches':
        return `^https?://${wildcardToRegex(value, `(${HOST_CHARS})`)}${REST_OF_URL}$`;
    }
  }

  // `path` is not supported by Requestly's own Chrome MV3 engine either.
  return null;
}

function matchesToPattern(value) {
  const delimited = value.match(/^\/(.*)\/([a-z]*)$/s);
  if (!delimited) {
    return value;
  }
  const [, body, flags] = delimited;
  if (!body) {
    return null;
  }
  return flags.includes('i') ? `(?i)${body}` : body;
}

function wildcardToRegex(value, star) {
  return value.split('*').map(escapeRegex).join(star);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
