// npm run store:screenshots — the 1280×800 images for the Chrome Web Store and
// AMO listings, rendered from the real popup with realistic demo data.
//
// Each scene seeds storage, scrolls the popup to one feature, captures it at
// 2× and places it on a branded canvas with a caption. Output:
// screenshots/store/<n>-<scene>.jpg, plus the two Chrome Web Store promo
// tiles (promo-tiles.mjs). Committed, uploaded by hand. The landing page's
// popup images go to screenshots/site/*.webp.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWithExtension } from './browser.mjs';
import { PROMO_TILES } from './promo-tiles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'screenshots', 'store');
const SITE_OUT = path.join(ROOT, 'screenshots', 'site');

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
    site: 'headers',
    siteClip: '#request-section',
    title: 'Edit any HTTP header',
    body: 'Request and response headers per profile, each with its own switch — and a note to remember why it is there.',
    setup: { openNote: true },
  },
  {
    file: '2-redirects',
    site: 'redirects',
    siteClip: '#redirects-section',
    title: 'Redirect between environments',
    body: 'Send requests matching a regex to staging or localhost, with $1 capture groups and optional CORS.',
    section: '#redirects-section',
    staging: { ...lessHeaders, cookies: [] },
  },
  {
    file: '3-cookies',
    site: 'cookies',
    siteClip: '#cookies-section',
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

// Returns the whole popup and, when the scene has `siteClip`, just that section
// (the landing page shows one feature per image, not the whole popup again).
async function capturePopup(
  browser,
  extensionId,
  { section, siteClip, setup = {}, staging: overrides }
) {
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
  const clip = siteClip ? await (await page.$(siteClip)).screenshot({ encoding: 'base64' }) : null;
  await page.close();
  return { png, clip };
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

// Render at 2× and scale down to the exact store size with high-quality
// resampling, then encode a near-lossless JPEG (the stores reject alpha, so
// no PNG straight from the browser). A 1× render gives soft text and edges.
// The bare popup for the landing page: WebP at 2×, no caption or canvas.
async function saveSiteImage(canvas, popupPng, name) {
  const webp = await canvas.evaluate(async png => {
    const image = document.createElement('img');
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const out = document.createElement('canvas');
    out.width = image.naturalWidth;
    out.height = image.naturalHeight;
    out.getContext('2d').drawImage(image, 0, 0);
    return out.toDataURL('image/webp', 0.9).split(',')[1];
  }, popupPng);
  const file = path.join(SITE_OUT, `${name}.webp`);
  fs.writeFileSync(file, Buffer.from(webp, 'base64'));
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function render(canvas, html, width, height, name) {
  await canvas.setViewport({ width, height, deviceScaleFactor: 2 });
  await canvas.setContent(html, { waitUntil: 'load' });
  const hiRes = await canvas.screenshot({ encoding: 'base64', type: 'png' });
  const jpeg = await canvas.evaluate(
    async (png, w, h) => {
      const image = document.createElement('img');
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const context = out.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, w, h);
      return out.toDataURL('image/jpeg', 0.97).split(',')[1];
    },
    hiRes,
    width,
    height
  );
  const file = path.join(OUT, `${name}.jpg`);
  fs.writeFileSync(file, Buffer.from(jpeg, 'base64'));
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function main() {
  console.log('Building the extension…');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SITE_OUT, { recursive: true });

  const { browser, extensionId, userDataDir } = await launchWithExtension(path.join(ROOT, 'dist'));
  // The site's own "debug" cookie, so scene 3 shows the clash warning (⚠).
  const setter = await browser.newPage();
  await setter.goto(`chrome-extension://${extensionId}/popup.html`);
  await setter.evaluate(() =>
    chrome.cookies.set({ url: 'https://example.com/', name: 'debug', value: 'false' })
  );

  const canvas = await browser.newPage();
  for (const scene of SCENES) {
    // eslint-disable-next-line no-await-in-loop -- one popup at a time keeps storage seeding isolated
    const { png, clip } = await capturePopup(browser, extensionId, scene);
    // eslint-disable-next-line no-await-in-loop
    await render(canvas, canvasHtml(png, scene.title, scene.body), 1280, 800, scene.file);
    if (scene.site) {
      // eslint-disable-next-line no-await-in-loop
      await saveSiteImage(canvas, clip, scene.site);
    }
    if (scene === SCENES[0]) {
      // eslint-disable-next-line no-await-in-loop
      await saveSiteImage(canvas, png, 'popup'); // the landing page's hero
    }
  }

  // Promo tiles reuse scene 1's popup (headers + note) and the full-size logo.
  const promoInputs = {
    iconPng: fs.readFileSync(path.join(ROOT, 'raw-assets/logo-original.png')).toString('base64'),
    popupPng: (await capturePopup(browser, extensionId, SCENES[0])).png,
  };
  for (const tile of PROMO_TILES) {
    // eslint-disable-next-line no-await-in-loop -- one canvas, reused per tile
    await render(canvas, tile.html(promoInputs), tile.width, tile.height, tile.file);
  }

  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
