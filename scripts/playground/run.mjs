// npm run playground — try the extension by hand, without touching your own browser.
//
// Builds dist/, starts two local servers (the "app" and a second origin the
// redirect demo lands on), launches Chrome for Testing with the extension
// loaded in a throwaway profile, seeds a "Playground" profile and opens the
// demo page next to the popup. Close the browser window to stop everything.
//
// `npm run playground -- --check` clicks through the demos, prints what
// happened and exits — a smoke test of the whole setup.
//
// Chrome for Testing, because branded Chrome stopped honouring --load-extension
// (Chrome 137+). It is downloaded once into ~/.cache/puppeteer if missing.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DIST = path.join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');
// --check gets its own ports so it can run while a playground is open.
const APP_PORT = CHECK_ONLY ? 5190 : 5180;
const OTHER_PORT = APP_PORT + 1;
const APP = `http://localhost:${APP_PORT}`;
const OTHER = `http://localhost:${OTHER_PORT}`;

// What the "Playground" profile starts with. Every example on the demo page
// maps to one of these, so the page works before you touch the popup.
const seedData = {
  currentProfile: 'playground',
  paused: false,
  profileCounter: 1,
  profiles: {
    playground: {
      name: 'Playground',
      description: 'Seeded by npm run playground',
      requestHeaders: [
        { name: 'X-Playground', value: 'hello from the extension', enabled: true, note: '' },
        {
          name: 'X-Disabled',
          value: 'tick me',
          enabled: false,
          note: 'Disabled on purpose: tick it and send the request again',
        },
      ],
      responseHeaders: [
        { name: 'X-Playground-Response', value: 'added by the extension', enabled: true },
      ],
      redirects: [
        {
          id: 'redirect_playground',
          pattern: `localhost:${APP_PORT}/desa/(.*)`,
          target: `${OTHER}/prod/$1`,
          enabled: true,
          cors: false,
        },
      ],
      backgroundColor: '#7c4dff',
      textColor: '#ffffff',
      filters: {
        domains: { enabled: false, list: [] },
        tabGroup: { enabled: false, group: null },
      },
    },
  },
};

function startServers() {
  const page = fs
    .readFileSync(path.join(HERE, 'page.html'), 'utf8')
    .replaceAll('{{APP}}', APP)
    .replaceAll('{{APP_HOST}}', `localhost:${APP_PORT}`)
    .replaceAll('{{OTHER}}', OTHER);

  const echo = (res, req, from) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ from, url: req.url, headers: req.headers }, null, 2));
  };

  const app = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    if (req.url.startsWith('/desa/page')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        `<p style="font:16px system-ui">Served by the <b>app</b> server (${APP}). ` +
          'Page navigations are never redirected — only what the page loads.</p>' +
          `<p><a href="${APP}">← back to the playground</a></p>`
      );
    }
    echo(res, req, `app (${APP})`);
  });

  // No CORS headers of its own: that's what the redirect's CORS toggle is for.
  const other = http.createServer((req, res) => echo(res, req, `other origin (${OTHER})`));

  for (const [server, port] of [
    [app, APP_PORT],
    [other, OTHER_PORT],
  ]) {
    server.on('error', error => {
      console.error(
        error.code === 'EADDRINUSE'
          ? `Port ${port} is busy — is another playground still open? Close it and retry.`
          : error
      );
      process.exit(1);
    });
    server.listen(port);
  }
  return [app, other];
}

async function chromeForTesting() {
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  console.log(`Chrome for Testing ${buildId} (downloads once if missing)…`);
  const { executablePath } = await install({ browser: Browser.CHROME, buildId, cacheDir });
  return executablePath;
}

async function main() {
  console.log('Building the extension…');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' });

  const servers = startServers();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hep-playground-'));
  const browser = await puppeteer.launch({
    executablePath: await chromeForTesting(),
    headless: false,
    userDataDir,
    defaultViewport: null,
    pipe: true,
    enableExtensions: [DIST],
    args: ['--no-first-run', '--window-size=1400,900'],
  });

  const worker = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://')
  );
  const extensionId = new URL(worker.url()).host;

  // The popup, opened as a tab so it stays visible next to the demo. Pinned,
  // or it would close itself the first time you click on the demo page.
  const popup = (await browser.pages())[0] ?? (await browser.newPage());
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(async data => {
    await chrome.storage.local.set({ headerEditorData: data, popupPinned: true });
    await chrome.runtime.sendMessage({ type: 'headerEditor:applyRules' });
  }, seedData);
  await popup.reload();

  const demo = await browser.newPage();
  await demo.goto(APP);

  if (CHECK_ONLY) {
    await runChecks(demo, popup);
    await browser.close();
    return;
  }

  console.log(`\nPlayground ready: ${APP}`);
  console.log('The popup is open in the first tab (also under the puzzle icon).');
  console.log('Close the browser window to stop.\n');

  browser.on('disconnected', () => {
    servers.forEach(server => server.close());
    fs.rmSync(userDataDir, { recursive: true, force: true });
    process.exit(0);
  });
}

/* eslint-disable no-await-in-loop -- the demos run one after another, like a user clicking */
// Press each demo button and read its output box; then flip the redirect's
// CORS toggle in the popup, as a user would, and try the redirect again.
async function runChecks(demo, popup) {
  for (const [button, out] of [
    ['send', 'request-out'],
    ['response', 'response-out'],
    ['redirect', 'redirect-out'],
  ]) {
    await demo.click(`#${button}`);
    await demo.waitForFunction(id => document.getElementById(id).textContent !== '—', {}, out);
    const text = await demo.$eval(`#${out}`, el => el.textContent);
    const interesting = text
      .split('\n')
      .filter(line =>
        /playground|disabled|redirect|answered|blocked|final url|path seen/i.test(line)
      );
    console.log(`── ${button}\n${interesting.join('\n')}`);
  }

  await popup.bringToFront();
  await popup.click('#redirects-list .redirect-cors-toggle');
  const corsActive = await popup.$eval('#redirects-list .redirect-cors-toggle', el =>
    el.classList.contains('active')
  );
  console.log(`── CORS toggle shows active after click: ${corsActive}`);
  await popup.screenshot({ path: path.join(os.tmpdir(), 'hep-playground-popup.png') });
  await new Promise(resolve => setTimeout(resolve, 500)); // save → background → rules
  await demo.bringToFront();
  await demo.evaluate(() => (document.getElementById('redirect-out').textContent = '—'));
  await demo.click('#redirect');
  await demo.waitForFunction(() => document.getElementById('redirect-out').textContent !== '—');
  console.log(
    `── redirect with CORS on\n${await demo.$eval('#redirect-out', el => el.textContent)}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
