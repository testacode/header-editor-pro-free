import { t } from './i18n.js';
import { cookieUrl } from './cookies.js';

// "This site's cookies": the real cookies the browser sends to the page in the
// active tab, read on demand. Each can be deleted, or copied into the profile
// as a managed cookie. Nothing here is stored or sent anywhere.
export class SiteCookiesManager {
  constructor(popup) {
    this.popup = popup;
  }

  setupEventListeners() {
    document.getElementById('toggle-site-cookies').addEventListener('click', () => this.toggle());
  }

  async toggle() {
    const panel = document.getElementById('site-cookies');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      await this.render();
    }
  }

  async activeTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url && /^https?:/.test(tab.url) ? tab.url : null;
  }

  async render() {
    const host = document.getElementById('site-cookies-host');
    const list = document.getElementById('site-cookies-list');
    const url = await this.activeTabUrl();

    if (!url || !chrome.cookies?.getAll) {
      host.textContent = t('siteCookiesNoSite');
      list.replaceChildren();
      return;
    }

    const cookies = await chrome.cookies.getAll({ url });
    host.textContent = t('siteCookiesFor', new URL(url).host, cookies.length);
    list.replaceChildren(...cookies.map(cookie => this.createRow(cookie)));
  }

  createRow(cookie) {
    const row = document.createElement('div');
    row.className = 'site-cookie-item';

    const name = document.createElement('span');
    name.className = 'site-cookie-name';
    name.textContent = cookie.name;
    name.title = `${cookie.domain}${cookie.path}`;

    const value = document.createElement('span');
    value.className = 'site-cookie-value';
    value.textContent = cookie.value;
    value.title = cookie.value;

    const copy = document.createElement('button');
    copy.className = 'site-cookie-copy';
    copy.textContent = '+';
    copy.title = t('siteCookiesCopy');
    copy.addEventListener('click', () =>
      this.popup.cookies.add({
        domain: cookie.domain.replace(/^\./, ''),
        name: cookie.name,
        value: cookie.value,
      })
    );

    const remove = document.createElement('button');
    remove.className = 'header-delete';
    remove.textContent = '✕';
    remove.title = t('siteCookiesDelete');
    remove.addEventListener('click', async () => {
      if (!confirm(t('siteCookiesDeleteConfirm', cookie.name))) {
        return;
      }
      await chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name });
      await this.render();
      this.popup.cookies.render(); // a conflict warning may be gone now
    });

    row.append(name, value, copy, remove);
    return row;
  }
}
