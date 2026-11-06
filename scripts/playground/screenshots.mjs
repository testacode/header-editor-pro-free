// npm run store:screenshots — the 1280×800 images for the Chrome Web Store and
// AMO listings, rendered from the real popup with realistic demo data.
//
// Each scene seeds storage, scrolls the popup to one feature, captures it at
// 2× and places it on a branded canvas with a caption. Output:
// screenshots/store/<n>-<scene>.jpg (committed, uploaded by hand).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWithExtension } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'screenshots', 'store');

const header = (name, value, extra = {}) => ({ name, value, enabled: true, note: '', ...extra });
const profile = (name, color, extra = {}) => ({
  name,
  description: '',
  requestHeaders: [],
  responseHeaders: [],
  redirects: [],
  cookies: [],
  backgroundColor: color,
  textColor: '#ffffff',
  filters: { domains: { enabled: false, list: [] }, tabGroup: { enabled: false, group: null } },
  ...extra,
});

const staging = profile('Staging', '#7c4dff', {
  description: 'QA environment — feature flags on',
  requestHeaders: [
    header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.demo', {
      note: 'Service token for the QA tenant — rotates every Monday',
    }),
    header('X-Feature-Flags', 'new-checkout,dark-mode'),
    header('X-Request-Source', 'qa-team', { enabled: false }),
  ],
  responseHeaders: [header('Access-Control-Allow-Origin', '*')],
  redirects: [
    {
      id: 'redirect_api',
      pattern: '^https://api\\.example\\.com/(.*)',
      target: 'https://staging-api.example.com/$1',
      enabled: true,
      cors: true,
    },
    {
      id: 'redirect_cdn',
      pattern: 'cdn\\.example\\.com/assets/(.*)',
      target: 'http://localhost:8080/assets/$1',
      enabled: true,
      cors: false,
    },
  ],
  cookies: [
    { id: 'cookie_ab', domain: 'example.com', name: 'ab_variant', value: 'B', enabled: true },
    { id: 'cookie_debug', domain: 'example.com', name: 'debug', value: 'true', enabled: true },
  ],
  filters: {
    domains: { enabled: true, list: ['example.com', 'api.example.com'] },
    tabGroup: { enabled: false, group: null },
  },
});

const data = {
  currentProfile: 'staging',
  paused: false,
  profileCounter: 3,
  profiles: {
    default: profile('Default', '#4caf50', { requestHeaders: [header('X-Debug', '1')] }),
    staging,
    local: profile('Local', '#ff9800'),
  },
};

// Each scene seeds only what it shows, so its section starts at the top of
// the popup instead of every scene scrolling to the same bottom.
const lessHeaders = {
  requestHeaders: [header('X-Feature-Flags', 'new-checkout,dark-mode')],
  responseHeaders: [],
};
const SCENES = [
  {
    file: '1-headers',
    title: 'Edit any HTTP header',
    body: 'Request and response headers per profile, each with its own switch — and a note to remember why it is there.',
    setup: { openNote: true },
  },
  {
    file: '2-redirects',
    title: 'Redirect between environments',
    body: 'Send requests matching a regex to staging or localhost, with $1 capture groups and optional CORS.',
    section: '#redirects-section',
    staging: { ...lessHeaders, cookies: [] },
  },
  {
    file: '3-cookies',
    title: 'Cookies per profile',
    body: 'Add cookies to a domain’s requests without touching the browser’s own — they disappear when you pause.',
    section: '#cookies-section',
    staging: { ...lessHeaders, redirects: [] },
  },
  {
    file: '4-filters',
    title: 'Scope every profile',
    body: 'Limit a profile to some domains or to a Chrome tab group, and keep environments apart.',
    section: '#filters-section',
    staging: { ...lessHeaders, redirects: [], cookies: [] },
  },
  {
    file: '5-light',
    title: 'Light or dark, in 7 languages',
    body: 'Switch theme from the menu; English, Español, 日本語, 한국어, Русский, 简体中文 and 繁體中文.',
    setup: { theme: 'light', locale: 'es' },
  },
];

async function capturePopup(browser, extensionId, { section, setup = {}, staging: overrides }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 2 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(
    async (seed, { theme, locale }) => {
      window.localStorage.setItem('uiTheme', theme ?? 'dark');
      await chrome.storage.local.set({ headerEditorData: seed, popupPinned: true });
      await (locale
        ? chrome.storage.local.set({ uiLocale: locale })
        : chrome.storage.local.remove('uiLocale'));
    },
    {
      ...data,
      profiles: { ...data.profiles, staging: { ...data.profiles.staging, ...overrides } },
    },
    setup
  );
  await page.reload();
  await page.waitForFunction(() => document.getElementById('profile-name-input').value !== '');
  if (setup.openNote) {
    await page.click('#request-headers-list .header-note-toggle');
    await page.evaluate(() => document.activeElement.blur()); // no caret in the shot
  }
  if (section) {
    // Scroll only the content pane: scrollIntoView would also shift the popup.
    await page.$eval(section, el => {
      const pane = el.closest('.content');
      pane.scrollTop = el.offsetTop - pane.offsetTop;
    });
  }
  await new Promise(resolve => setTimeout(resolve, 400)); // transitions
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width > 600) {
    throw new Error(`popup is ${width}px wide, wider than the real 600px popup`);
  }
  const png = await page.screenshot({ encoding: 'base64' });
  await page.close();
  return png;
}

function canvasHtml(popupPng, title, body) {
  return `<!doctype html><html><body style="margin:0;width:1280px;height:800px;display:flex;
    align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;font-family:system-ui,sans-serif;
    background:linear-gradient(135deg,#1b2a1c 0%,#14181f 55%,#1d1730 100%);color:#fff">
    <div style="flex:1">
      <div style="color:#4caf50;font-weight:700;letter-spacing:.08em;font-size:15px">HEADER EDITOR PRO — FREE</div>
      <h1 style="font-size:46px;line-height:1.1;margin:18px 0">${title}</h1>
      <p style="font-size:22px;line-height:1.45;color:#c9d1d9;margin:0">${body}</p>
    </div>
    <img src="data:image/png;base64,${popupPng}" width="600" height="600"
      style="border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.55)">
  </body></html>`;
}

async function main() {
  console.log('Building the extension…');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' });
  fs.mkdirSync(OUT, { recursive: true });

  const { browser, extensionId, userDataDir } = await launchWithExtension(path.join(ROOT, 'dist'));
  // The site's own "debug" cookie, so scene 3 shows the clash warning (⚠).
  const setter = await browser.newPage();
  await setter.goto(`chrome-extension://${extensionId}/popup.html`);
  await setter.evaluate(() =>
    chrome.cookies.set({ url: 'https://example.com/', name: 'debug', value: 'false' })
  );

  const canvas = await browser.newPage();
  await canvas.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  for (const scene of SCENES) {
    // eslint-disable-next-line no-await-in-loop -- one popup at a time keeps storage seeding isolated
    const popupPng = await capturePopup(browser, extensionId, scene);
    // eslint-disable-next-line no-await-in-loop
    await canvas.setContent(canvasHtml(popupPng, scene.title, scene.body));
    const file = path.join(OUT, `${scene.file}.jpg`);
    // eslint-disable-next-line no-await-in-loop
    await canvas.screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`  ${path.relative(ROOT, file)}`);
  }

  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
