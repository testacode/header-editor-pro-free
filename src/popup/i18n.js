/**
 * Popup translations.
 *
 * Catalogs are imported statically rather than read through chrome.i18n, which
 * always resolves against the browser's own language and offers no way to pick
 * another. The language selector needs that choice, so the popup owns the
 * lookup. chrome.i18n still serves the manifest's description via __MSG_.
 *
 * Message files keep Chrome's `_locales/<locale>/messages.json` format so they
 * stay a single source of truth for both consumers.
 */
import en from '../_locales/en/messages.json';
import es from '../_locales/es/messages.json';
import ja from '../_locales/ja/messages.json';
import ko from '../_locales/ko/messages.json';
import ru from '../_locales/ru/messages.json';
import zhCN from '../_locales/zh_CN/messages.json';
import zhTW from '../_locales/zh_TW/messages.json';

const CATALOGS = { en, es, ja, ko, ru, zh_CN: zhCN, zh_TW: zhTW };

export const DEFAULT_LOCALE = 'en';

// Where the chosen language is remembered. Absent means "follow the browser".
export const LOCALE_STORAGE_KEY = 'uiLocale';

// Order drives the language menu. `nativeName` is what a speaker of that
// language calls it — an English label is useless to someone who cannot read
// the UI they are trying to escape. The flag is decoration: flags are countries,
// not languages, so the name is what actually identifies the entry.
export const SUPPORTED_LOCALES = [
  { code: 'en', nativeName: 'English', flag: '🇬🇧' },
  { code: 'zh_CN', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'zh_TW', nativeName: '繁體中文', flag: '🇹🇼' },
  { code: 'ja', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ru', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'es', nativeName: 'Español', flag: '🇪🇸' },
];

// chrome.i18n caps each substitution at 1024 chars and returns an empty string
// when one is longer. Blank UI is far harder to diagnose than truncated text.
const MAX_SUBSTITUTION = 1000;

let activeLocale = DEFAULT_LOCALE;

/**
 * Map a BCP-47 tag onto a catalog we ship: exact match, then the base language
 * ('es-AR' → 'es'), then the first regional variant of that base ('zh' →
 * 'zh_CN'). Returns null when nothing fits, so callers can fall back knowingly.
 */
export function resolveLocale(tag) {
  if (!tag) {
    return null;
  }
  const normalized = String(tag).replace('-', '_');
  const codes = SUPPORTED_LOCALES.map(l => l.code);

  if (codes.includes(normalized)) {
    return normalized;
  }
  const base = normalized.split('_')[0];
  if (codes.includes(base)) {
    return base;
  }
  return codes.find(code => code.split('_')[0] === base) || null;
}

export function getActiveLocale() {
  return activeLocale;
}

export function setActiveLocale(locale) {
  activeLocale = CATALOGS[locale] ? locale : DEFAULT_LOCALE;
  return activeLocale;
}

/** The browser's own language, mapped onto a catalog we ship. */
export function detectBrowserLocale() {
  const uiLanguage = chrome.i18n?.getUILanguage?.();
  return resolveLocale(uiLanguage) || DEFAULT_LOCALE;
}

/**
 * Read the saved choice and make it active. `null` means the user never chose,
 * so we follow the browser. Returns the stored preference, not the resolved
 * locale — the menu needs to know "Auto" from an explicit pick.
 */
export async function loadStoredLocale() {
  try {
    const stored = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
    const preference = stored[LOCALE_STORAGE_KEY] || null;
    setActiveLocale(preference || detectBrowserLocale());
    return preference;
  } catch (error) {
    console.error('Failed to read the language preference:', error);
    setActiveLocale(detectBrowserLocale());
    return null;
  }
}

/** Persist a choice. `null` clears it, going back to following the browser. */
export async function storeLocale(preference) {
  setActiveLocale(preference || detectBrowserLocale());
  if (preference) {
    await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: preference });
  } else {
    await chrome.storage.local.remove(LOCALE_STORAGE_KEY);
  }
}

/**
 * Translate `key`, substituting $1…$9 with the given values (Chrome's message
 * format — not template literals). Falls back to English, then to a visibly
 * marked key so a missing message shows up instead of rendering blank.
 */
export function t(key, ...substitutions) {
  const entry = CATALOGS[activeLocale]?.[key] ?? CATALOGS[DEFAULT_LOCALE]?.[key];
  if (!entry?.message) {
    return `⟦${key}⟧`;
  }

  const values = substitutions.map(value => String(value).slice(0, MAX_SUBSTITUTION));

  // $$ is a literal $ and must not swallow a following digit.
  return entry.message.replace(/\$(\$|[1-9])/g, (match, token) => {
    if (token === '$') {
      return '$';
    }
    const value = values[Number(token) - 1];
    return value === undefined ? match : value;
  });
}

// Which DOM property each attribute drives. Deliberately no innerHTML variant:
// catalog content must never be parsed as markup.
const TARGETS = {
  'data-i18n': 'textContent',
  'data-i18n-title': 'title',
  'data-i18n-placeholder': 'placeholder',
  'data-i18n-value': 'value',
};

const SELECTOR = Object.keys(TARGETS)
  .map(attr => `[${attr}]`)
  .join(',');

/**
 * Translate every tagged element under `root`. Idempotent — the attributes stay
 * in the DOM, so re-running after a language change just reassigns.
 */
export function applyI18n(root = document) {
  root.querySelectorAll(SELECTOR).forEach(element => {
    Object.entries(TARGETS).forEach(([attr, property]) => {
      const key = element.getAttribute(attr);
      if (key) {
        element[property] = t(key);
      }
    });
  });
}

/**
 * An error whose text is a catalog key, so it can be rendered in the user's
 * language wherever it surfaces. `message` holds the English so console output
 * and stack traces stay readable.
 */
export class LocalizedError extends Error {
  constructor(messageKey, ...substitutions) {
    const previous = activeLocale;
    activeLocale = DEFAULT_LOCALE;
    const english = t(messageKey, ...substitutions);
    activeLocale = previous;

    super(english);
    this.name = 'LocalizedError';
    this.messageKey = messageKey;
    this.substitutions = substitutions;
  }
}

/**
 * Text for an error on its way to the UI. Ours get translated; everything else
 * (a JSON.parse SyntaxError, say) carries a platform message we cannot localize
 * and is passed through as-is.
 */
export function describeError(error) {
  return error instanceof LocalizedError
    ? t(error.messageKey, ...error.substitutions)
    : error.message;
}
