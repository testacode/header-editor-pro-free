import { t } from './i18n.js';
import { normalizeRedirect } from './redirect-normalize.js';

// The "Redirects" section of the current profile: one row per redirect with
// enable checkbox, pattern → target, CORS toggle and delete.
export class RedirectsManager {
  constructor(popup) {
    this.popup = popup;
  }

  currentRedirects() {
    const profile = this.popup.profiles[this.popup.currentProfile];
    profile.redirects ??= [];
    return profile.redirects;
  }

  setupEventListeners() {
    document.getElementById('add-redirect').addEventListener('click', () => this.add());
  }

  render() {
    const list = document.getElementById('redirects-list');
    list.replaceChildren(...this.currentRedirects().map(redirect => this.createRow(redirect)));
  }

  // Like a new header, a new row isn't saved until the user types into it.
  add() {
    this.currentRedirects().push(normalizeRedirect({}));
    this.render();
    document.querySelector('#redirects-list .redirect-item:last-child .redirect-pattern')?.focus();
  }

  async remove(redirect) {
    const profile = this.popup.profiles[this.popup.currentProfile];
    profile.redirects = this.currentRedirects().filter(r => r !== redirect);
    await this.popup.saveData();
    this.render();
  }

  createRow(redirect) {
    const row = document.createElement('div');
    row.className = 'redirect-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'header-checkbox';
    checkbox.checked = redirect.enabled;
    checkbox.addEventListener('change', () => {
      redirect.enabled = checkbox.checked;
      this.popup.saveData();
    });

    const pattern = this.createInput(redirect, 'pattern', t('redirectPatternPlaceholder'));
    pattern.addEventListener('input', () => this.validatePattern(pattern));
    this.validatePattern(pattern);

    const arrow = document.createElement('span');
    arrow.className = 'redirect-arrow';
    arrow.textContent = '→';

    const target = this.createInput(redirect, 'target', t('redirectTargetPlaceholder'));

    const cors = document.createElement('button');
    cors.className = 'redirect-cors-toggle';
    cors.textContent = 'CORS';
    cors.title = t('redirectCors');
    cors.classList.toggle('active', redirect.cors);
    cors.addEventListener('click', () => {
      redirect.cors = !redirect.cors;
      cors.classList.toggle('active', redirect.cors);
      this.popup.saveData();
    });

    const remove = document.createElement('button');
    remove.className = 'header-delete';
    remove.textContent = '✕';
    remove.title = t('redirectDelete');
    remove.addEventListener('click', () => this.remove(redirect));

    row.append(checkbox, pattern, arrow, target, cors, remove);
    return row;
  }

  // Typed edits persist like header name/value: debounced, flushed on blur.
  createInput(redirect, field, placeholder) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `redirect-${field}`;
    input.placeholder = placeholder;
    input.value = redirect[field];
    input.spellcheck = false;
    input.addEventListener('input', () => {
      redirect[field] = input.value;
      this.popup.scheduleSave();
    });
    input.addEventListener('blur', () => this.popup.flushSave());
    return input;
  }

  // DNR compiles patterns with RE2, which rejects some things JS accepts
  // (lookarounds, backreferences). Ask the browser when it can tell us; fall
  // back to the JS engine, which at least catches syntax errors. An invalid
  // pattern is only flagged here — the background drops the rule it can't add.
  async validatePattern(input) {
    const pattern = input.value.trim();
    const problem = pattern ? await this.patternProblem(pattern) : null;
    input.classList.toggle('invalid', Boolean(problem));
    input.title = problem ? t('redirectInvalidPattern', problem) : '';
  }

  async patternProblem(pattern) {
    if (typeof chrome.declarativeNetRequest?.isRegexSupported === 'function') {
      try {
        const result = await chrome.declarativeNetRequest.isRegexSupported({ regex: pattern });
        return result.isSupported ? null : result.reason;
      } catch {
        // Not usable in this browser — fall through to the JS check.
      }
    }
    try {
      new RegExp(pattern);
      return null;
    } catch (error) {
      return error.message;
    }
  }
}
