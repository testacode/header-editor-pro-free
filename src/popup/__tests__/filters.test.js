import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';

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

    test('input blur parses comma-separated domains', () => {
      const input = document.getElementById('domain-filter-input');
      input.value = ' api.example.com,  hub.io , ,';
      input.dispatchEvent(new Event('blur'));

      expect(popup.profiles[popup.currentProfile].filters.domains.list).toEqual([
        'api.example.com',
        'hub.io',
      ]);
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
    test('row stays hidden when unsupported (browser global set = Firefox)', () => {
      popup.filters.render();
      expect(document.getElementById('tab-group-filter-item').style.display).toBe('none');
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
