import { t } from './i18n.js';
import { normalizeCookie, normalizeCookieDomain } from './cookie-normalize.js';

// The "Cookies" section of the current profile: cookies the extension adds to
// the Cookie header of requests to a domain (see cookie-normalize.js), one row
// each: enable checkbox, domain, name = value, conflict warning, delete.
export class CookiesManager {
  constructor(popup) {
    this.popup = popup;
  }

  currentCookies() {
    const profile = this.popup.profiles[this.popup.currentProfile];
    profile.cookies ??= [];
    return profile.cookies;
  }

  setupEventListeners() {
    document.getElementById('add-cookie').addEventListener('click', () => this.add());
  }

  render() {
    const list = document.getElementById('cookies-list');
    list.replaceChildren(...this.currentCookies().map(cookie => this.createRow(cookie)));
  }

  // Like a new header, a new row isn't saved until the user types into it.
  add(fields = {}) {
    this.currentCookies().push(normalizeCookie(fields));
    this.render();
    if (Object.keys(fields).length > 0) {
      return this.popup.saveData();
    }
    document.querySelector('#cookies-list .cookie-item:last-child .cookie-domain')?.focus();
    return undefined;
  }

  async remove(cookie) {
    const profile = this.popup.profiles[this.popup.currentProfile];
    profile.cookies = this.currentCookies().filter(c => c !== cookie);
    await this.popup.saveData();
    this.render();
  }

  createRow(cookie) {
    const row = document.createElement('div');
    row.className = 'cookie-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'header-checkbox';
    checkbox.checked = cookie.enabled;
    checkbox.addEventListener('change', () => {
      cookie.enabled = checkbox.checked;
      this.popup.saveData();
    });

    const warning = document.createElement('button');
    warning.className = 'cookie-conflict';
    warning.textContent = '⚠';
    warning.hidden = true;
    warning.addEventListener('click', () => this.removeSiteCookie(cookie, warning));
    const recheck = () => this.checkConflict(cookie, warning);

    const domain = this.createInput(cookie, 'domain', t('cookieDomainPlaceholder'), recheck);
    const name = this.createInput(cookie, 'name', t('cookieNamePlaceholder'), recheck);
    const equals = document.createElement('span');
    equals.className = 'cookie-equals';
    equals.textContent = '=';
    const value = this.createInput(cookie, 'value', t('cookieValuePlaceholder'));

    const remove = document.createElement('button');
    remove.className = 'header-delete';
    remove.textContent = '✕';
    remove.title = t('cookieDelete');
    remove.addEventListener('click', () => this.remove(cookie));

    row.append(checkbox, domain, name, equals, value, warning, remove);
    recheck();
    return row;
  }

  // Typed edits persist like header name/value: debounced, flushed on blur.
  createInput(cookie, field, placeholder, onBlur = () => {}) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `cookie-${field}`;
    input.placeholder = placeholder;
    input.value = cookie[field];
    input.spellcheck = false;
    input.addEventListener('input', () => {
      cookie[field] = input.value;
      this.popup.scheduleSave();
    });
    input.addEventListener('blur', () => {
      this.popup.flushSave();
      onBlur();
    });
    return input;
  }

  // The site's own cookie with the same name goes first in the header, and
  // most servers read the first one: ours would silently lose.
  async siteCookiesNamedLike(cookie) {
    const domain = normalizeCookieDomain(cookie.domain);
    const name = cookie.name.trim();
    if (!domain || !name || !chrome.cookies?.getAll) {
      return [];
    }
    try {
      return await chrome.cookies.getAll({ domain, name });
    } catch {
      return [];
    }
  }

  async checkConflict(cookie, warning) {
    const clashing = await this.siteCookiesNamedLike(cookie);
    warning.hidden = clashing.length === 0;
    warning.title = t('cookieConflict', cookie.name.trim(), normalizeCookieDomain(cookie.domain));
  }

  async removeSiteCookie(cookie, warning) {
    if (!confirm(t('cookieConflictConfirm', cookie.name.trim()))) {
      return;
    }
    for (const siteCookie of await this.siteCookiesNamedLike(cookie)) {
      // eslint-disable-next-line no-await-in-loop -- usually one cookie; keep removals ordered
      await chrome.cookies.remove({ url: cookieUrl(siteCookie), name: siteCookie.name });
    }
    await this.checkConflict(cookie, warning);
  }
}

// chrome.cookies.remove identifies a cookie by a URL it would be sent to.
export function cookieUrl(cookie) {
  const host = cookie.domain.replace(/^\./, '');
  return `http${cookie.secure ? 's' : ''}://${host}${cookie.path || '/'}`;
}
