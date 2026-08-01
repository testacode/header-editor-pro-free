import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const SITE_DIR = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(SITE_DIR, 'templates');
const LOCALES_DIR = path.join(SITE_DIR, 'locales');

const LOCALES = ['en', 'es', 'ja', 'ko', 'ru', 'zh-CN', 'zh-TW'];
const PAGES = ['index', 'privacy', '404'];

/** Keys the build script computes per page/locale — not part of the catalogs. */
const isComputed = key => key.startsWith('__');

function templateKeys(page) {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, `${page}.html`), 'utf8');
  const keys = new Set();
  for (const [, key] of html.matchAll(/\{\{([\w.-]+)\}\}/g)) {
    if (!isComputed(key)) {
      keys.add(key);
    }
  }
  return keys;
}

function catalog(locale) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'));
}

const usedKeys = new Set(PAGES.flatMap(page => [...templateKeys(page)]));

describe('site locale catalogs', () => {
  it('ships a catalog for every locale', () => {
    for (const locale of LOCALES) {
      expect(fs.existsSync(path.join(LOCALES_DIR, `${locale}.json`))).toBe(true);
    }
  });

  it.each(LOCALES)('%s translates every key used in the templates', locale => {
    const strings = catalog(locale);
    const missing = [...usedKeys].filter(key => !(key in strings));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('%s has no unused keys', locale => {
    const unused = Object.keys(catalog(locale)).filter(key => !usedKeys.has(key));
    expect(unused).toEqual([]);
  });

  it.each(LOCALES)('%s has no empty translations', locale => {
    const strings = catalog(locale);
    const empty = Object.keys(strings).filter(key => !String(strings[key]).trim());
    expect(empty).toEqual([]);
  });

  it('keeps every catalog on the same key set as English', () => {
    const reference = Object.keys(catalog('en')).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(catalog(locale)).sort(), `${locale} drifted from en`).toEqual(reference);
    }
  });
});

describe('site templates', () => {
  it.each(PAGES)('%s.html declares its language and canonical URL', page => {
    const html = fs.readFileSync(path.join(TEMPLATES_DIR, `${page}.html`), 'utf8');
    expect(html).toContain('<html lang="{{__lang}}">');
    expect(html).toContain('{{__langSwitcher}}');
  });

  it.each(['index', 'privacy'])('%s.html is indexable with hreflang alternates', page => {
    const html = fs.readFileSync(path.join(TEMPLATES_DIR, `${page}.html`), 'utf8');
    expect(html).toContain('rel="canonical" href="{{__canonical}}"');
    expect(html).toContain('{{__hreflang}}');
  });

  it('404.html uses absolute URLs, since Pages serves it at any depth', () => {
    const html = fs.readFileSync(path.join(TEMPLATES_DIR, '404.html'), 'utf8');
    expect(html).toContain('{{__siteRoot}}');
    expect(html).toContain('{{__homeUrl}}');
    expect(html).not.toContain('{{__assets}}');
  });
});
