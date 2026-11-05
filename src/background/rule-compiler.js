// Pure translation from the stored state to declarativeNetRequest rules.
//
// No chrome.* calls in here: the background resolves what depends on the
// browser (which tabs a tab group covers right now) and then asks this module
// what the rules should be. Rules come out without ids — ids depend on what is
// already installed, so the background assigns them when it applies them.
// That also makes the output comparable between runs (see ruleStateSignature).

import { isHeaderEnabled } from '../popup/header-normalize.js';
import { isRedirectActive } from '../popup/redirect-normalize.js';
import { isCookieActive, normalizeCookieDomain } from '../popup/cookie-normalize.js';

// When two rules touch the same header on the same request, the higher
// priority wins (equal priorities: undefined order). Tab-scoped profiles
// outrank the selected profile's global rules inside their tab group, and the
// automatic CORS headers lose to any header the user sets explicitly.
export const PRIORITY = {
  cors: 1,
  global: 2,
  tabScoped: 3,
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

// Redirects only apply to subresources, never to page navigations: a typo in
// a pattern can't hijack the page you're on, only what it loads.
export const REDIRECT_RESOURCE_TYPES = RESOURCE_TYPES.filter(
  type => type !== 'main_frame' && type !== 'sub_frame'
);

const HEADER_DIRECTIONS = ['requestHeaders', 'responseHeaders'];

// Opening CORS on the redirect target: without it, a page fetching from
// desa.example.com and redirected to www.example.com gets blocked by the
// browser. `*` does not work for credentialed requests (fetch with
// credentials: 'include') — browsers reject it there, and DNR can't echo the
// request's Origin back. Opt-in per redirect for that reason.
const CORS_RESPONSE_HEADERS = [
  { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' },
  { header: 'Access-Control-Allow-Headers', operation: 'set', value: '*' },
  {
    header: 'Access-Control-Allow-Methods',
    operation: 'set',
    value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
  },
  { header: 'Access-Control-Expose-Headers', operation: 'set', value: '*' },
];

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

    const redirects = (profile.redirects || []).filter(isRedirectActive);
    for (const redirect of redirects) {
      target.push(...buildRedirectRules(redirect, conditions, priority));
    }
    target.push(
      ...buildCorsRules(
        redirects.filter(r => r.cors),
        tabIds
      )
    );

    const cookies = (profile.cookies || []).filter(isCookieActive);
    target.push(...buildCookieRules(cookies, conditions, priority));
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

// The profile's conditions (domain filter, tab ids) with the redirect pattern
// in place of the match-everything urlFilter.
export function buildRedirectRules(redirect, conditions, priority = PRIORITY.global) {
  return conditions.map(({ urlFilter: _matchAll, ...condition }) => ({
    priority,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: toRegexSubstitution(redirect.target.trim()) },
    },
    condition: {
      ...condition,
      regexFilter: wholeUrlPattern(redirect.pattern.trim()),
      // DNR defaults to case-insensitive; a regex means what it says, and
      // (?i) is there for whoever wants otherwise.
      isUrlFilterCaseSensitive: true,
      resourceTypes: [...REDIRECT_RESOURCE_TYPES],
    },
  }));
}

// regexSubstitution replaces only the part of the URL the regex matched, so
// `desa\.example\.com/(.*)` on https://desa.example.com/x would yield
// "https://" + target. The target is a whole URL: make the match cover the
// whole URL too. Non-capturing wrappers keep the user's $1, $2… numbering.
export function wholeUrlPattern(pattern) {
  return `^.*?(?:${pattern}).*$`;
}

// Users write capture groups as $1 (Requestly's syntax); DNR's
// regexSubstitution wants \1. A literal backslash has to be escaped first so
// it isn't read as a group reference.
export function toRegexSubstitution(target) {
  return target.replace(/\\/g, '\\\\').replace(/\$(\d)/g, '\\$1');
}

// One rule per distinct target host. A target whose host contains a $n
// placeholder can't be scoped to a known host, so it gets no CORS rule.
export function buildCorsRules(redirects, tabIds) {
  const hosts = new Set(redirects.map(r => targetHost(r.target)).filter(Boolean));
  return [...hosts].map(host => ({
    priority: PRIORITY.cors,
    action: { type: 'modifyHeaders', responseHeaders: CORS_RESPONSE_HEADERS },
    condition: {
      requestDomains: [host],
      resourceTypes: [...REDIRECT_RESOURCE_TYPES],
      ...(tabIds !== null ? { tabIds } : {}),
    },
  }));
}

function targetHost(target) {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(target.trim())?.[1];
  if (!authority || authority.includes('$')) {
    return null;
  }
  try {
    return new URL(`https://${authority}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Managed cookies ride on the Cookie request header instead of the browser's
// cookie jar. `append` adds them after the site's own cookies, joined with
// "; " (verified in Chrome for Testing 157). A cookie with the same name as
// one the site already has is sent twice and most servers read the first —
// the site's; the popup warns about that.
// One rule per cookie domain, sent to that domain and its subdomains.
export function buildCookieRules(cookies, conditions, priority = PRIORITY.global) {
  const byDomain = new Map();
  for (const cookie of cookies) {
    const domain = normalizeCookieDomain(cookie.domain);
    const pairs = byDomain.get(domain) ?? [];
    pairs.push(`${cookie.name.trim()}=${cookie.value}`);
    byDomain.set(domain, pairs);
  }

  return [...byDomain].flatMap(([domain, pairs]) =>
    conditions
      .map(condition => scopeToDomain(condition, domain))
      .filter(Boolean)
      .map(condition => ({
        priority,
        action: {
          type: 'modifyHeaders',
          requestHeaders: pairs.map(value => ({ header: 'cookie', operation: 'append', value })),
        },
        condition,
      }))
  );
}

// Narrow a profile condition to requests going to `domain`. With the profile's
// domain filter on the request side, only the overlap survives (none → null);
// on the initiator side the two combine: to `domain`, from a filtered site.
function scopeToDomain(condition, domain) {
  if (!condition.requestDomains) {
    return { ...condition, requestDomains: [domain] };
  }
  const overlap = condition.requestDomains.flatMap(filtered => {
    if (isSameOrSubdomain(domain, filtered)) {
      return [domain];
    }
    return isSameOrSubdomain(filtered, domain) ? [filtered] : [];
  });
  return overlap.length > 0 ? { ...condition, requestDomains: [...new Set(overlap)] } : null;
}

function isSameOrSubdomain(host, parent) {
  return host === parent || host.endsWith(`.${parent}`);
}
