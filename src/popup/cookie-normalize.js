/**
 * Managed cookies — the stored shape of a profile's cookies.
 * Pure functions: no DOM, no chrome.*. Shared by the popup, import/export and
 * the background's rule compiler.
 *
 * Stored shape: { id, domain, name, value, enabled }
 * They are not written to the browser's cookie jar: the compiler appends
 * `name=value` to the Cookie request header of requests to `domain` (and its
 * subdomains), so they follow the profile's pause, filters and tab group like
 * headers do, and disappear the moment the profile stops applying.
 */

export function normalizeCookie(cookie) {
  return {
    id: typeof cookie.id === 'string' && cookie.id ? cookie.id : newCookieId(),
    domain: typeof cookie.domain === 'string' ? cookie.domain : '',
    name: typeof cookie.name === 'string' ? cookie.name : '',
    value: typeof cookie.value === 'string' ? cookie.value : '',
    enabled: cookie.enabled !== false,
  };
}

export function sanitizeCookies(maybeCookies) {
  return Array.isArray(maybeCookies)
    ? maybeCookies.filter(c => c && typeof c === 'object').map(normalizeCookie)
    : [];
}

// "https://Api.Example.com/x", ".example.com", "example.com:8080" → the bare
// lowercase host DNR's requestDomains expects; '' when there is none.
export function normalizeCookieDomain(raw) {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^\./, '');
  return text.split(/[/:?#]/)[0];
}

// Enabled, with a domain and a name. An empty value is fine (`name=`).
export function isCookieActive(cookie) {
  return (
    cookie.enabled !== false &&
    Boolean(normalizeCookieDomain(cookie.domain)) &&
    Boolean(cookie.name?.trim())
  );
}

export function newCookieId() {
  return `cookie_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
