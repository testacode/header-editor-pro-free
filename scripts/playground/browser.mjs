// Shared by the playground and the store screenshots: a Chrome for Testing
// with the built extension loaded in a throwaway profile.
//
// Chrome for Testing, because branded Chrome stopped honouring --load-extension
// (Chrome 137+). It is downloaded once into ~/.cache/puppeteer if missing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Browser, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';
import puppeteer from 'puppeteer-core';

export async function chromeForTesting() {
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  console.log(`Chrome for Testing ${buildId} (downloads once if missing)…`);
  const { executablePath } = await install({ browser: Browser.CHROME, buildId, cacheDir });
  return executablePath;
}

// Returns { browser, extensionId, userDataDir }.
export async function launchWithExtension(distDir, args = []) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hep-playground-'));
  const browser = await puppeteer.launch({
    executablePath: await chromeForTesting(),
    headless: false,
    userDataDir,
    defaultViewport: null,
    pipe: true,
    enableExtensions: [distDir],
    args: ['--no-first-run', ...args],
  });
  const worker = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://')
  );
  return { browser, extensionId: new URL(worker.url()).host, userDataDir };
}
