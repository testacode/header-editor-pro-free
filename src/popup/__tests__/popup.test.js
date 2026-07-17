import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';
import { hexToHsl, hslToHex } from '../color-utils.js';
import { RELEASE_HIGHLIGHTS } from '../update-notifications.js';

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

vi.stubGlobal('alert', vi.fn());
vi.stubGlobal(
  'confirm',
  vi.fn(() => true)
);

// colorPickerState is set at the end of loadData() happy path — signals init finished.
// In error path it is never set; use createPopupErrorPath() for those tests.
async function createPopup() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.colorPickerState).toBeDefined());
  return popup;
}

// For tests where loadData throws: wait for profiles to be set in catch block instead.
async function createPopupErrorPath() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.profiles).not.toEqual({}));
  return popup;
}

describe('HeaderEditorPopup', () => {
  let popup;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.innerHTML = popupHtml;
    // Default mock: empty storage → defaults
    chrome.storage.local.get.mockResolvedValue({});
    popup = await createPopup();
  });

  // ─── loadData ───────────────────────────────────────────────────────────────

  describe('loadData', () => {
    test('empty storage → default profile with enabled=true', () => {
      expect(popup.profiles.default).toBeDefined();
      expect(popup.profiles.default.name).toBe('Default');
      expect(popup.currentProfile).toBe('default');
      expect(popup.isEnabled).toBe(true);
      expect(popup.isPaused).toBe(false);
      expect(popup.isPinned).toBe(false);
      expect(popup.profileCounter).toBe(1);
    });

    test('storage with data → state hydrated', async () => {
      const mockData = {
        profiles: {
          default: { name: 'My Profile', description: 'desc', requestHeaders: [] },
        },
        currentProfile: 'default',
        enabled: false,
        paused: true,
        pinned: true,
        profileCounter: 5,
      };
      chrome.storage.local.get.mockResolvedValue({ headerEditorData: mockData });

      document.documentElement.innerHTML = popupHtml;
      const p = await createPopup();

      expect(p.profiles.default.name).toBe('My Profile');
      expect(p.isEnabled).toBe(false);
      expect(p.isPaused).toBe(true);
      expect(p.isPinned).toBe(true);
      expect(p.profileCounter).toBe(5);
    });

    test('storage error → falls back to defaults', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      document.documentElement.innerHTML = popupHtml;
      // colorPickerState is NOT set in the error path — use error-path helper
      const p = await createPopupErrorPath();

      expect(p.profiles.default).toBeDefined();
      expect(p.currentProfile).toBe('default');
      expect(p.isEnabled).toBe(true);
    });

    test('colorPickerState is initialized after loadData', () => {
      expect(popup.colorPickerState).toBeDefined();
      expect(popup.colorPickerState.currentTab).toBe('background');
    });
  });

  // ─── refreshHeaders ───────────────────────────────────────────────────────────

  describe('refreshHeaders', () => {
    test('reloads state from storage (not just re-render of memory)', async () => {
      // Storage changes after the initial load; refreshHeaders must pick it up.
      chrome.storage.local.get.mockResolvedValue({
        headerEditorData: {
          profiles: { default: { name: 'Reloaded', description: 'd', requestHeaders: [] } },
          currentProfile: 'default',
          enabled: false,
          paused: false,
          pinned: false,
          profileCounter: 3,
        },
      });

      await popup.refreshHeaders();

      expect(popup.profiles.default.name).toBe('Reloaded');
      expect(popup.isEnabled).toBe(false);
      expect(popup.profileCounter).toBe(3);
    });
  });

  // ─── migrateHeaderFormat ─────────────────────────────────────────────────────

  describe('migrateHeaderFormat', () => {
    test('adds enabled:true to headers missing the field', () => {
      popup.profiles = {
        test: { requestHeaders: [{ name: 'X-Foo', value: 'bar' }] },
      };
      popup.migrateHeaderFormat();
      expect(popup.profiles.test.requestHeaders[0].enabled).toBe(true);
    });

    test('preserves existing enabled:false value', () => {
      popup.profiles = {
        test: { requestHeaders: [{ name: 'X-Foo', value: 'bar', enabled: false }] },
      };
      popup.migrateHeaderFormat();
      expect(popup.profiles.test.requestHeaders[0].enabled).toBe(false);
    });

    test('profile without requestHeaders is left untouched', () => {
      popup.profiles = { test: { name: 'No Headers' } };
      expect(() => popup.migrateHeaderFormat()).not.toThrow();
    });
  });

  // ─── saveData ────────────────────────────────────────────────────────────────

  describe('saveData', () => {
    test('persists current state to chrome.storage.local with correct key', async () => {
      chrome.storage.local.set.mockClear();
      await popup.saveData();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        headerEditorData: {
          profiles: popup.profiles,
          currentProfile: popup.currentProfile,
          enabled: popup.isEnabled,
          paused: popup.isPaused,
          pinned: popup.isPinned,
          profileCounter: popup.profileCounter,
        },
      });
    });

    test('does NOT call sendMessage (plan 004 removed it)', async () => {
      chrome.storage.local.set.mockClear();
      chrome.runtime.sendMessage.mockClear();
      await popup.saveData();

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'updateHeaders' })
      );
    });
  });

  // ─── Profile management ───────────────────────────────────────────────────────

  describe('createNewProfile', () => {
    test('counter increments, new profile becomes active', () => {
      const initialCounter = popup.profileCounter;
      popup.createNewProfile();

      expect(popup.profileCounter).toBe(initialCounter + 1);
      expect(popup.currentProfile).toMatch(/^profile_\d+$/);
      expect(popup.profiles[popup.currentProfile]).toBeDefined();
      expect(popup.profiles[popup.currentProfile].name).toBe(`Profile ${popup.profileCounter}`);
    });

    test('new profile has requestHeaders array', () => {
      popup.createNewProfile();
      expect(popup.profiles[popup.currentProfile].requestHeaders).toEqual([]);
    });

    test('new profile has description field', () => {
      popup.createNewProfile();
      // Real code sets 'Click to edit description' as description
      expect(popup.profiles[popup.currentProfile].description).toBeDefined();
    });
  });

  describe('switchProfile', () => {
    test('switches currentProfile and saves', async () => {
      popup.profiles.other = { name: 'Other', requestHeaders: [] };
      chrome.storage.local.set.mockClear();

      await popup.switchProfile('other');

      expect(popup.currentProfile).toBe('other');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('switching to non-existent profile does nothing', async () => {
      const original = popup.currentProfile;
      chrome.storage.local.set.mockClear();

      await expect(popup.switchProfile('nope')).resolves.not.toThrow();

      expect(popup.currentProfile).toBe(original);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    test('switching to existing profile updates currentProfile and saves', async () => {
      popup.profiles.sanity = { name: 'Sanity', requestHeaders: [] };
      chrome.storage.local.set.mockClear();

      await popup.switchProfile('sanity');

      expect(popup.currentProfile).toBe('sanity');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('deleteCurrentProfile (deleteCurrentProfile method)', () => {
    test('deletes non-default profile when confirm returns true', async () => {
      // Setup a non-default profile
      popup.profiles.toDelete = { name: 'Delete Me', requestHeaders: [] };
      popup.currentProfile = 'toDelete';
      vi.mocked(confirm).mockReturnValue(true);

      await popup.deleteCurrentProfile();

      expect(popup.profiles.toDelete).toBeUndefined();
      expect(popup.currentProfile).toBe('default');
    });

    test('does not delete when confirm returns false', async () => {
      popup.profiles.toDelete = { name: 'Keep Me', requestHeaders: [] };
      popup.currentProfile = 'toDelete';
      vi.mocked(confirm).mockReturnValue(false);

      await popup.deleteCurrentProfile();

      expect(popup.profiles.toDelete).toBeDefined();
    });

    test('cannot delete default profile (returns early)', async () => {
      popup.currentProfile = 'default';
      vi.mocked(confirm).mockReturnValue(true);
      const initialProfiles = { ...popup.profiles };

      await popup.deleteCurrentProfile();

      expect(popup.profiles.default).toBeDefined();
      expect(Object.keys(popup.profiles)).toEqual(Object.keys(initialProfiles));
    });
  });

  describe('showProfileMenu (right-click context menu)', () => {
    test('deletes profile when confirm returns true', () => {
      popup.profiles.ctx = { name: 'Context Profile', requestHeaders: [] };
      vi.mocked(confirm).mockReturnValue(true);

      popup.showProfileMenu('ctx');

      expect(popup.profiles.ctx).toBeUndefined();
    });

    test('cannot delete default via context menu', () => {
      vi.mocked(confirm).mockReturnValue(true);
      popup.showProfileMenu('default');
      expect(popup.profiles.default).toBeDefined();
    });
  });

  // ─── Header management ────────────────────────────────────────────────────────

  describe('addHeader', () => {
    test('pushes {name:"",value:"",enabled:true} to requestHeaders', () => {
      const before = popup.profiles[popup.currentProfile].requestHeaders.length;
      popup.addHeader('request');
      const after = popup.profiles[popup.currentProfile].requestHeaders.length;

      expect(after).toBe(before + 1);
      expect(popup.profiles[popup.currentProfile].requestHeaders[after - 1]).toEqual({
        name: '',
        value: '',
        enabled: true,
      });
    });

    test('does NOT call saveData immediately (waits for user input)', () => {
      chrome.storage.local.set.mockClear();
      popup.addHeader('request');
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('updateHeader', () => {
    beforeEach(() => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Foo', value: 'bar', enabled: true },
      ];
    });

    test('mutates header at correct index', async () => {
      await popup.updateHeader('request', 0, 'name', 'X-New');
      expect(popup.profiles[popup.currentProfile].requestHeaders[0].name).toBe('X-New');
    });

    test('saves immediately when field is "enabled"', async () => {
      chrome.storage.local.set.mockClear();
      await popup.updateHeader('request', 0, 'enabled', false);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('does NOT save for non-enabled fields (save happens on blur)', async () => {
      chrome.storage.local.set.mockClear();
      await popup.updateHeader('request', 0, 'name', 'New');
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    test('out-of-bounds index is a no-op', async () => {
      await popup.updateHeader('request', 99, 'name', 'Ghost');
      expect(popup.profiles[popup.currentProfile].requestHeaders[0].name).toBe('X-Foo');
    });
  });

  describe('removeHeader', () => {
    beforeEach(() => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'H1', value: 'v1', enabled: true },
        { name: 'H2', value: 'v2', enabled: true },
      ];
    });

    test('removes header at index and saves', async () => {
      chrome.storage.local.set.mockClear();
      await popup.removeHeader('request', 0);
      expect(popup.profiles[popup.currentProfile].requestHeaders).toHaveLength(1);
      expect(popup.profiles[popup.currentProfile].requestHeaders[0].name).toBe('H2');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('copyHeaderToProfile', () => {
    beforeEach(() => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Foo', value: 'bar', enabled: false },
      ];
      popup.profiles.other = {
        name: 'Other',
        description: '',
        requestHeaders: [{ name: 'Existing', value: 'v', enabled: true }],
        responseHeaders: [],
      };
    });

    test('appends a normalized copy preserving enabled/appendMode', async () => {
      chrome.storage.local.set.mockClear();
      await popup.copyHeaderToProfile('request', 0, 'other');

      expect(popup.profiles.other.requestHeaders).toHaveLength(2);
      expect(popup.profiles.other.requestHeaders[1]).toEqual({
        name: 'X-Foo',
        value: 'bar',
        enabled: false,
        appendMode: false,
      });
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('source header is left untouched', async () => {
      await popup.copyHeaderToProfile('request', 0, 'other');
      expect(popup.profiles[popup.currentProfile].requestHeaders[0]).toEqual({
        name: 'X-Foo',
        value: 'bar',
        enabled: false,
      });
    });

    test('initializes missing headers array on target profile', async () => {
      delete popup.profiles.other.responseHeaders;
      popup.profiles[popup.currentProfile].responseHeaders = [
        { name: 'X-Resp', value: 'r', enabled: true },
      ];

      await popup.copyHeaderToProfile('response', 0, 'other');

      expect(popup.profiles.other.responseHeaders).toEqual([
        { name: 'X-Resp', value: 'r', enabled: true, appendMode: false },
      ]);
    });

    test('preserves appendMode when copying header', async () => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'Accept', value: 'x', enabled: true, appendMode: true },
      ];
      await popup.copyHeaderToProfile('request', 0, 'other');

      expect(popup.profiles.other.requestHeaders).toContainEqual({
        name: 'Accept',
        value: 'x',
        enabled: true,
        appendMode: true,
      });
    });

    test('unknown target profile is a no-op', async () => {
      chrome.storage.local.set.mockClear();
      await popup.copyHeaderToProfile('request', 0, 'ghost');
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    test('out-of-bounds index is a no-op', async () => {
      chrome.storage.local.set.mockClear();
      await popup.copyHeaderToProfile('request', 99, 'other');
      expect(popup.profiles.other.requestHeaders).toHaveLength(1);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    test('shows confirmation toast with target profile name', async () => {
      await popup.copyHeaderToProfile('request', 0, 'other');
      const toast = document.querySelector('.copy-toast');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBe('✓ Copied to "Other"');
    });
  });

  describe('copy-to-profile UI', () => {
    test('copy button hidden with a single profile', () => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Foo', value: 'bar', enabled: true },
      ];
      popup.renderHeadersList('request');
      expect(document.querySelector('.header-copy')).toBeNull();
    });

    test('copy button rendered when another profile exists', () => {
      popup.profiles.other = { name: 'Other', requestHeaders: [], responseHeaders: [] };
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Foo', value: 'bar', enabled: true },
      ];
      popup.renderHeadersList('request');
      expect(document.querySelector('.header-copy')).not.toBeNull();
    });

    test('dropdown lists other profiles only and copies on click', async () => {
      popup.profiles.other = {
        name: 'Other',
        requestHeaders: [],
        responseHeaders: [],
        backgroundColor: '#2196f3',
      };
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Foo', value: 'bar', enabled: true },
      ];
      popup.renderHeadersList('request');

      document.querySelector('.header-copy').click();

      const items = document.querySelectorAll('.copy-dropdown .dropdown-item');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Other');

      items[0].click();
      await vi.waitFor(() => expect(popup.profiles.other.requestHeaders).toHaveLength(1));
      expect(popup.profiles.other.requestHeaders[0]).toEqual({
        name: 'X-Foo',
        value: 'bar',
        enabled: true,
        appendMode: false,
      });
      // Dropdown closes after copying
      expect(document.querySelector('.copy-dropdown')).toBeNull();
    });

    test('clicking the copy button twice toggles the dropdown closed', () => {
      popup.profiles.other = { name: 'Other', requestHeaders: [], responseHeaders: [] };
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Foo', value: 'bar', enabled: true },
      ];
      popup.renderHeadersList('request');

      const copyBtn = document.querySelector('.header-copy');
      copyBtn.click();
      expect(document.querySelector('.copy-dropdown')).not.toBeNull();
      copyBtn.click();
      expect(document.querySelector('.copy-dropdown')).toBeNull();
    });
  });

  // ─── Pause / Pin ─────────────────────────────────────────────────────────────

  describe('togglePause', () => {
    test('inverts isPaused and saves', async () => {
      const before = popup.isPaused;
      chrome.storage.local.set.mockClear();

      await popup.togglePause();

      expect(popup.isPaused).toBe(!before);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('togglePin', () => {
    test('inverts isPinned and saves', async () => {
      const before = popup.isPinned;
      chrome.storage.local.set.mockClear();

      await popup.togglePin();

      expect(popup.isPinned).toBe(!before);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  // ─── Import / Export utilities ────────────────────────────────────────────────

  describe('extractHeadersFromArray', () => {
    test('normalizes {name,value,enabled} and filters items without name string', () => {
      const input = [
        { name: 'X-Foo', value: 'bar', enabled: false },
        { name: '', value: 'ignored' },
        { value: 'no-name' },
        { name: 'X-Valid' },
      ];
      const result = popup.importExport.extractHeadersFromArray(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'X-Foo', value: 'bar', enabled: false, appendMode: false });
      expect(result[1]).toEqual({ name: 'X-Valid', value: '', enabled: true, appendMode: false });
    });

    test('enabled defaults to true when not false', () => {
      const result = popup.importExport.extractHeadersFromArray([{ name: 'H', value: 'v' }]);
      expect(result[0].enabled).toBe(true);
    });
  });

  describe('convertToModHeaderFormat', () => {
    test('converts requestHeaders to ModHeader array format', () => {
      const profile = {
        requestHeaders: [
          { name: 'X-A', value: 'a', enabled: true },
          { name: 'X-B', value: 'b', enabled: false },
          { name: '', value: 'skipped', enabled: true }, // empty name filtered
        ],
      };
      const result = popup.importExport.convertToModHeaderFormat(profile);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ appendMode: false, enabled: true, name: 'X-A', value: 'a' });
      expect(result[1]).toEqual({ appendMode: false, enabled: false, name: 'X-B', value: 'b' });
    });

    test('profile with no requestHeaders returns empty array', () => {
      const result = popup.importExport.convertToModHeaderFormat({});
      expect(result).toEqual([]);
    });
  });

  describe('importProfileFromData', () => {
    test('array input creates a new profile from headers', async () => {
      const profilesBefore = Object.keys(popup.profiles).length;
      await popup.importExport.importProfileFromData([{ name: 'X-Test', value: 'v' }]);
      expect(Object.keys(popup.profiles).length).toBe(profilesBefore + 1);
    });

    test('object with profiles key imports multiple profiles', async () => {
      const exportData = {
        profiles: {
          p1: { name: 'P1', description: '', requestHeaders: [] },
        },
        currentProfile: 'p1',
      };
      const profilesBefore = Object.keys(popup.profiles).length;
      await popup.importExport.importProfileFromData(exportData);
      expect(Object.keys(popup.profiles).length).toBe(profilesBefore + 1);
    });

    test('invalid format (no array, no profiles key) throws', async () => {
      await expect(popup.importExport.importProfileFromData({ invalid: true })).rejects.toThrow();
    });

    test('round-trip preserves filters and colors (plan 032)', async () => {
      // Set up a profile with filters and custom colors
      popup.profiles[popup.currentProfile] = {
        name: 'TestProfile',
        description: 'Test',
        requestHeaders: [{ name: 'X-Test', value: 'val', enabled: true }],
        responseHeaders: [],
        filters: {
          domains: { enabled: true, list: ['example.com'] },
          tabGroup: { enabled: false, group: null },
        },
        backgroundColor: '#123456',
        textColor: '#ffffff',
      };

      // Export all profiles
      popup.importExport.showExportModal();
      document.querySelector('input[name="export-scope"][value="all"]').checked = true;
      popup.importExport.updateExportData();

      // Get the exported data
      const exportedJson = JSON.parse(document.getElementById('json-textarea').value);

      // Verify the export contains filters and colors
      const exportedProfile = Object.values(exportedJson.profiles)[0];
      expect(exportedProfile.filters).toBeDefined();
      expect(exportedProfile.filters.domains.enabled).toBe(true);
      expect(exportedProfile.backgroundColor).toBe('#123456');
      expect(exportedProfile.textColor).toBe('#ffffff');

      // Create a new profile and import the exported data
      popup.createNewProfile();

      await popup.importExport.importMultipleProfiles(exportedJson);

      // Find the imported profile (should be the new current profile)
      const importedProfile = popup.profiles[popup.currentProfile];
      expect(importedProfile.filters).toEqual({
        domains: { enabled: true, list: ['example.com'] },
        tabGroup: { enabled: false, group: null },
      });
      expect(importedProfile.backgroundColor).toBe('#123456');
      expect(importedProfile.textColor).toBe('#ffffff');
    });

    test('old backup without filters field still imports (plan 032)', async () => {
      const oldExport = {
        profiles: {
          p1: {
            name: 'OldProfile',
            description: 'From old backup',
            requestHeaders: [{ name: 'X-Old', value: 'v', enabled: true }],
            responseHeaders: [],
            // Note: no filters, backgroundColor, or textColor
          },
        },
      };

      const profilesBefore = Object.keys(popup.profiles).length;
      await popup.importExport.importMultipleProfiles(oldExport);
      expect(Object.keys(popup.profiles).length).toBe(profilesBefore + 1);

      // Verify the imported profile doesn't have colors set (filters gets defaults by design in migrateProfileFormat)
      const importedProfile = popup.profiles[popup.currentProfile];
      expect(importedProfile.name).toBe('OldProfile');
      // backgroundColor and textColor should not be added from old backups that don't have them
      expect(importedProfile).not.toHaveProperty('backgroundColor');
      expect(importedProfile).not.toHaveProperty('textColor');
    });
  });

  describe('replaceCurrentProfile (plan 032)', () => {
    test('rejects ModHeader profile exports with error', async () => {
      const modHeaderExport = [
        {
          title: 'ModHeaderProfile',
          headers: [{ name: 'X-Test', value: 'v', enabled: true }],
        },
      ];

      // Store initial headers
      const initialHeaders = popup.profiles[popup.currentProfile].requestHeaders;

      // Attempt to replace with ModHeader export should throw
      await expect(popup.importExport.replaceCurrentProfile(modHeaderExport)).rejects.toThrow(
        'This is a ModHeader profile export'
      );

      // Verify the current profile's requestHeaders are unchanged
      expect(popup.profiles[popup.currentProfile].requestHeaders).toEqual(initialHeaders);
    });

    test('replaces with single-profile full export and restores filters', async () => {
      // Set up initial profile state
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-Initial', value: 'initial', enabled: true },
      ];
      popup.profiles[popup.currentProfile].filters = {
        domains: { enabled: false, list: [] },
        tabGroup: { enabled: false, group: null },
      };

      // Create replacement data with filters and colors
      const replacementData = {
        profiles: {
          replacement: {
            name: 'ReplacementProfile',
            description: 'To replace',
            requestHeaders: [{ name: 'X-New', value: 'new', enabled: true }],
            responseHeaders: [],
            filters: {
              domains: { enabled: true, list: ['newdomain.com'] },
              tabGroup: { enabled: false, group: null },
            },
            backgroundColor: '#abcdef',
            textColor: '#000000',
          },
        },
      };

      await popup.importExport.replaceCurrentProfile(replacementData);

      // Verify headers were replaced
      const currentProfile = popup.profiles[popup.currentProfile];
      expect(currentProfile.requestHeaders).toHaveLength(1);
      expect(currentProfile.requestHeaders[0].name).toBe('X-New');

      // Verify filters and colors were restored
      expect(currentProfile.filters.domains.enabled).toBe(true);
      expect(currentProfile.filters.domains.list).toEqual(['newdomain.com']);
      expect(currentProfile.backgroundColor).toBe('#abcdef');
      expect(currentProfile.textColor).toBe('#000000');
    });
  });

  // ─── renderUI DOM smoke test ──────────────────────────────────────────────────

  describe('renderUI', () => {
    test('profile circles reflect current profile count', () => {
      popup.createNewProfile();
      popup.renderUI();

      const circles = document.querySelectorAll('.profile-circle');
      expect(circles.length).toBe(Object.keys(popup.profiles).length);
    });

    test('after render, header inputs match stored headers', () => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'X-First', value: 'one', enabled: true },
        { name: 'X-Second', value: 'two', enabled: true },
      ];
      popup.renderUI();

      const nameInputs = document.querySelectorAll('.header-name');
      expect(nameInputs).toHaveLength(2);
      expect(nameInputs[0].value).toBe('X-First');
      expect(nameInputs[1].value).toBe('X-Second');
    });
  });

  // ─── response headers (plan 027) ────────────────────────────────────────────────

  describe('response headers', () => {
    test('addHeader("response") initializes the field on a legacy profile and adds', () => {
      delete popup.profiles[popup.currentProfile].responseHeaders; // simulate pre-027 profile
      popup.addHeader('response');
      expect(popup.profiles[popup.currentProfile].responseHeaders).toHaveLength(1);
    });

    test('response headers render in the response list, not the request list', () => {
      popup.profiles[popup.currentProfile].requestHeaders = [];
      popup.profiles[popup.currentProfile].responseHeaders = [
        { name: 'X-Resp', value: 'r', enabled: true },
      ];
      popup.renderHeaders();

      expect(document.getElementById('response-headers-list').children).toHaveLength(1);
      expect(document.getElementById('request-headers-list').children).toHaveLength(0);
    });

    test('importMultipleProfiles preserves responseHeaders (round-trip)', async () => {
      const exportData = {
        profiles: {
          p1: {
            name: 'P1',
            description: '',
            requestHeaders: [{ name: 'X-Req', value: 'q', enabled: true }],
            responseHeaders: [{ name: 'X-Resp', value: 'r', enabled: true }],
          },
        },
      };
      const before = Object.keys(popup.profiles);
      await popup.importExport.importMultipleProfiles(exportData);
      const key = Object.keys(popup.profiles).find(k => !before.includes(k));

      expect(popup.profiles[key].responseHeaders).toEqual([
        { name: 'X-Resp', value: 'r', enabled: true, appendMode: false },
      ]);
    });

    test('malformed responseHeaders (non-array) sanitizes to []', async () => {
      const exportData = {
        profiles: { p1: { name: 'P1', requestHeaders: [], responseHeaders: 'nope' } },
      };
      const before = Object.keys(popup.profiles);
      await popup.importExport.importMultipleProfiles(exportData);
      const key = Object.keys(popup.profiles).find(k => !before.includes(k));

      expect(popup.profiles[key].responseHeaders).toEqual([]);
    });
  });

  // ─── append mode (plan 028) ─────────────────────────────────────────────────────

  describe('append mode', () => {
    test('append toggle reflects the header appendMode state', () => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'Accept', value: 'x', enabled: true, appendMode: true },
        { name: 'X-Set', value: 'y', enabled: true, appendMode: false },
      ];
      popup.renderHeaders();

      const toggles = document
        .getElementById('request-headers-list')
        .querySelectorAll('.header-append-toggle');
      expect(toggles).toHaveLength(2);
      expect(toggles[0].classList.contains('active')).toBe(true);
      expect(toggles[1].classList.contains('active')).toBe(false);
    });

    test('clicking the toggle updates appendMode and saves', () => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'Accept', value: 'x', enabled: true, appendMode: false },
      ];
      popup.renderHeaders();
      const saveSpy = vi.spyOn(popup, 'saveData').mockResolvedValue(undefined);

      const toggle = document
        .getElementById('request-headers-list')
        .querySelector('.header-append-toggle');
      toggle.click();

      expect(popup.profiles[popup.currentProfile].requestHeaders[0].appendMode).toBe(true);
      expect(saveSpy).toHaveBeenCalled();
      expect(toggle.classList.contains('active')).toBe(true);
    });

    test('ModHeader import preserves appendMode:true (no silent degrade)', async () => {
      const withAppend = [
        {
          title: 'Append Profile',
          headers: [{ enabled: true, name: 'Accept', value: 'text/html', appendMode: true }],
          respHeaders: [],
          filters: [],
        },
      ];
      const before = Object.keys(popup.profiles);
      await popup.importExport.importProfileFromData(withAppend);
      const key = Object.keys(popup.profiles).find(k => !before.includes(k));

      expect(popup.profiles[key].requestHeaders[0].appendMode).toBe(true);
    });
  });

  // ─── Color utilities ──────────────────────────────────────────────────────────

  describe('color utilities', () => {
    test('hexToHsl converts #ff0000 to hue 0', () => {
      const result = hexToHsl('#ff0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(1);
      expect(result.l).toBe(0.5);
    });

    test('hslToHex converts 0,1,0.5 to #ff0000', () => {
      expect(hslToHex(0, 1, 0.5)).toBe('#ff0000');
    });

    test('round-trip is within ±1 per channel', () => {
      const original = '#4caf50';
      const hsl = hexToHsl(original);
      const converted = hslToHex(hsl.h, hsl.s, hsl.l);

      for (let i = 0; i < 3; i++) {
        const offset = 1 + i * 2;
        const a = parseInt(original.slice(offset, offset + 2), 16);
        const b = parseInt(converted.slice(offset, offset + 2), 16);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── migrateProfileFormat ────────────────────────────────────────────────────

  describe('migrateProfileFormat', () => {
    test('adds placeholder description to profile missing it', () => {
      popup.profiles = { test: { name: 'Test' } };
      popup.migrateProfileFormat();
      expect(popup.profiles.test.description).toBe('');
    });

    test('default profile with no description gets placeholder', () => {
      popup.profiles = { default: { name: 'Default' } };
      popup.migrateProfileFormat();
      expect(popup.profiles.default.description).toBe('Click to edit description');
    });

    test('default profile with empty string description gets placeholder', () => {
      popup.profiles = { default: { name: 'Default', description: '' } };
      popup.migrateProfileFormat();
      expect(popup.profiles.default.description).toBe('Click to edit description');
    });

    test('existing non-empty description is preserved', () => {
      popup.profiles = { test: { name: 'Test', description: 'My desc' } };
      popup.migrateProfileFormat();
      expect(popup.profiles.test.description).toBe('My desc');
    });
  });

  // ─── updateToolbar / renderProfileCircles ────────────────────────────────────

  describe('updateToolbar', () => {
    test('sets profile name input value', () => {
      popup.profiles[popup.currentProfile].name = 'My Profile';
      popup.updateToolbar();
      expect(document.getElementById('profile-name-input').value).toBe('My Profile');
    });

    test('pause button gets "paused" class when isPaused', () => {
      popup.isPaused = true;
      popup.updateToolbar();
      expect(document.getElementById('pause-btn').classList.contains('paused')).toBe(true);
    });

    test('pause button does not have "paused" class when not paused', () => {
      popup.isPaused = false;
      popup.updateToolbar();
      expect(document.getElementById('pause-btn').classList.contains('paused')).toBe(false);
    });

    test('pin button gets "pinned" class when isPinned', () => {
      popup.isPinned = true;
      popup.updateToolbar();
      expect(document.getElementById('pin-btn').classList.contains('pinned')).toBe(true);
    });
  });

  describe('renderProfileCircles', () => {
    test('creates a circle element per profile', () => {
      popup.profiles.extra = {
        name: 'Extra',
        requestHeaders: [],
        backgroundColor: '#ff0000',
        textColor: '#ffffff',
      };
      popup.renderProfileCircles();
      const circles = document.querySelectorAll('.profile-circle');
      expect(circles.length).toBe(2); // default + extra
    });

    test('active profile circle has "active" class', () => {
      popup.renderProfileCircles();
      const circles = document.querySelectorAll('.profile-circle');
      const activeCircle = [...circles].find(c => c.classList.contains('active'));
      expect(activeCircle).toBeDefined();
    });
  });

  // ─── updateProfileName / updateProfileDescription ─────────────────────────────

  describe('updateProfileName', () => {
    test('updates profile name and saves', async () => {
      chrome.storage.local.set.mockClear();
      await popup.updateProfileName('New Name');
      expect(popup.profiles[popup.currentProfile].name).toBe('New Name');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('empty/whitespace name restores toolbar (no save)', async () => {
      chrome.storage.local.set.mockClear();
      const originalName = popup.profiles[popup.currentProfile].name;
      await popup.updateProfileName('   ');
      expect(popup.profiles[popup.currentProfile].name).toBe(originalName);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('updateProfileDescription', () => {
    test('updates profile description and saves', async () => {
      chrome.storage.local.set.mockClear();
      await popup.updateProfileDescription('my desc');
      expect(popup.profiles[popup.currentProfile].description).toBe('my desc');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('empty description hides the description div', async () => {
      await popup.updateProfileDescription('');
      expect(document.getElementById('profile-description').style.display).toBe('none');
    });
  });

  // ─── Modal methods ────────────────────────────────────────────────────────────

  describe('showImportModal', () => {
    test('sets modal-title to "Import Configuration"', () => {
      popup.importExport.showImportModal();
      expect(document.getElementById('modal-title').textContent).toBe('Import Configuration');
    });

    test('shows modal-overlay', () => {
      popup.importExport.showImportModal();
      expect(document.getElementById('modal-overlay').style.display).toBe('flex');
    });

    test('modal-download button is hidden in import mode', () => {
      popup.importExport.showImportModal();
      expect(document.getElementById('modal-download').style.display).toBe('none');
    });
  });

  describe('showExportModal', () => {
    test('sets modal-title to "Export Configuration"', () => {
      popup.importExport.showExportModal();
      expect(document.getElementById('modal-title').textContent).toBe('Export Configuration');
    });

    test('shows modal-overlay', () => {
      popup.importExport.showExportModal();
      expect(document.getElementById('modal-overlay').style.display).toBe('flex');
    });

    test('modal-action button is hidden, modal-copy is shown', () => {
      popup.importExport.showExportModal();
      expect(document.getElementById('modal-action').style.display).toBe('none');
      expect(document.getElementById('modal-copy').style.display).toBe('block');
    });

    test('modal-download button is visible in export mode', () => {
      popup.importExport.showExportModal();
      expect(document.getElementById('modal-download').style.display).toBe('block');
    });
  });

  describe('closeModal', () => {
    test('hides the modal-overlay', () => {
      document.getElementById('modal-overlay').style.display = 'flex';
      popup.importExport.closeModal();
      expect(document.getElementById('modal-overlay').style.display).toBe('none');
    });
  });

  describe('validateJSON', () => {
    beforeEach(() => {
      popup.currentModalMode = 'import';
    });

    test('empty textarea clears message and disables action button', () => {
      document.getElementById('json-textarea').value = '';
      popup.importExport.validateJSON();
      expect(document.getElementById('validation-message').textContent).toBe('');
      expect(document.getElementById('modal-action').disabled).toBe(true);
    });

    test('valid JSON array shows success and enables button', () => {
      document.getElementById('json-textarea').value = JSON.stringify([
        { name: 'X-Foo', value: 'bar' },
      ]);
      popup.importExport.validateJSON();
      expect(document.getElementById('validation-message').innerHTML).toContain('✓');
      expect(document.getElementById('modal-action').disabled).toBe(false);
    });

    test('invalid JSON shows error', () => {
      document.getElementById('json-textarea').value = 'not json';
      popup.importExport.validateJSON();
      expect(document.getElementById('validation-message').innerHTML).toContain('✗');
      expect(document.getElementById('modal-action').disabled).toBe(true);
    });

    test('JSON object (not array) in import mode shows error', () => {
      document.getElementById('json-textarea').value = JSON.stringify({ key: 'val' });
      popup.importExport.validateJSON();
      expect(document.getElementById('validation-message').innerHTML).toContain('✗');
    });

    test('full export object ({profiles}) in import mode shows success (plan 018)', () => {
      document.getElementById('json-textarea').value = JSON.stringify({
        profiles: {
          p1: { name: 'P1', description: '', requestHeaders: [] },
          p2: { name: 'P2', description: '', requestHeaders: [] },
        },
      });
      popup.importExport.validateJSON();
      expect(document.getElementById('validation-message').innerHTML).toContain('✓');
      expect(document.getElementById('modal-action').disabled).toBe(false);
    });
  });

  // ─── toggleDropdown / closeDropdown ──────────────────────────────────────────

  describe('toggleDropdown', () => {
    test('toggles dropdown visibility from none to block', () => {
      document.getElementById('profile-dropdown').style.display = 'none';
      popup.toggleDropdown();
      expect(document.getElementById('profile-dropdown').style.display).toBe('block');
    });

    test('toggles dropdown from block to none', () => {
      document.getElementById('profile-dropdown').style.display = 'block';
      popup.toggleDropdown();
      expect(document.getElementById('profile-dropdown').style.display).toBe('none');
    });
  });

  describe('closeDropdown', () => {
    test('hides dropdown', () => {
      document.getElementById('profile-dropdown').style.display = 'block';
      popup.closeDropdown();
      expect(document.getElementById('profile-dropdown').style.display).toBe('none');
    });
  });

  // ─── reorderHeaders ───────────────────────────────────────────────────────────

  describe('reorderHeaders', () => {
    test('moves header from one index to another', async () => {
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'H1', value: 'v1', enabled: true },
        { name: 'H2', value: 'v2', enabled: true },
        { name: 'H3', value: 'v3', enabled: true },
      ];
      await popup.reorderHeaders('request', 0, 2);
      const headers = popup.profiles[popup.currentProfile].requestHeaders;
      expect(headers[0].name).toBe('H2');
      expect(headers[1].name).toBe('H3');
      expect(headers[2].name).toBe('H1');
    });
  });

  // ─── auto-close on blur ───────────────────────────────────────────────────────

  describe('auto-close on blur (handleWindowBlur)', () => {
    test('no modal/dropdown/drag → closes the popup', () => {
      window.close.mockClear();
      popup.handleWindowBlur();
      expect(window.close).toHaveBeenCalled();
    });

    test('during a header drag does NOT close (Linux fires blur on dragstart)', () => {
      window.close.mockClear();
      popup.handleDragStart(
        { target: document.createElement('div'), dataTransfer: { setData: vi.fn() } },
        'request',
        0
      );

      popup.handleWindowBlur();
      expect(window.close).not.toHaveBeenCalled();

      popup.handleDragEnd({});
      popup.handleWindowBlur();
      expect(window.close).toHaveBeenCalled();
    });

    test('while pinned does NOT close', () => {
      window.close.mockClear();
      popup.isPinned = true;
      popup.handleWindowBlur();
      expect(window.close).not.toHaveBeenCalled();
    });
  });

  // ─── showUpdateTooltip / showWelcomeTooltip ───────────────────────────────────

  describe('showUpdateTooltip', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test('appends a tooltip with interpolated versions', () => {
      popup.updateNotifications.showUpdateTooltip({
        previousVersion: '1.0',
        currentVersion: '2.0',
      });
      const tooltip = document.querySelector('.update-notification');
      expect(tooltip).not.toBeNull();
      expect(tooltip.textContent).toContain('1.0');
      expect(tooltip.textContent).toContain('2.0');
    });

    test('auto-closes after 6s then slide-out', () => {
      popup.updateNotifications.showUpdateTooltip({
        previousVersion: '1.0',
        currentVersion: '2.0',
      });
      expect(document.querySelector('.update-notification')).not.toBeNull();
      vi.advanceTimersByTime(6000 + 300);
      expect(document.querySelector('.update-notification')).toBeNull();
    });

    test('close button removes the tooltip', () => {
      popup.updateNotifications.showUpdateTooltip({
        previousVersion: '1.0',
        currentVersion: '2.0',
      });
      document.querySelector('.update-close').click();
      vi.advanceTimersByTime(300);
      expect(document.querySelector('.update-notification')).toBeNull();
    });

    test('version with a release highlight shows it as subtitle', () => {
      RELEASE_HIGHLIGHTS['9.9.9'] = 'New: something shiny — look under Response headers.';
      try {
        popup.updateNotifications.showUpdateTooltip({
          previousVersion: '9.9.8',
          currentVersion: '9.9.9',
        });
        expect(document.querySelector('.update-subtitle').textContent).toContain('something shiny');
      } finally {
        delete RELEASE_HIGHLIGHTS['9.9.9'];
      }
    });

    test('version without highlight keeps the generic subtitle', () => {
      popup.updateNotifications.showUpdateTooltip({
        previousVersion: '1.0',
        currentVersion: '2.0',
      });
      expect(document.querySelector('.update-subtitle').textContent).toContain(
        'Check latest features'
      );
    });
  });

  describe('showWelcomeTooltip', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test('appends a welcome notification with version', () => {
      popup.updateNotifications.showWelcomeTooltip({ version: '2.0' });
      const tooltip = document.querySelector('.welcome-notification');
      expect(tooltip).not.toBeNull();
      expect(tooltip.textContent).toContain('2.0');
    });

    test('auto-closes after 8s then slide-out', () => {
      popup.updateNotifications.showWelcomeTooltip({ version: '2.0' });
      expect(document.querySelector('.welcome-notification')).not.toBeNull();
      vi.advanceTimersByTime(8000 + 300);
      expect(document.querySelector('.welcome-notification')).toBeNull();
    });
  });

  // ─── Color picker methods ─────────────────────────────────────────────────────

  describe('showColorPicker', () => {
    test('shows color-picker-overlay', () => {
      popup.colorPicker.showColorPicker();
      expect(document.getElementById('color-picker-overlay').style.display).toBe('flex');
    });
  });

  describe('closeColorPicker', () => {
    test('hides color-picker-overlay', () => {
      document.getElementById('color-picker-overlay').style.display = 'flex';
      popup.colorPicker.closeColorPicker();
      expect(document.getElementById('color-picker-overlay').style.display).toBe('none');
    });
  });

  describe('saveProfileColor', () => {
    test('saves color picker temp values to profile and persists', () => {
      popup.colorPickerState.tempBackgroundColor = '#123456';
      popup.colorPickerState.tempTextColor = '#abcdef';
      chrome.storage.local.set.mockClear();

      popup.colorPicker.saveProfileColor();

      expect(popup.profiles[popup.currentProfile].backgroundColor).toBe('#123456');
      expect(popup.profiles[popup.currentProfile].textColor).toBe('#abcdef');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  // ─── importProfile / importMultipleProfiles / setValidationMessage ───────────

  describe('importProfile (plan 006 — await persistence)', () => {
    test('storage.set is called before alert fires when importing an array', async () => {
      chrome.storage.local.set.mockClear();
      vi.mocked(alert).mockClear();

      await popup.importExport.importProfile([{ name: 'X-Test', value: 'v' }]);

      const setOrder = chrome.storage.local.set.mock.invocationCallOrder[0];
      const alertOrder = vi.mocked(alert).mock.invocationCallOrder[0];

      expect(setOrder).toBeDefined();
      expect(alertOrder).toBeDefined();
      expect(setOrder).toBeLessThan(alertOrder);

      // The new profile is also persisted with the expected header
      const setCall = chrome.storage.local.set.mock.calls[0][0];
      const storedProfiles = setCall.headerEditorData.profiles;
      const keys = Object.keys(storedProfiles);
      const importedKey = keys.find(k => k.startsWith('profile_') && k !== 'default');
      expect(importedKey).toBeDefined();
      expect(storedProfiles[importedKey].requestHeaders[0].name).toBe('X-Test');
    });
  });

  describe('importMultipleProfiles (plan 006 — first key tracked directly)', () => {
    test('currentProfile is set to the first imported profile key (3 profiles)', async () => {
      const exportData = {
        profiles: {
          orig1: { name: 'Alpha', description: '', requestHeaders: [] },
          orig2: { name: 'Beta', description: '', requestHeaders: [] },
          orig3: { name: 'Gamma', description: '', requestHeaders: [] },
        },
      };

      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importMultipleProfiles(exportData);

      const allKeys = Object.keys(popup.profiles);
      const importedKeys = allKeys.filter(k => !profilesBefore.includes(k));
      expect(importedKeys).toHaveLength(3);

      // currentProfile must be the FIRST imported key (insertion order)
      expect(popup.currentProfile).toBe(importedKeys[0]);
    });

    test('profile with non-array requestHeaders results in empty array (plan 018)', async () => {
      const exportData = {
        profiles: {
          orig1: { name: 'Alpha', description: '', requestHeaders: 'garbage' },
        },
      };
      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importMultipleProfiles(exportData);

      const allKeys = Object.keys(popup.profiles);
      const importedKey = allKeys.find(k => !profilesBefore.includes(k));
      expect(popup.profiles[importedKey].requestHeaders).toEqual([]);
    });

    test('profile with entries missing string name are filtered out (plan 018)', async () => {
      const exportData = {
        profiles: {
          orig1: {
            name: 'Alpha',
            description: '',
            requestHeaders: [{ name: 'X-Ok', value: 'v' }, { value: 'no-name' }, { name: '' }],
          },
        },
      };
      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importMultipleProfiles(exportData);

      const allKeys = Object.keys(popup.profiles);
      const importedKey = allKeys.find(k => !profilesBefore.includes(k));
      expect(popup.profiles[importedKey].requestHeaders).toEqual([
        { name: 'X-Ok', value: 'v', enabled: true, appendMode: false },
      ]);
    });
  });

  describe('replaceCurrentProfile (plan 018)', () => {
    test('array of headers replaces current profile requestHeaders, normalized', async () => {
      await popup.importExport.replaceCurrentProfile([{ name: 'X-New', value: 'v' }]);
      expect(popup.profiles[popup.currentProfile].requestHeaders).toEqual([
        { name: 'X-New', value: 'v', enabled: true, appendMode: false },
      ]);
    });

    test('full export with a single profile takes its headers, normalized', async () => {
      const exportData = {
        profiles: {
          only: {
            name: 'Only',
            description: '',
            requestHeaders: [{ name: 'X-Single', value: 'v', enabled: false }],
          },
        },
      };
      await popup.importExport.replaceCurrentProfile(exportData);
      expect(popup.profiles[popup.currentProfile].requestHeaders).toEqual([
        { name: 'X-Single', value: 'v', enabled: false, appendMode: false },
      ]);
    });

    test('full export with multiple profiles throws "Cannot replace" error', async () => {
      const exportData = {
        profiles: {
          p1: { name: 'P1', description: '', requestHeaders: [] },
          p2: { name: 'P2', description: '', requestHeaders: [] },
        },
      };
      await expect(popup.importExport.replaceCurrentProfile(exportData)).rejects.toThrow(
        /Cannot replace/
      );
    });

    test('invalid format (no array, no profiles key) throws', async () => {
      await expect(popup.importExport.replaceCurrentProfile({ invalid: true })).rejects.toThrow(
        'Invalid import format'
      );
    });

    test('regression: full export with requestHeaders as a string yields [] not the string', async () => {
      const exportData = {
        profiles: {
          only: { name: 'Only', description: '', requestHeaders: 'garbage' },
        },
      };
      await popup.importExport.replaceCurrentProfile(exportData);
      expect(popup.profiles[popup.currentProfile].requestHeaders).toEqual([]);
    });
  });

  describe('ModHeader profile import (plan 008)', () => {
    const modHeaderFixture = [
      {
        title: 'Dev Profile',
        shortTitle: 'D',
        headers: [
          { enabled: true, name: 'X-Api-Key', value: 'abc', comment: '' },
          { enabled: false, name: 'X-Debug', value: '1', comment: '' },
        ],
        respHeaders: [],
        filters: [],
        appendMode: false,
        backgroundColor: '#da7b76',
        textColor: '#ffffff',
      },
      {
        title: 'Staging Profile',
        shortTitle: 'S',
        headers: [{ enabled: true, name: 'X-Env', value: 'staging', comment: '' }],
        respHeaders: [],
        filters: [],
        appendMode: false,
      },
    ];

    test('isModHeaderProfileExport: true for fixture', () => {
      expect(popup.importExport.isModHeaderProfileExport(modHeaderFixture)).toBe(true);
    });

    test('isModHeaderProfileExport: false for empty array', () => {
      expect(popup.importExport.isModHeaderProfileExport([])).toBe(false);
    });

    test('isModHeaderProfileExport: false for plain headers array', () => {
      expect(popup.importExport.isModHeaderProfileExport([{ name: 'X-Test', value: 'v' }])).toBe(
        false
      );
    });

    test('isModHeaderProfileExport: false for profiles object', () => {
      expect(popup.importExport.isModHeaderProfileExport({ profiles: {} })).toBe(false);
    });

    test('isModHeaderProfileExport: false for null', () => {
      expect(popup.importExport.isModHeaderProfileExport(null)).toBe(false);
    });

    test('imports 2 ModHeader profiles, names from title, currentProfile = first', async () => {
      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importProfileFromData(modHeaderFixture);

      const allKeys = Object.keys(popup.profiles);
      const importedKeys = allKeys.filter(k => !profilesBefore.includes(k));
      expect(importedKeys).toHaveLength(2);

      const first = popup.profiles[importedKeys[0]];
      const second = popup.profiles[importedKeys[1]];
      expect(first.name).toBe('Dev Profile');
      expect(second.name).toBe('Staging Profile');
      expect(popup.currentProfile).toBe(importedKeys[0]);
    });

    test('headers are normalized correctly (enabled:false preserved)', async () => {
      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importProfileFromData(modHeaderFixture);

      const allKeys = Object.keys(popup.profiles);
      const importedKeys = allKeys.filter(k => !profilesBefore.includes(k));
      const first = popup.profiles[importedKeys[0]];

      expect(first.requestHeaders).toEqual([
        { name: 'X-Api-Key', value: 'abc', enabled: true, appendMode: false },
        { name: 'X-Debug', value: '1', enabled: false, appendMode: false },
      ]);
    });

    test('respHeaders alone do NOT trigger the skipped alert (plan 027)', async () => {
      const withRespHeaders = [
        {
          title: 'Has Resp',
          headers: [{ enabled: true, name: 'X-Req', value: 'v' }],
          respHeaders: [{ enabled: true, name: 'X-Resp', value: 'r' }],
          filters: [],
        },
      ];
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await popup.importExport.importProfileFromData(withRespHeaders);

      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    test('respHeaders are persisted as responseHeaders (plan 027)', async () => {
      const withRespHeaders = [
        {
          title: 'Has Resp',
          headers: [{ enabled: true, name: 'X-Req', value: 'v' }],
          respHeaders: [{ enabled: true, name: 'X-Resp', value: 'r' }],
          filters: [],
        },
      ];
      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importProfileFromData(withRespHeaders);

      const allKeys = Object.keys(popup.profiles);
      const importedKeys = allKeys.filter(k => !profilesBefore.includes(k));
      const imported = popup.profiles[importedKeys[0]];

      expect(imported.requestHeaders).toHaveLength(1);
      expect(imported.requestHeaders[0].name).toBe('X-Req');
      expect(imported.responseHeaders).toEqual([
        { name: 'X-Resp', value: 'r', enabled: true, appendMode: false },
      ]);
    });

    test('URL filters still trigger the skipped alert (plan 027)', async () => {
      const withFilters = [
        {
          title: 'Has Filters',
          headers: [{ enabled: true, name: 'X-Req', value: 'v' }],
          respHeaders: [],
          filters: [{ urlRegex: 'example\\.com' }],
        },
      ];
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await popup.importExport.importProfileFromData(withFilters);

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('URL filters'));
      alertSpy.mockRestore();
    });

    test('profile without title uses fallback name', async () => {
      const noTitle = [{ headers: [{ enabled: true, name: 'X-A', value: '1' }] }];
      const profilesBefore = Object.keys(popup.profiles);
      await popup.importExport.importProfileFromData(noTitle);

      const allKeys = Object.keys(popup.profiles);
      const importedKeys = allKeys.filter(k => !profilesBefore.includes(k));
      const imported = popup.profiles[importedKeys[0]];
      expect(imported.name).toMatch(/^Imported Profile \d+$/);
    });

    test('plain headers array still routes to createProfileFromHeaders (no regression)', async () => {
      const plainHeaders = [{ name: 'X-Legacy', value: 'val', enabled: true }];
      const profilesBefore = Object.keys(popup.profiles).length;
      await popup.importExport.importProfileFromData(plainHeaders);
      expect(Object.keys(popup.profiles).length).toBe(profilesBefore + 1);
      // plain import uses createProfileFromHeaders (no ModHeader description)
      expect(popup.profiles[popup.currentProfile].description).toBe(
        'Imported from JSON - click to edit'
      );
    });
  });

  describe('setValidationMessage (plan 006 — no innerHTML injection)', () => {
    test('HTML in error message is rendered as literal text, not as markup', () => {
      const malicious = '<img src=x onerror=alert(1)>';
      popup.importExport.setValidationMessage('error', malicious);

      const container = document.getElementById('validation-message');
      expect(document.querySelector('#validation-message img')).toBeNull();
      expect(container.textContent).toContain(malicious);
    });

    test('success message creates span.success with correct text', () => {
      popup.importExport.setValidationMessage('success', '✓ Valid JSON');

      const span = document.querySelector('#validation-message span.success');
      expect(span).not.toBeNull();
      expect(span.textContent).toBe('✓ Valid JSON');
    });
  });

  // ─── checkForUpdateNotification ──────────────────────────────────────────────

  describe('checkForUpdateNotification', () => {
    test('shows update tooltip when updateNotification.shown is false', async () => {
      const updateNotification = {
        previousVersion: '2.0.0',
        currentVersion: '2.1.0',
        shown: false,
      };
      chrome.storage.local.get.mockResolvedValue({ updateNotification });
      const spy = vi
        .spyOn(popup.updateNotifications, 'showUpdateTooltip')
        .mockImplementation(() => {});

      await popup.updateNotifications.checkForUpdateNotification();

      expect(spy).toHaveBeenCalledWith(updateNotification);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        updateNotification: { ...updateNotification, shown: true },
      });
    });

    test('shows welcome tooltip for new installs', async () => {
      const welcomeNotification = { version: '2.1.0', shown: false };
      chrome.storage.local.get.mockResolvedValue({ welcomeNotification });
      const spy = vi
        .spyOn(popup.updateNotifications, 'showWelcomeTooltip')
        .mockImplementation(() => {});

      await popup.updateNotifications.checkForUpdateNotification();

      expect(spy).toHaveBeenCalledWith(welcomeNotification);
    });

    test('does not show tooltip if already shown', async () => {
      chrome.storage.local.get.mockResolvedValue({ updateNotification: { shown: true } });
      const spy = vi
        .spyOn(popup.updateNotifications, 'showUpdateTooltip')
        .mockImplementation(() => {});

      await popup.updateNotifications.checkForUpdateNotification();

      expect(spy).not.toHaveBeenCalled();
    });

    test('handles storage errors silently', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('fail'));
      await expect(popup.updateNotifications.checkForUpdateNotification()).resolves.not.toThrow();
    });
  });

  describe('color picker interactions', () => {
    beforeEach(() => {
      popup.colorPicker.showColorPicker(); // wires up the interaction handlers (once)
      const gradient = document.getElementById('color-gradient');
      gradient.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
        right: 200,
        bottom: 200,
      });
    });

    test('mousedown on gradient sets saturation/lightness from position', () => {
      const gradient = document.getElementById('color-gradient');
      gradient.onmousedown({
        clientX: 100, // x/width = 0.5 → saturation 0.5
        clientY: 50, // 1 - y/height = 0.75 → lightness 0.75
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      expect(popup.colorPickerState.saturation).toBeCloseTo(0.5, 5);
      expect(popup.colorPickerState.lightness).toBeCloseTo(0.75, 5);
    });

    test('dragging (mousemove while down) keeps updating the color', () => {
      const gradient = document.getElementById('color-gradient');
      gradient.onmousedown({
        clientX: 0,
        clientY: 200,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      document.onmousemove({
        clientX: 200, // saturation 1
        clientY: 0, // lightness 1
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      expect(popup.colorPickerState.saturation).toBeCloseTo(1, 5);
      expect(popup.colorPickerState.lightness).toBeCloseTo(1, 5);
      document.onmouseup();
    });

    test('hue slider input updates hue and the active temp color', () => {
      const hueSlider = document.getElementById('hue-slider');
      hueSlider.value = '200';
      hueSlider.oninput();
      expect(popup.colorPickerState.hue).toBe(200);
    });

    test('switching to the text tab updates currentTab', () => {
      document.getElementById('text-tab').onclick();
      expect(popup.colorPickerState.currentTab).toBe('text');
    });
  });

  describe('export and downloadJSON', () => {
    let clickSpy;

    beforeEach(() => {
      // setup.js mocks Blob as a non-constructable arrow fn; make it constructable here
      global.Blob = class MockBlob {
        constructor(content, options) {
          this.content = content;
          this.type = options?.type || '';
        }
      };
      global.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      global.URL.revokeObjectURL = vi.fn();
      clickSpy = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
      clickSpy.mockRestore();
    });

    function setScope(value) {
      document.querySelector(`input[name="export-scope"][value="${value}"]`).checked = true;
    }

    test('downloadExport with scope=current downloads the textarea JSON with a profile filename', () => {
      setScope('current');
      const payload = [{ appendMode: false, enabled: true, name: 'X', value: 'v' }];
      document.getElementById('json-textarea').value = JSON.stringify(payload);
      const downloadSpy = vi.spyOn(popup.importExport, 'downloadJSON');

      popup.importExport.downloadExport();

      expect(downloadSpy).toHaveBeenCalledWith(payload, expect.stringMatching(/_headers\.json$/));
    });

    test('downloadExport with scope=all uses a dated profiles filename', () => {
      setScope('all');
      const payload = {
        profiles: { p1: { name: 'P1', requestHeaders: [] } },
        currentProfile: 'p1',
      };
      document.getElementById('json-textarea').value = JSON.stringify(payload);
      const downloadSpy = vi.spyOn(popup.importExport, 'downloadJSON');

      popup.importExport.downloadExport();

      expect(downloadSpy).toHaveBeenCalledWith(
        payload,
        expect.stringMatching(/^header-editor-profiles-\d{4}-\d{2}-\d{2}\.json$/)
      );
    });

    test('downloadExport round-trip: scope=all payload re-imports without throwing', async () => {
      setScope('all');
      const payload = {
        profiles: {
          p1: {
            name: 'P1',
            description: '',
            requestHeaders: [{ name: 'X-Req', value: 'q', enabled: true }],
            responseHeaders: [{ name: 'X-Resp', value: 'r', enabled: true }],
          },
        },
        currentProfile: 'p1',
      };
      document.getElementById('json-textarea').value = JSON.stringify(payload);
      vi.spyOn(popup.importExport, 'downloadJSON').mockImplementation(() => {});
      popup.importExport.downloadExport();

      await expect(popup.importExport.importProfileFromData(payload)).resolves.not.toThrow();
    });

    test('downloadExport with invalid JSON shows a validation error and does not download', () => {
      setScope('current');
      document.getElementById('json-textarea').value = '{ not valid json';
      const downloadSpy = vi.spyOn(popup.importExport, 'downloadJSON');

      popup.importExport.downloadExport();

      expect(downloadSpy).not.toHaveBeenCalled();
      expect(document.getElementById('validation-message').textContent).toContain('✗');
    });

    test('downloadJSON creates a blob URL, clicks the link, and revokes the URL', () => {
      popup.importExport.downloadJSON({ foo: 'bar' }, 'test.json');
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });
  });

  describe('clipboard and file import', () => {
    function stubClipboard(writeText) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    }

    test('copyToClipboard writes the textarea value to the clipboard', async () => {
      document.getElementById('json-textarea').value = '{"a":1}';
      const writeText = vi.fn().mockResolvedValue();
      stubClipboard(writeText);

      await popup.importExport.copyToClipboard();

      expect(writeText).toHaveBeenCalledWith('{"a":1}');
    });

    test('copyToClipboard falls back to execCommand when clipboard write fails', async () => {
      stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
      document.execCommand = vi.fn();

      await popup.importExport.copyToClipboard();

      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    test('handleImportFile does nothing when no file is chosen', async () => {
      await expect(
        popup.importExport.handleImportFile({ target: { files: [] } })
      ).resolves.toBeUndefined();
    });

    test('handleImportFile rejects a non-JSON file', async () => {
      await popup.importExport.handleImportFile({ target: { files: [{ name: 'foo.txt' }] } });
      expect(alert).toHaveBeenCalledWith('Please select a JSON file');
    });

    test('handleImportFile reads and imports a valid JSON file', async () => {
      vi.spyOn(popup.importExport, 'readFileAsText').mockResolvedValue(
        '[{"name":"H","value":"V"}]'
      );
      const importSpy = vi.spyOn(popup.importExport, 'importProfile').mockResolvedValue();
      const event = { target: { files: [{ name: 'profiles.json' }], value: 'x' } };

      await popup.importExport.handleImportFile(event);

      expect(importSpy).toHaveBeenCalledWith([{ name: 'H', value: 'V' }]);
      expect(event.target.value).toBe('');
    });
  });
});

describe('popup.html remote resources', () => {
  test('does not load any external <link> or <script> (privacy/offline guard)', () => {
    const tagMatches = popupHtml.match(/<(link|script)\b[^>]*>/gi) || [];
    const remoteTags = tagMatches.filter(tag => /https?:\/\//i.test(tag));
    expect(remoteTags).toEqual([]);
  });
});
