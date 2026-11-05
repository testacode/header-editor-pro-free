import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';
import {
  normalizeCookie,
  normalizeCookieDomain,
  sanitizeCookies,
  isCookieActive,
} from '../cookie-normalize.js';
import { cookieUrl } from '../cookies.js';

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

async function createPopup() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.colorPickerState).toBeDefined());
  return popup;
}

const rows = () => [...document.querySelectorAll('#cookies-list .cookie-item')];
const siteRows = () => [...document.querySelectorAll('#site-cookies-list .site-cookie-item')];
const lastSavedProfile = () => {
  const calls = chrome.storage.local.set.mock.calls.filter(c => c[0].headerEditorData);
  const data = calls.at(-1)[0].headerEditorData;
  return data.profiles[data.currentProfile];
};

describe('cookie-normalize', () => {
  test('fills defaults and keeps an existing id', () => {
    expect(normalizeCookie({ id: 'c1', name: 'sid' })).toEqual({
      id: 'c1',
      domain: '',
      name: 'sid',
      value: '',
      enabled: true,
    });
  });

  test('sanitizeCookies tolerates junk', () => {
    expect(sanitizeCookies(null)).toEqual([]);
    expect(sanitizeCookies([1, null, { name: 'a' }])).toHaveLength(1);
  });

  test.each([
    ['example.com', 'example.com'],
    ['.Example.com', 'example.com'],
    ['https://api.example.com/path?x', 'api.example.com'],
    ['localhost:5180', 'localhost'],
    ['  ', ''],
  ])('normalizeCookieDomain(%j) → %j', (raw, expected) => {
    expect(normalizeCookieDomain(raw)).toBe(expected);
  });

  test('isCookieActive needs enabled, domain and name', () => {
    expect(isCookieActive({ enabled: true, domain: 'a.com', name: 'x', value: '' })).toBe(true);
    expect(isCookieActive({ enabled: false, domain: 'a.com', name: 'x' })).toBe(false);
    expect(isCookieActive({ enabled: true, domain: '', name: 'x' })).toBe(false);
    expect(isCookieActive({ enabled: true, domain: 'a.com', name: ' ' })).toBe(false);
  });

  test('cookieUrl builds the URL chrome.cookies.remove needs', () => {
    expect(cookieUrl({ domain: '.example.com', path: '/app', secure: true })).toBe(
      'https://example.com/app'
    );
    expect(cookieUrl({ domain: 'localhost', path: '', secure: false })).toBe('http://localhost/');
  });
});

describe('CookiesManager and SiteCookiesManager', () => {
  let popup;
  const siteCookies = [
    { name: 'sid', value: 'from-site', domain: '.example.com', path: '/', secure: true },
    { name: 'theme', value: 'dark', domain: 'example.com', path: '/', secure: false },
  ];

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    chrome.cookies = {
      getAll: vi.fn(async ({ name, url }) =>
        url ? siteCookies : siteCookies.filter(c => c.name === name)
      ),
      remove: vi.fn(async () => ({})),
    };
    chrome.tabs.query = vi.fn(async () => [{ url: 'https://example.com/home' }]);
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({
      headerEditorData: {
        currentProfile: 'default',
        paused: false,
        profiles: {
          default: {
            name: 'Default',
            requestHeaders: [],
            cookies: [{ id: 'c1', domain: 'example.com', name: 'lang', value: 'es' }],
          },
        },
      },
    });
    popup = await createPopup();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete chrome.cookies;
  });

  test('renders managed cookies, normalized on load', () => {
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('.cookie-name').value).toBe('lang');
    expect(popup.profiles.default.cookies[0].enabled).toBe(true);
  });

  test('add → empty row, saved once typed', async () => {
    chrome.storage.local.set.mockClear();
    document.getElementById('add-cookie').click();
    expect(rows()).toHaveLength(2);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    const name = rows()[1].querySelector('.cookie-name');
    name.value = 'token';
    name.dispatchEvent(new Event('input'));
    await popup.flushSave();

    expect(lastSavedProfile().cookies[1].name).toBe('token');
  });

  test('checkbox saves immediately; delete removes the row', async () => {
    rows()[0].querySelector('.header-checkbox').click();
    await popup.flushSave();
    expect(lastSavedProfile().cookies[0].enabled).toBe(false);

    rows()[0].querySelector('.header-delete').click();
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
    expect(lastSavedProfile().cookies).toEqual([]);
  });

  test('no clash with the site → no warning', async () => {
    await vi.waitFor(() => expect(chrome.cookies.getAll).toHaveBeenCalled());
    expect(rows()[0].querySelector('.cookie-conflict').hidden).toBe(true);
  });

  test('same name as a site cookie → warning; clicking it deletes the site cookie', async () => {
    const name = rows()[0].querySelector('.cookie-name');
    name.value = 'sid';
    name.dispatchEvent(new Event('input'));
    name.dispatchEvent(new Event('blur'));
    const warning = rows()[0].querySelector('.cookie-conflict');
    await vi.waitFor(() => expect(warning.hidden).toBe(false));
    expect(warning.title).toContain('sid');

    warning.click();
    await vi.waitFor(() =>
      expect(chrome.cookies.remove).toHaveBeenCalledWith({
        url: 'https://example.com/',
        name: 'sid',
      })
    );
  });

  test('site cookies: lists the active tab’s cookies', async () => {
    document.getElementById('toggle-site-cookies').click();
    await vi.waitFor(() => expect(siteRows()).toHaveLength(2));

    expect(document.getElementById('site-cookies-host').textContent).toContain('example.com');
    expect(chrome.cookies.getAll).toHaveBeenCalledWith({ url: 'https://example.com/home' });
  });

  test('site cookies: copy one into the profile', async () => {
    document.getElementById('toggle-site-cookies').click();
    await vi.waitFor(() => expect(siteRows()).toHaveLength(2));

    siteRows()[1].querySelector('.site-cookie-copy').click();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));

    expect(lastSavedProfile().cookies[1]).toMatchObject({
      domain: 'example.com',
      name: 'theme',
      value: 'dark',
    });
  });

  test('site cookies: delete asks first, then removes from the browser', async () => {
    document.getElementById('toggle-site-cookies').click();
    await vi.waitFor(() => expect(siteRows()).toHaveLength(2));

    confirm.mockReturnValueOnce(false);
    siteRows()[0].querySelector('.header-delete').click();
    expect(chrome.cookies.remove).not.toHaveBeenCalled();

    siteRows()[0].querySelector('.header-delete').click();
    await vi.waitFor(() =>
      expect(chrome.cookies.remove).toHaveBeenCalledWith({
        url: 'https://example.com/',
        name: 'sid',
      })
    );
  });

  test('site cookies on a non-web tab → a hint instead of a list', async () => {
    chrome.tabs.query = vi.fn(async () => [{ url: 'chrome://extensions/' }]);
    document.getElementById('toggle-site-cookies').click();

    await vi.waitFor(() =>
      expect(document.getElementById('site-cookies-host').textContent).not.toBe('')
    );
    expect(siteRows()).toHaveLength(0);
  });

  test('importing a multi-profile export restores its cookies', async () => {
    await popup.importExport.importMultipleProfiles({
      profiles: { p: { name: 'P', cookies: [{ domain: 'a.com', name: 'x', value: '1' }] } },
    });

    const imported = popup.profiles[popup.currentProfile].cookies;
    expect(imported[0]).toMatchObject({ domain: 'a.com', name: 'x', value: '1', enabled: true });
    expect(imported[0].id).toMatch(/^cookie_/);
  });
});
