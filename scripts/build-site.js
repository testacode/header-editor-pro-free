#!/usr/bin/env node
/**
 * Builds the GitHub Pages site from templates + per-locale string catalogs.
 *
 * Input:  site/templates/<page>.html  +  site/locales/<locale>.json
 * Output: <page>.html at the repo root (English) and <locale>/<page>.html
 *         for every other language, plus a regenerated sitemap.xml.
 *
 * Never edit the generated HTML by hand — run `npm run build:site` instead.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'site', 'templates');
const LOCALES_DIR = path.join(ROOT, 'site', 'locales');

const SITE_URL = 'https://testacode.github.io/header-editor-pro-free/';

/** Default locale is emitted at the repo root so existing URLs keep working. */
const DEFAULT_LOCALE = 'en';

/** URL segment -> native name shown in the language switcher. */
const LOCALES = {
  en: 'English',
  es: 'Español',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

const PAGES = ['index', 'privacy', '404'];

/** Pages excluded from the sitemap (404 is noindex). */
const SITEMAP_PAGES = ['index', 'privacy'];

const localeCodes = Object.keys(LOCALES);

/** Relative prefix from a locale's directory back to the site root. */
const rootPrefix = locale => (locale === DEFAULT_LOCALE ? '' : '../');

/** Directory a locale is emitted into, relative to the repo root. */
const localeDir = locale => (locale === DEFAULT_LOCALE ? ROOT : path.join(ROOT, locale));

/** Absolute URL of a page in a given locale. */
function pageUrl(locale, page) {
  const localePart = locale === DEFAULT_LOCALE ? '' : `${locale}/`;
  const filePart = page === 'index' ? '' : `${page}.html`;
  return `${SITE_URL}${localePart}${filePart}`;
}

/** Relative href from `fromLocale` to the same page in `toLocale`. */
function relativeHref(fromLocale, toLocale, page) {
  const localePart = toLocale === DEFAULT_LOCALE ? '' : `${toLocale}/`;
  return `${rootPrefix(fromLocale)}${localePart}${page}.html`;
}

function loadCatalogs() {
  const catalogs = {};
  for (const locale of localeCodes) {
    const file = path.join(LOCALES_DIR, `${locale}.json`);
    catalogs[locale] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return catalogs;
}

/** <link rel="alternate"> block pointing at every translation of `page`. */
function buildHreflang(page) {
  const links = localeCodes.map(
    locale => `    <link rel="alternate" hreflang="${locale}" href="${pageUrl(locale, page)}">`
  );
  links.push(
    `    <link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT_LOCALE, page)}">`
  );
  return links.join('\n');
}

/**
 * Plain links to the other translations — no JavaScript, crawlable.
 *
 * GitHub Pages serves /404.html for any missing path, however deep, so the
 * 404 page can't rely on relative links: they'd resolve against the bogus URL.
 */
function buildLangSwitcher(currentLocale, page) {
  const links = localeCodes.map(locale => {
    const name = LOCALES[locale];
    if (locale === currentLocale) {
      return `        <span class="lang-current" aria-current="true">${name}</span>`;
    }
    const href =
      page === '404' ? pageUrl(locale, '404') : relativeHref(currentLocale, locale, page);
    return `        <a href="${href}" hreflang="${locale}" lang="${locale}">${name}</a>`;
  });
  return `      <nav class="lang-switcher" aria-label="Language">\n        <span class="lang-globe" aria-hidden="true">🌐</span>\n${links.join('\n')}\n      </nav>`;
}

/**
 * Replaces every {{key}} in `template`. Keys starting with `__` are computed
 * per page/locale; the rest come from the locale catalog.
 */
function render(template, { catalog, locale, page, missing }) {
  const computed = {
    __lang: locale,
    __assets: rootPrefix(locale),
    __siteRoot: SITE_URL,
    __homeUrl: pageUrl(locale, 'index'),
    __canonical: pageUrl(locale, page),
    __hreflang: buildHreflang(page),
    __langSwitcher: buildLangSwitcher(locale, page),
  };

  return template.replace(/\{\{([\w.-]+)\}\}/g, (match, key) => {
    if (key in computed) {
      return computed[key];
    }
    if (key in catalog) {
      return catalog[key];
    }
    missing.push(key);
    return match;
  });
}

function buildSitemap() {
  const entries = [];
  for (const page of SITEMAP_PAGES) {
    const changefreq = page === 'index' ? 'monthly' : 'yearly';
    const priority = page === 'index' ? '1.0' : '0.5';
    for (const locale of localeCodes) {
      const alternates = localeCodes
        .map(
          alt => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${pageUrl(alt, page)}"/>`
        )
        .join('\n');
      entries.push(
        [
          '  <url>',
          `    <loc>${pageUrl(locale, page)}</loc>`,
          alternates,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT_LOCALE, page)}"/>`,
          `    <changefreq>${changefreq}</changefreq>`,
          `    <priority>${priority}</priority>`,
          '  </url>',
        ].join('\n')
      );
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

function main() {
  const catalogs = loadCatalogs();
  const templates = {};
  for (const page of PAGES) {
    templates[page] = fs.readFileSync(path.join(TEMPLATES_DIR, `${page}.html`), 'utf8');
  }

  const missing = [];
  let written = 0;

  for (const locale of localeCodes) {
    const dir = localeDir(locale);
    fs.mkdirSync(dir, { recursive: true });

    for (const page of PAGES) {
      const pageMissing = [];
      const html = render(templates[page], {
        catalog: catalogs[locale],
        locale,
        page,
        missing: pageMissing,
      });
      if (pageMissing.length) {
        missing.push(`${locale}/${page}.html: ${[...new Set(pageMissing)].join(', ')}`);
      }
      fs.writeFileSync(path.join(dir, `${page}.html`), html);
      written++;
    }
  }

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap());

  if (missing.length) {
    console.error('Missing translation keys:');
    for (const line of missing) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  console.log(`Built ${written} pages across ${localeCodes.length} locales, plus sitemap.xml`);
}

main();

module.exports = { LOCALES, PAGES, DEFAULT_LOCALE, localeCodes, relativeHref, pageUrl };
