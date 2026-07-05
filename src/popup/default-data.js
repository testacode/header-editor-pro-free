/**
 * Single source of truth for the default headerEditorData shape.
 * Functions (not constants) so each caller gets a fresh, unshared object.
 * Any new field of the persisted shape is added here — never inline.
 */

export function defaultProfile() {
  return {
    name: 'Default',
    description: 'Click to edit description',
    requestHeaders: [],
    backgroundColor: '#4caf50',
    textColor: '#ffffff',
  };
}

export function defaultHeaderEditorData() {
  return {
    profiles: { default: defaultProfile() },
    currentProfile: 'default',
    enabled: true,
    paused: false,
    pinned: false,
    profileCounter: 1,
  };
}
