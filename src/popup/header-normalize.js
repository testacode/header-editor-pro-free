/**
 * Header normalization — ensure header objects have all required fields.
 * Pure function: no DOM, no side effects.
 */

/**
 * Normalize a single header object, filling in missing fields with defaults.
 * Does NOT filter — callers decide whether to keep the result.
 *
 * @param {{ name?: string, value?: string, enabled?: boolean, appendMode?: boolean }} header
 * @returns {{ name: string, value: string, enabled: boolean, appendMode: boolean }}
 */
export function normalizeHeader(header) {
  return {
    name: header.name ?? '',
    value: header.value || '',
    enabled: isHeaderEnabled(header),
    appendMode: isAppendMode(header),
  };
}

/**
 * A header appends (rather than sets) only when `appendMode` is strictly true.
 * Missing or non-boolean-true = set semantics (backward compatible).
 *
 * @param {{ appendMode?: boolean }} header
 * @returns {boolean}
 */
export function isAppendMode(header) {
  return header.appendMode === true;
}

/**
 * A header is enabled unless `enabled` is explicitly false (missing = enabled).
 * Single source of truth for the enabled predicate used across popup,
 * background and import/export.
 *
 * @param {{ enabled?: boolean }} header
 * @returns {boolean}
 */
export function isHeaderEnabled(header) {
  return header.enabled !== false;
}
