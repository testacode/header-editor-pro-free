import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';
import { normalizeDomainEntry } from '../filters.js';

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

vi.stubGlobal('alert', vi.fn());
vi.stubGlobal(
  'confirm',
  vi.fn(() => true)
);

async function createPopup() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.colorPickerState).toBeDefined());
  return popup;
}

// Flush the fire-and-forget async populateTabGroupSelect
async function flushAsync() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('FiltersManager', () => {
  let popup;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({});
    chrome.tabGroups.query.mockResolvedValue([]);
    chrome.tabs.query.mockResolvedValue([]);
    popup = await createPopup();
  });

  describe('migration', () => {
    test('profiles stored without filters get the default shape', async () => {
      chrome.storage.local.get.mockResolvedValue({
        headerEditorData: {
          profiles: { default: { name: 'Old', description: 'd', requestHeaders: [] } },
          currentProfile: 'default',
          enabled: true,
          paused: false,
          pinned: false,
          profileCounter: 1,
        },
      });
      document.documentElement.innerHTML = popupHtml;
      const p = await createPopup();

      expect(p.profiles.default.filters).toEqual({
        domains: { enabled: false, list: [] },
        tabGroup: { enabled: false, group: null },
      });
    });

    test('new profiles are created with default filters', () => {
      popup.createNewProfile();
      expect(popup.profiles[popup.currentProfile].filters.domains.enabled).toBe(false);
    });
  });

  describe('domain filter', () => {
    test('checkbox change persists enabled flag', async () => {
      chrome.storage.local.set.mockClear();
      const checkbox = document.getElementById('domain-filter-enabled');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(popup.profiles[popup.currentProfile].filters.domains.enabled).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    describe('normalization', () => {
      test('normalizeDomainEntry converts scheme + path + port to bare hostname', () => {
        expect(normalizeDomainEntry('https://api.example.com/path?q=1')).toBe('api.example.com');
        expect(normalizeDomainEntry('example.com:8080')).toBe('example.com');
        expect(normalizeDomainEntry('http://localhost/api')).toBe('localhost');
      });

      test('normalizeDomainEntry strips leading wildcard', () => {
        expect(normalizeDomainEntry('*.example.com')).toBe('example.com');
        expect(normalizeDomainEntry('*.Example.COM')).toBe('example.com');
      });

      test('normalizeDomainEntry lowercases and trims', () => {
        expect(normalizeDomainEntry('  EXAMPLE.COM  ')).toBe('example.com');
      });

      test('normalizeDomainEntry returns null for invalid entries', () => {
        expect(normalizeDomainEntry('foo bar')).toBeNull();
        expect(normalizeDomainEntry('  ')).toBeNull();
        expect(normalizeDomainEntry('')).toBeNull();
      });

      test('normalizeDomainEntry accepts localhost', () => {
        expect(normalizeDomainEntry('localhost')).toBe('localhost');
      });

      test('normalizeDomainEntry strips trailing dot', () => {
        expect(normalizeDomainEntry('example.com.')).toBe('example.com');
      });
    });

    test('input blur parses comma-separated domains', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = ' api.example.com,  hub.io , ,';
      input.dispatchEvent(new Event('blur'));

      expect(popup.profiles[popup.currentProfile].filters.domains.list).toEqual([
        'api.example.com',
        'hub.io',
      ]);
    });

    test('input blur normalizes URLs to bare hostnames', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'https://api.example.com/path?q=1, example.com:8080, hub.io';
      input.dispatchEvent(new Event('blur'));

      expect(popup.profiles[popup.currentProfile].filters.domains.list).toEqual([
        'api.example.com',
        'example.com',
        'hub.io',
      ]);
    });

    test('input blur rewrites input value to show what was saved', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'https://a.com, not@valid, not a domain, b.com';
      input.dispatchEvent(new Event('blur'));

      expect(input.value).toBe('a.com, b.com');
    });

    test('input blur deduplicates domains', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'a.com, b.com, a.com, B.COM';
      input.dispatchEvent(new Event('blur'));

      expect(popup.profiles[popup.currentProfile].filters.domains.list).toEqual(['a.com', 'b.com']);
    });

    test('input blur shows hint for rejected entries', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'https://a.com, not@valid, not a domain, b.com';
      input.dispatchEvent(new Event('blur'));

      const hint = document.getElementById('domain-filter-hint');
      expect(hint.textContent).toContain('Ignored (not valid domains):');
      expect(hint.textContent).toContain('not@valid');
      expect(hint.textContent).toContain('not a domain');
    });

    test('input blur clears hint when all entries are valid', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'a.com, b.com';
      input.dispatchEvent(new Event('blur'));

      const hint = document.getElementById('domain-filter-hint');
      expect(hint.textContent).toBe('');
    });

    test('typed domains survive a close that never fires blur', () => {
      chrome.storage.local.set.mockClear();
      const input = document.getElementById('domain-filter-input');
      input.value = 'api.example.com, hub.io';
      input.dispatchEvent(new Event('input'));

      // Esc / toolbar icon: the browser tears the popup down with no blur.
      window.dispatchEvent(new Event('pagehide'));

      const saved = chrome.storage.local.set.mock.calls.at(-1)[0].headerEditorData;
      expect(saved.profiles[popup.currentProfile].filters.domains.list).toEqual([
        'api.example.com',
        'hub.io',
      ]);
    });

    test('typing does NOT rewrite the field mid-word', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'https://api.exa';
      input.dispatchEvent(new Event('input'));

      expect(input.value).toBe('https://api.exa');
    });

    test('typing does NOT show the rejected-entries hint', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = 'not@valid';
      input.dispatchEvent(new Event('input'));

      expect(document.getElementById('domain-filter-hint').textContent).toBe('');
    });

    test('render shows saved list joined by commas', () => {
      popup.profiles[popup.currentProfile].filters.domains = {
        enabled: true,
        list: ['a.com', 'b.com'],
      };
      popup.filters.render();

      expect(document.getElementById('domain-filter-enabled').checked).toBe(true);
      expect(document.getElementById('domain-filter-input').value).toBe('a.com, b.com');
    });
  });

  describe('tab group filter', () => {
    test('row stays hidden on Firefox (browser.runtime.getBrowserInfo present)', () => {
      vi.stubGlobal('browser', { runtime: { getBrowserInfo: vi.fn() } });
      try {
        popup.filters.render();
        expect(document.getElementById('tab-group-filter-item').style.display).toBe('none');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    test('row shows on Chrome 137+ where browser is just an alias of chrome', () => {
      // setup.js sets global.browser = global.chrome (no getBrowserInfo)
      popup.filters.render();
      expect(document.getElementById('tab-group-filter-item').style.display).toBe('');
    });

    describe('on Chrome', () => {
      beforeEach(() => {
        vi.stubGlobal('browser', undefined); // navigator UA has no Firefox → Chrome
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      test('render shows the row and lists open groups', async () => {
        chrome.tabGroups.query.mockResolvedValue([
          { id: 5, title: 'SANDBOX', color: 'purple' },
          { id: 8, title: '', color: 'blue' },
        ]);

        popup.filters.render();
        await flushAsync();

        expect(document.getElementById('tab-group-filter-item').style.display).toBe('');
        const options = [...document.getElementById('tab-group-filter-select').options];
        expect(options).toHaveLength(3); // placeholder + 2 groups
        expect(options[1].textContent).toContain('SANDBOX');
        expect(options[2].textContent).toContain('(unnamed)');
      });

      test('saved group not currently open is appended and selected', async () => {
        chrome.tabGroups.query.mockResolvedValue([]);
        popup.profiles[popup.currentProfile].filters.tabGroup = {
          enabled: true,
          group: { id: 42, title: 'Old', color: 'red' },
        };

        popup.filters.render();
        await flushAsync();

        const select = document.getElementById('tab-group-filter-select');
        expect(select.value).toBe('42');
        expect(select.selectedOptions[0].textContent).toContain('(not open)');
      });

      test('select change persists {id, title, color}', async () => {
        chrome.tabGroups.query.mockResolvedValue([{ id: 5, title: 'SANDBOX', color: 'purple' }]);
        popup.filters.render();
        await flushAsync();

        const select = document.getElementById('tab-group-filter-select');
        select.value = '5';
        select.dispatchEvent(new Event('change'));

        expect(popup.profiles[popup.currentProfile].filters.tabGroup.group).toEqual({
          id: 5,
          title: 'SANDBOX',
          color: 'purple',
        });
      });

      test('enabling with no group selected picks the current tab group', async () => {
        chrome.tabs.query.mockResolvedValue([{ id: 1, groupId: 5 }]);
        chrome.tabGroups.get.mockResolvedValue({ id: 5, title: 'SANDBOX', color: 'purple' });
        chrome.tabGroups.query.mockResolvedValue([{ id: 5, title: 'SANDBOX', color: 'purple' }]);

        const checkbox = document.getElementById('tab-group-filter-enabled');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await flushAsync();

        const tabGroup = popup.profiles[popup.currentProfile].filters.tabGroup;
        expect(tabGroup.enabled).toBe(true);
        expect(tabGroup.group).toEqual({ id: 5, title: 'SANDBOX', color: 'purple' });
      });

      test('enabling on an ungrouped tab leaves group null', async () => {
        chrome.tabs.query.mockResolvedValue([{ id: 1, groupId: -1 }]);

        const checkbox = document.getElementById('tab-group-filter-enabled');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await flushAsync();

        const tabGroup = popup.profiles[popup.currentProfile].filters.tabGroup;
        expect(tabGroup.enabled).toBe(true);
        expect(tabGroup.group).toBeNull();
      });
    });
  });
});
