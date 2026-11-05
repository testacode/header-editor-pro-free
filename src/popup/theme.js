// Light / dark theme of the popup. Dark is the default, so nothing changes for
// anyone who never picks light.
//
// Kept in localStorage rather than chrome.storage: it is read synchronously
// before the first paint, so a light popup never flashes dark while storage
// answers. It's a UI preference of this browser, like uiLocale, not part of
// the exported configuration.

export const THEME_STORAGE_KEY = 'uiTheme';
const LIGHT = 'light';

export function currentTheme() {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === LIGHT ? LIGHT : 'dark';
}

export function applyTheme(root = document.documentElement) {
  if (currentTheme() === LIGHT) {
    root.dataset.theme = LIGHT;
  } else {
    delete root.dataset.theme;
  }
}

export function toggleTheme(root = document.documentElement) {
  if (currentTheme() === LIGHT) {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT);
  }
  applyTheme(root);
  return currentTheme();
}
