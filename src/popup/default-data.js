/**
 * Single source of truth for the default headerEditorData shape.
 * Functions (not constants) so each caller gets a fresh, unshared object.
 * Any new field of the persisted shape is added here — never inline.
 */

export function defaultFilters() {
  return {
    domains: { enabled: false, list: [] },
    // group: { id, title, color } of a Chrome tab group; null = none selected
    tabGroup: { enabled: false, group: null },
  };
}

// Builds up to 2.5.3 stored this literal as a stand-in for "no description",
// then compared against it to decide what to render. Frozen so migrations can
// still recognise it in existing storage: never translate it, never edit it.
export const LEGACY_PLACEHOLDER_DESCRIPTION = 'Click to edit description';

// The name is a parameter rather than a t() call so this module stays free of
// the translation catalogs: the background service worker imports it too, and
// it has no UI to translate. The popup passes the localized name, which is what
// gets persisted; the background only ever uses this shape in memory.
export function defaultProfile(name = 'Default') {
  return {
    name,
    description: '',
    requestHeaders: [],
    responseHeaders: [],
    backgroundColor: '#4caf50',
    textColor: '#ffffff',
    filters: defaultFilters(),
  };
}

export function defaultHeaderEditorData(defaultProfileName) {
  return {
    profiles: { default: defaultProfile(defaultProfileName) },
    currentProfile: 'default',
    enabled: true,
    paused: false,
    pinned: false,
    profileCounter: 1,
  };
}
