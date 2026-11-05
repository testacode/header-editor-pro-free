/**
 * Redirect normalization — the stored shape of a profile's redirects.
 * Pure functions: no DOM, no chrome.*. Shared by the popup, import/export and
 * the background's rule compiler.
 *
 * Stored shape: { id, pattern, target, enabled, cors }
 * - pattern: regular expression (RE2, as DNR's regexFilter) matched against the
 *   full request URL, without /.../ delimiters.
 * - target: destination URL; $1…$9 insert the pattern's capture groups (the
 *   syntax users know from Requestly — the compiler translates it for DNR).
 * - cors: also open CORS on the target host (opt-in, see rule-compiler.js).
 */

export function normalizeRedirect(redirect) {
  return {
    id: typeof redirect.id === 'string' && redirect.id ? redirect.id : newRedirectId(),
    pattern: typeof redirect.pattern === 'string' ? redirect.pattern : '',
    target: typeof redirect.target === 'string' ? redirect.target : '',
    enabled: redirect.enabled !== false,
    cors: redirect.cors === true,
  };
}

export function sanitizeRedirects(maybeRedirects) {
  return Array.isArray(maybeRedirects)
    ? maybeRedirects.filter(r => r && typeof r === 'object').map(normalizeRedirect)
    : [];
}

// Enabled and complete: an empty pattern or target is a row still being typed.
export function isRedirectActive(redirect) {
  return redirect.enabled !== false && Boolean(redirect.pattern?.trim() && redirect.target?.trim());
}

export function newRedirectId() {
  return `redirect_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
