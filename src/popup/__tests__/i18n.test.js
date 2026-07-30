import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  t,
  applyI18n,
  resolveLocale,
  setActiveLocale,
  getActiveLocale,
  detectBrowserLocale,
  LocalizedError,
  describeError,
  DEFAULT_LOCALE,
} from '../i18n.js';
import { ImportExportManager } from '../import-export.js';

// filenameStem needs no popup state, so exercise it on a bare manager.
const popupManagerStem = name => new ImportExportManager({}).filenameStem(name);

describe('t', () => {
  test('returns the message for a known key', () => {
    expect(t('modalCancel')).toBe('Cancel');
  });

  test('substitutes $1', () => {
    expect(t('infoVersion', '2.5.3')).toBe('Version 2.5.3');
  });

  test('coerces non-string substitutions', () => {
    expect(t('profileNewName', 7)).toBe('Profile 7');
  });

  test('leaves an unfilled placeholder alone rather than printing "undefined"', () => {
    expect(t('infoVersion')).toBe('Version $1');
  });

  test('clamps a substitution to 1000 chars', () => {
    const long = 'a'.repeat(5000);
    const rendered = t('filtersDomainsIgnored', long);

    expect(rendered).toContain('a'.repeat(1000));
    expect(rendered).not.toContain('a'.repeat(1001));
  });

  test('a missing key renders a visible marker, never an empty string', () => {
    expect(t('noSuchKeyAnywhere')).toBe('⟦noSuchKeyAnywhere⟧');
  });
});

describe('resolveLocale', () => {
  test('matches the default locale exactly', () => {
    expect(resolveLocale('en')).toBe('en');
  });

  test('falls back from a regional tag to its base language', () => {
    expect(resolveLocale('en-GB')).toBe('en');
  });

  test('returns null for a language we do not ship', () => {
    expect(resolveLocale('sv-SE')).toBeNull();
  });

  test('returns null for an empty tag', () => {
    expect(resolveLocale('')).toBeNull();
  });
});

describe('active locale', () => {
  afterEach(() => setActiveLocale(DEFAULT_LOCALE));

  test('an unknown locale falls back to the default instead of breaking', () => {
    expect(setActiveLocale('sv')).toBe(DEFAULT_LOCALE);
    expect(getActiveLocale()).toBe(DEFAULT_LOCALE);
  });

  test('detectBrowserLocale maps the browser UI language onto a catalog', () => {
    chrome.i18n.getUILanguage.mockReturnValueOnce('en-GB');
    expect(detectBrowserLocale()).toBe('en');
  });

  test('detectBrowserLocale falls back when the browser language is unsupported', () => {
    chrome.i18n.getUILanguage.mockReturnValueOnce('sv-SE');
    expect(detectBrowserLocale()).toBe(DEFAULT_LOCALE);
  });
});

describe('applyI18n', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('sets textContent from data-i18n', () => {
    document.body.innerHTML = '<span data-i18n="modalCancel">xx</span>';
    applyI18n(document);

    expect(document.querySelector('span').textContent).toBe('Cancel');
  });

  test('sets title, placeholder and value from their attributes', () => {
    document.body.innerHTML = `
      <button data-i18n-title="toolbarMenu"></button>
      <input data-i18n-placeholder="headerNamePlaceholder" />
      <input id="v" data-i18n-value="profileDefaultName" />`;
    applyI18n(document);

    expect(document.querySelector('button').title).toBe('Menu');
    expect(document.querySelector('input').placeholder).toBe('Header name');
    expect(document.getElementById('v').value).toBe('Default');
  });

  test('leaves untagged elements alone', () => {
    document.body.innerHTML = '<span>untouched</span>';
    applyI18n(document);

    expect(document.querySelector('span').textContent).toBe('untouched');
  });

  test('is idempotent — re-running is what makes a language switch work', () => {
    document.body.innerHTML = '<span data-i18n="modalCancel"></span>';
    applyI18n(document);
    applyI18n(document);

    expect(document.querySelector('span').textContent).toBe('Cancel');
  });

  test('never assigns innerHTML', () => {
    document.body.innerHTML = '<span data-i18n="modalCancel"></span>';
    const span = document.querySelector('span');
    const spy = vi.fn();
    Object.defineProperty(span, 'innerHTML', { set: spy, get: () => '' });

    applyI18n(document);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('LocalizedError', () => {
  test('keeps the key and substitutions for later translation', () => {
    const error = new LocalizedError('errHeaderMissingName', 3);

    expect(error.messageKey).toBe('errHeaderMissingName');
    expect(error.substitutions).toEqual([3]);
  });

  test('message holds the English so console output stays readable', () => {
    expect(new LocalizedError('errInvalidImportFormat').message).toBe('Invalid import format');
  });

  test('is a real Error', () => {
    expect(new LocalizedError('errInvalidImportFormat')).toBeInstanceOf(Error);
  });
});

describe('describeError', () => {
  test('translates our own errors', () => {
    expect(describeError(new LocalizedError('errHeaderMissingName', 2))).toBe(
      "Header 2: missing or invalid 'name' field"
    );
  });

  test('passes a platform error through untouched', () => {
    // A JSON.parse SyntaxError carries V8 text we cannot localize.
    expect(describeError(new SyntaxError('Unexpected token } in JSON at position 42'))).toBe(
      'Unexpected token } in JSON at position 42'
    );
  });
});

describe('export filename stem', () => {
  test('an ASCII profile name is sanitized as before', () => {
    expect(popupManagerStem('My Profile 2')).toBe('my_profile_2');
  });

  test('a name with no ASCII falls back instead of yielding only underscores', () => {
    expect(popupManagerStem('プロファイル')).toBe('profile');
    expect(popupManagerStem('Профиль')).toBe('profile');
    expect(popupManagerStem('测试配置')).toBe('profile');
  });

  test('a missing name falls back too', () => {
    expect(popupManagerStem(undefined)).toBe('profile');
  });
});
