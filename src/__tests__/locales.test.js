/**
 * Guards the translation catalogs against the failure mode that costs the most
 * to find by hand: a key that exists in one language and not another, or a
 * translation that silently dropped a $1 and now renders half a sentence.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(SRC, '_locales');
const DEFAULT_LOCALE = 'en';

// Present only in machine-translated files; a native reviewer deletes it.
const REVIEW_SENTINEL = 'zzMachineTranslated';

const readCatalog = locale =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));

const locales = fs
  .readdirSync(LOCALES_DIR)
  .filter(entry => fs.statSync(path.join(LOCALES_DIR, entry)).isDirectory());

const english = readCatalog(DEFAULT_LOCALE);

const walk = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === '_locales' ? [] : walk(full);
    }
    return full;
  });

const sourceFiles = walk(SRC).filter(f => f.endsWith('.js'));
const htmlFiles = walk(SRC).filter(f => f.endsWith('.html'));

// Keys referenced from code: t('key'), new LocalizedError('key'
const usedInJs = new Set(
  sourceFiles.flatMap(file => {
    const code = fs.readFileSync(file, 'utf8');
    return [
      ...code.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g),
      ...code.matchAll(/new LocalizedError\(\s*'([A-Za-z0-9_]+)'/g),
    ].map(match => match[1]);
  })
);

// Keys referenced from markup: data-i18n="key", data-i18n-title="key", …
const usedInHtml = new Set(
  htmlFiles.flatMap(file =>
    [...fs.readFileSync(file, 'utf8').matchAll(/data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g)].map(
      match => match[1]
    )
  )
);

const placeholdersOf = message => (message.match(/\$[1-9]/g) || []).sort().join(',');

describe('message catalogs', () => {
  test('every key used in JS exists in the English catalog', () => {
    const missing = [...usedInJs].filter(key => !english[key]);
    expect(missing).toEqual([]);
  });

  test('every key used in HTML exists in the English catalog', () => {
    const missing = [...usedInHtml].filter(key => !english[key]);
    expect(missing).toEqual([]);
  });

  test('every English key is actually used somewhere', () => {
    const unused = Object.keys(english).filter(
      key => key !== REVIEW_SENTINEL && !usedInJs.has(key) && !usedInHtml.has(key)
    );
    // appDesc and appName are referenced by manifest.json via __MSG_, not by code.
    expect(unused).toEqual(['appDesc', 'appName']);
  });

  test('message names are valid for Chrome (ASCII word chars, case-insensitively unique)', () => {
    const names = Object.keys(english);
    const invalid = names.filter(name => !/^[A-Za-z0-9_]+$/.test(name));
    expect(invalid).toEqual([]);

    const lowered = names.map(name => name.toLowerCase());
    expect(new Set(lowered).size).toBe(names.length);
  });

  test('every message has a non-empty string', () => {
    const empty = Object.entries(english)
      .filter(([, entry]) => typeof entry.message !== 'string' || !entry.message)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  describe.each(locales.filter(locale => locale !== DEFAULT_LOCALE))('%s', locale => {
    const catalog = readCatalog(locale);

    test('has exactly the same keys as English', () => {
      const keys = Object.keys(catalog).filter(key => key !== REVIEW_SENTINEL);
      expect(keys.sort()).toEqual(Object.keys(english).sort());
    });

    test('keeps the same $N placeholders in every message', () => {
      const mismatched = Object.keys(english).filter(
        key =>
          catalog[key] &&
          placeholdersOf(catalog[key].message) !== placeholdersOf(english[key].message)
      );
      expect(mismatched).toEqual([]);
    });

    test('no message was left as an empty string', () => {
      const empty = Object.entries(catalog)
        .filter(([, entry]) => !entry.message)
        .map(([key]) => key);
      expect(empty).toEqual([]);
    });
  });

  // The manifest resolves __MSG_appDesc__ and __MSG_appName__ per locale, so
  // every catalog has to clear the store limits — not just the default one.
  // Chrome enforces both; AMO truncates the name at 50 instead of rejecting it.
  describe.each(locales)('%s appDesc', locale => {
    test('fits the 132-character store limit', () => {
      expect(readCatalog(locale).appDesc.message.length).toBeLessThanOrEqual(132);
    });
  });

  describe.each(locales)('%s appName', locale => {
    test('fits the 75-character manifest limit', () => {
      expect(readCatalog(locale).appName.message.length).toBeLessThanOrEqual(75);
    });

    test('fits the 50-character AMO listing limit', () => {
      expect(readCatalog(locale).appName.message.length).toBeLessThanOrEqual(50);
    });
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

  test('declares the default locale', () => {
    expect(manifest.default_locale).toBe(DEFAULT_LOCALE);
  });

  test('the description is a __MSG_ reference backed by a real key', () => {
    const match = manifest.description.match(/^__MSG_([A-Za-z0-9_]+)__$/);
    expect(match).not.toBeNull();
    expect(english[match[1]]).toBeDefined();
  });

  // Reversed in 2.6.1: the name used to be a fixed brand string. AMO ranks the
  // name far above every other field and indexes it once per translation, so a
  // localized name is the single biggest search lever there.
  test('the name is a __MSG_ reference backed by a real key', () => {
    const match = manifest.name.match(/^__MSG_([A-Za-z0-9_]+)__$/);
    expect(match).not.toBeNull();
    expect(english[match[1]]).toBeDefined();
  });
});
