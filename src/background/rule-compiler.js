// Pure translation from the stored state to declarativeNetRequest rules.
//
// No chrome.* calls in here: the background resolves what depends on the
// browser (which tabs a tab group covers right now) and then asks this module
// what the rules should be. Rules come out without ids — ids depend on what is
// already installed, so the background assigns them when it applies them.
// That also makes the output comparable between runs (see ruleStateSignature).

import { isHeaderEnabled } from '../popup/header-normalize.js';

// When two rules touch the same header on the same request, the higher
// priority wins. Tab-scoped profiles outrank the selected profile's global
// rules inside their tab group.
export const PRIORITY = {
  global: 1,
  tabScoped: 2,
};

export const RESOURCE_TYPES = [
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
];

// Chrome's declarativeNetRequest only allows the `append` operation on this set
// of REQUEST headers; response headers have no such restriction. Emitting an
// append rule for a request header outside this list makes updateDynamicRules
// reject the whole rule, so we degrade to `set` with a warning instead.
// Source: MDN declarativeNetRequest.ModifyHeaderInfo (verified 2026-07-05).
// This is a Chrome-defined list and may change — update it if append stops
// working for a header that used to be allowed.
export const APPEND_ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'forwarded',
  'if-match',
  'if-none-match',
  'keep-alive',
  'range',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  'want-digest',
  'x-forwarded-for',
]);

const HEADER_DIRECTIONS = ['requestHeaders', 'responseHeaders'];

// activeProfiles: [{ key, profile, tabIds }] as resolved by the background,
// tabIds null = no tab scoping. null means "just the selected profile".
// Returns { dynamicRules, sessionRules }: tabIds conditions are only valid on
// session rules, so tab-scoped profiles land there.
export function compileRules(data, activeProfiles = null) {
  const dynamicRules = [];
  const sessionRules = [];

  if (data.paused) {
    return { dynamicRules, sessionRules };
  }

  for (const { profile, tabIds } of activeProfiles ?? selectedProfileOnly(data)) {
    const isTabScoped = tabIds !== null;
    // Tab group filter resolved to zero tabs (group empty or gone): the
    // profile is scoped to nothing, so no rules for it.
    if (isTabScoped && tabIds.length === 0) {
      continue;
    }

    const conditions = buildConditions(profile.filters, tabIds);
    const priority = isTabScoped ? PRIORITY.tabScoped : PRIORITY.global;
    const target = isTabScoped ? sessionRules : dynamicRules;

    for (const direction of HEADER_DIRECTIONS) {
      const headers = (profile[direction] || []).filter(isHeaderEnabled);
      target.push(...buildModifyHeadersRules(headers, direction, conditions, priority));
    }
  }

  return { dynamicRules, sessionRules };
}

function selectedProfileOnly(data) {
  const profile = data.profiles?.[data.currentProfile];
  return profile ? [{ key: data.currentProfile, profile, tabIds: null }] : [];
}

export function activeDomainList(filters) {
  if (!filters?.domains?.enabled) {
    return [];
  }
  // DNR requires lowercase domains
  return (filters.domains.list || []).map(domain => domain.trim().toLowerCase()).filter(Boolean);
}

// Build the DNR conditions the profile's rules must carry. With a domain
// filter, a request should match when it goes TO one of the domains or is
// initiated FROM one of them; DNR ANDs fields inside a condition, so that OR
// takes one rule (condition) per field.
export function buildConditions(filters, tabIds) {
  const base = { urlFilter: '*', resourceTypes: [...RESOURCE_TYPES] };
  if (tabIds !== null) {
    base.tabIds = tabIds;
  }

  const domains = activeDomainList(filters);
  if (domains.length === 0) {
    return [base];
  }
  return [
    { ...base, requestDomains: domains },
    { ...base, initiatorDomains: domains },
  ];
}

// Decide the DNR operation for a header: append (multi-value) when the user
// enabled append mode and there is a value, else set (has value) or remove.
// Request-header append is degraded to set (with a warning) when the header
// is outside Chrome's append whitelist, to avoid a rule Chrome would reject.
export function resolveOperation(header, name, direction) {
  if (header.appendMode && header.value) {
    if (direction === 'requestHeaders' && !APPEND_ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())) {
      console.warn(
        `HeaderEditor: append not supported for request header "${name}"; falling back to set`
      );
      return 'set';
    }
    return 'append';
  }
  return header.value ? 'set' : 'remove';
}

// One modifyHeaders rule per condition, all with the same action.
// `direction` is 'requestHeaders' or 'responseHeaders' — the DNR action field.
export function buildModifyHeadersRules(
  headers,
  direction,
  conditions,
  priority = PRIORITY.global
) {
  const namedHeaders = headers.filter(header => header.name?.trim());
  if (namedHeaders.length === 0) {
    return [];
  }

  const modifications = namedHeaders.map(header => {
    const name = header.name.trim();
    return {
      header: name,
      operation: resolveOperation(header, name, direction),
      value: header.value || undefined,
    };
  });

  return conditions.map(condition => ({
    priority,
    action: { type: 'modifyHeaders', [direction]: modifications },
    condition,
  }));
}
