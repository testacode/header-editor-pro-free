import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';
import { normalizeRedirect, sanitizeRedirects, isRedirectActive } from '../redirect-normalize.js';

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

async function createPopup() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.colorPickerState).toBeDefined());
  return popup;
}

const rows = () => [...document.querySelectorAll('#redirects-list .redirect-item')];
const lastSavedProfile = () => {
  const calls = chrome.storage.local.set.mock.calls.filter(c => c[0].headerEditorData);
  const data = calls.at(-1)[0].headerEditorData;
  return data.profiles[data.currentProfile];
};

describe('redirect-normalize', () => {
  test('fills defaults and keeps an existing id', () => {
    expect(normalizeRedirect({ id: 'r1', pattern: 'a' })).toEqual({
      id: 'r1',
      pattern: 'a',
      target: '',
      enabled: true,
      cors: false,
    });
  });

  test('missing id → a fresh unique one', () => {
    const a = normalizeRedirect({});
    const b = normalizeRedirect({});
    expect(a.id).toMatch(/^redirect_/);
    expect(a.id).not.toBe(b.id);
  });

  test('sanitizeRedirects drops non-objects and tolerates non-arrays', () => {
    expect(sanitizeRedirects(undefined)).toEqual([]);
    expect(sanitizeRedirects([null, 'x', { pattern: 'p', target: 't' }])).toHaveLength(1);
  });

  test('isRedirectActive needs enabled + pattern + target', () => {
    expect(isRedirectActive({ enabled: true, pattern: 'a', target: 'b' })).toBe(true);
    expect(isRedirectActive({ enabled: false, pattern: 'a', target: 'b' })).toBe(false);
    expect(isRedirectActive({ enabled: true, pattern: ' ', target: 'b' })).toBe(false);
    expect(isRedirectActive({ enabled: true, pattern: 'a', target: '' })).toBe(false);
  });
});

describe('RedirectsManager', () => {
  let popup;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({
      headerEditorData: {
        currentProfile: 'default',
        paused: false,
        profiles: {
          default: {
            name: 'Default',
            requestHeaders: [],
            redirects: [{ id: 'r1', pattern: '^https://a\\.com/(.*)', target: 'https://b.com/$1' }],
          },
        },
      },
    });
    popup = await createPopup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders one row per redirect, normalized on load', () => {
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('.redirect-pattern').value).toBe('^https://a\\.com/(.*)');
    expect(rows()[0].querySelector('.redirect-target').value).toBe('https://b.com/$1');
    expect(popup.profiles.default.redirects[0]).toMatchObject({ enabled: true, cors: false });
  });

  test('add → new empty row, not saved until typed', async () => {
    chrome.storage.local.set.mockClear();
    document.getElementById('add-redirect').click();

    expect(rows()).toHaveLength(2);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    const target = rows()[1].querySelector('.redirect-target');
    target.value = 'https://x.com';
    target.dispatchEvent(new Event('input'));
    await popup.flushSave();

    expect(lastSavedProfile().redirects[1].target).toBe('https://x.com');
  });

  test('checkbox and CORS toggle save immediately', async () => {
    rows()[0].querySelector('.header-checkbox').click();
    rows()[0].querySelector('.redirect-cors-toggle').click();
    await popup.flushSave();

    expect(lastSavedProfile().redirects[0]).toMatchObject({ enabled: false, cors: true });
    expect(rows()[0].querySelector('.redirect-cors-toggle').classList.contains('active')).toBe(
      true
    );
  });

  test('delete removes the row and saves', async () => {
    rows()[0].querySelector('.header-delete').click();
    await vi.waitFor(() => expect(rows()).toHaveLength(0));

    expect(lastSavedProfile().redirects).toEqual([]);
  });

  test('invalid pattern is flagged with the browser reason', async () => {
    chrome.declarativeNetRequest.isRegexSupported = vi.fn(async () => ({
      isSupported: false,
      reason: 'syntaxError',
    }));
    const pattern = rows()[0].querySelector('.redirect-pattern');
    pattern.value = '(unclosed';
    pattern.dispatchEvent(new Event('input'));

    await vi.waitFor(() => expect(pattern.classList.contains('invalid')).toBe(true));
    expect(pattern.title).toContain('syntaxError');
    delete chrome.declarativeNetRequest.isRegexSupported;
  });

  test('without isRegexSupported, the JS engine catches syntax errors', async () => {
    const pattern = rows()[0].querySelector('.redirect-pattern');
    pattern.value = '(unclosed';
    pattern.dispatchEvent(new Event('input'));

    await vi.waitFor(() => expect(pattern.classList.contains('invalid')).toBe(true));
  });

  test('switching profile renders that profile’s redirects', async () => {
    popup.profiles.other = { name: 'Other', requestHeaders: [], redirects: [] };
    await popup.switchProfile('other');

    expect(rows()).toHaveLength(0);
  });

  test('importing a multi-profile export restores its redirects', async () => {
    const exported = {
      profiles: {
        p: {
          name: 'P',
          requestHeaders: [],
          redirects: [{ pattern: 'a', target: 'b', cors: true }],
        },
      },
    };

    await popup.importExport.importMultipleProfiles(exported);

    const imported = popup.profiles[popup.currentProfile];
    expect(imported.redirects).toHaveLength(1);
    expect(imported.redirects[0]).toMatchObject({ pattern: 'a', target: 'b', cors: true });
    expect(imported.redirects[0].id).toMatch(/^redirect_/);
  });
});
