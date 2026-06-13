import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

vi.stubGlobal('alert', vi.fn());
vi.stubGlobal('confirm', vi.fn(() => true));

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
      expect(popup.profiles[popup.currentProfile].name).toBe(
        `Profile ${popup.profileCounter}`
      );
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

    // BUG: real switchProfile has no guard — it sets currentProfile to the key then
    // renderUI() crashes because profiles[key] is undefined. Documented as bug for plan 006.
    test.todo('switching to non-existent profile does nothing (BUG: real code crashes, no guard)');
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

      popup.showProfileMenu('ctx', 0, 0);

      expect(popup.profiles.ctx).toBeUndefined();
    });

    test('cannot delete default via context menu', () => {
      vi.mocked(confirm).mockReturnValue(true);
      popup.showProfileMenu('default', 0, 0);
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
      const result = popup.extractHeadersFromArray(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'X-Foo', value: 'bar', enabled: false });
      expect(result[1]).toEqual({ name: 'X-Valid', value: '', enabled: true });
    });

    test('enabled defaults to true when not false', () => {
      const result = popup.extractHeadersFromArray([{ name: 'H', value: 'v' }]);
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
      const result = popup.convertToModHeaderFormat(profile);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ appendMode: false, enabled: true, name: 'X-A', value: 'a' });
      expect(result[1]).toEqual({ appendMode: false, enabled: false, name: 'X-B', value: 'b' });
    });

    test('profile with no requestHeaders returns empty array', () => {
      const result = popup.convertToModHeaderFormat({});
      expect(result).toEqual([]);
    });
  });

  describe('importProfileFromData', () => {
    test('array input creates a new profile from headers', async () => {
      const profilesBefore = Object.keys(popup.profiles).length;
      await popup.importProfileFromData([{ name: 'X-Test', value: 'v' }]);
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
      await popup.importProfileFromData(exportData);
      expect(Object.keys(popup.profiles).length).toBe(profilesBefore + 1);
    });

    test('invalid format (no array, no profiles key) throws', async () => {
      await expect(popup.importProfileFromData({ invalid: true })).rejects.toThrow();
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

  // ─── Color utilities ──────────────────────────────────────────────────────────

  describe('color utilities', () => {
    test('hexToHsl converts #ff0000 to hue 0', () => {
      const result = popup.hexToHsl('#ff0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(1);
      expect(result.l).toBe(0.5);
    });

    test('hslToHex converts 0,1,0.5 to #ff0000', () => {
      expect(popup.hslToHex(0, 1, 0.5)).toBe('#ff0000');
    });

    test('round-trip is within ±1 per channel', () => {
      const original = '#4caf50';
      const hsl = popup.hexToHsl(original);
      const converted = popup.hslToHex(hsl.h, hsl.s, hsl.l);

      for (let i = 0; i < 3; i++) {
        const offset = 1 + i * 2;
        const a = parseInt(original.slice(offset, offset + 2), 16);
        const b = parseInt(converted.slice(offset, offset + 2), 16);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── checkForUpdateNotification ──────────────────────────────────────────────

  describe('checkForUpdateNotification', () => {
    test('shows update tooltip when updateNotification.shown is false', async () => {
      const updateNotification = { previousVersion: '2.0.0', currentVersion: '2.1.0', shown: false };
      chrome.storage.local.get.mockResolvedValue({ updateNotification });
      const spy = vi.spyOn(popup, 'showUpdateTooltip').mockImplementation(() => {});

      await popup.checkForUpdateNotification();

      expect(spy).toHaveBeenCalledWith(updateNotification);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        updateNotification: { ...updateNotification, shown: true },
      });
    });

    test('shows welcome tooltip for new installs', async () => {
      const welcomeNotification = { version: '2.1.0', shown: false };
      chrome.storage.local.get.mockResolvedValue({ welcomeNotification });
      const spy = vi.spyOn(popup, 'showWelcomeTooltip').mockImplementation(() => {});

      await popup.checkForUpdateNotification();

      expect(spy).toHaveBeenCalledWith(welcomeNotification);
    });

    test('does not show tooltip if already shown', async () => {
      chrome.storage.local.get.mockResolvedValue({ updateNotification: { shown: true } });
      const spy = vi.spyOn(popup, 'showUpdateTooltip').mockImplementation(() => {});

      await popup.checkForUpdateNotification();

      expect(spy).not.toHaveBeenCalled();
    });

    test('handles storage errors silently', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('fail'));
      await expect(popup.checkForUpdateNotification()).resolves.not.toThrow();
    });
  });
});
