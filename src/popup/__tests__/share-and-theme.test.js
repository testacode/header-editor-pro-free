import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';
import { applyTheme, currentTheme, toggleTheme, THEME_STORAGE_KEY } from '../theme.js';

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

async function createPopup() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.colorPickerState).toBeDefined());
  return popup;
}

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  test('dark by default: no data-theme attribute', () => {
    applyTheme();
    expect(currentTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test('toggle → light and back, persisted in localStorage', () => {
    expect(toggleTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    expect(toggleTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  test('the popup applies a stored light theme on start', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({});
    await createPopup();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('menu item toggles the theme and its label offers the other one', async () => {
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({});
    const popup = await createPopup();
    const item = document.getElementById('theme-item');

    popup.toggleDropdown();
    expect(item.textContent).toContain('Light theme');

    item.click();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(item.textContent).toContain('Dark theme');
  });
});

describe('share active items', () => {
  let popup;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({
      headerEditorData: {
        currentProfile: 'default',
        paused: false,
        profiles: {
          default: {
            name: 'Staging',
            requestHeaders: [
              { name: 'X-On', value: '1', enabled: true },
              { name: 'X-Off', value: '0', enabled: false },
            ],
            responseHeaders: [{ name: 'X-Resp', value: 'r', enabled: true }],
            redirects: [
              { id: 'r1', pattern: 'a', target: 'b', enabled: true },
              { id: 'r2', pattern: 'c', target: 'd', enabled: false },
            ],
            cookies: [{ id: 'c1', domain: 'x.com', name: 'n', value: 'v', enabled: false }],
          },
        },
      },
    });
    popup = await createPopup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
  });

  test('copies only enabled items, in the format the import understands', async () => {
    document.getElementById('share-active-item').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    const copied = JSON.parse(navigator.clipboard.writeText.mock.calls[0][0]);
    const shared = copied.profiles.shared;
    expect(shared.name).toBe('Staging');
    expect(shared.requestHeaders.map(h => h.name)).toEqual(['X-On']);
    expect(shared.responseHeaders).toHaveLength(1);
    expect(shared.redirects.map(r => r.id)).toEqual(['r1']);
    expect(shared.cookies).toEqual([]);
    expect(document.querySelector('.copy-toast').textContent).toContain('3');
  });

  test('round trip: importing the shared JSON creates a profile with those items', async () => {
    const data = popup.importExport.activeItemsExport(popup.profiles.default);
    await popup.importExport.importMultipleProfiles(data);

    const imported = popup.profiles[popup.currentProfile];
    expect(imported.name).toBe('Staging');
    expect(imported.requestHeaders.map(h => h.name)).toEqual(['X-On']);
    expect(imported.redirects).toHaveLength(1);
  });

  test('clipboard failure → an error toast, no throw', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await popup.importExport.copyActiveItems();

    expect(document.querySelector('.copy-toast').textContent).toMatch(/clipboard/i);
  });
});
