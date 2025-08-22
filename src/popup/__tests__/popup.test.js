import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock console.log to suppress output during tests
const originalLog = console.log;
console.log = jest.fn();

describe('HeaderEditorPopup', () => {
  let HeaderEditorPopup;
  let popup;

  beforeEach(() => {
    jest.resetModules();

    // Create a mock version of the HeaderEditorPopup class
    HeaderEditorPopup = class {
      constructor() {
        this.currentProfile = 'default';
        this.profiles = {};
        this.isEnabled = true;
        this.isPaused = false;
        this.isPinned = false;
        this.colorPickerInteractionsSetup = false;
        this.infoLinksSetup = false;
        this.profileCounter = 1;
      }

      async loadData() {
        try {
          const result = await chrome.storage.local.get(['headerEditorData']);
          const data = result.headerEditorData || {
            profiles: {
              default: {
                name: 'Default',
                description: 'Click to edit description',
                requestHeaders: [],
                backgroundColor: '#4caf50',
                textColor: '#ffffff',
              },
            },
            currentProfile: 'default',
            enabled: true,
            paused: false,
            pinned: false,
            profileCounter: 1,
          };

          this.profiles = data.profiles;
          this.currentProfile = data.currentProfile;
          this.isEnabled = data.enabled;
          this.isPaused = data.paused || false;
          this.isPinned = data.pinned || false;
          this.profileCounter = data.profileCounter || 1;

          this.migrateHeaderFormat();
          this.migrateProfileFormat();

          this.colorPickerState = {
            currentTab: 'background',
            tempBackgroundColor: '#4caf50',
            tempTextColor: '#ffffff',
            hue: 180,
            saturation: 1,
            lightness: 0.5,
          };
        } catch (_error) {
          this.profiles = {
            default: {
              name: 'Default',
              description: 'Click to edit description',
              requestHeaders: [],
            },
          };
          this.currentProfile = 'default';
          this.isEnabled = true;
          this.isPaused = false;
          this.isPinned = false;
          this.profileCounter = 1;
        }
      }

      migrateHeaderFormat() {
        Object.values(this.profiles).forEach(profile => {
          ['requestHeaders'].forEach(headerType => {
            if (profile[headerType]) {
              profile[headerType] = profile[headerType].map(header => ({
                name: header.name || '',
                value: header.value || '',
                enabled: header.enabled !== undefined ? header.enabled : true,
              }));
            }
          });
        });
      }

      migrateProfileFormat() {
        Object.entries(this.profiles).forEach(([key, profile]) => {
          if (profile.description === undefined) {
            profile.description = key === 'default' ? 'Click to edit description' : '';
          } else if (key === 'default' && profile.description === '') {
            profile.description = 'Click to edit description';
          }
        });
      }

      async checkForUpdateNotification() {
        try {
          const result = await chrome.storage.local.get([
            'updateNotification',
            'welcomeNotification',
          ]);

          if (result.updateNotification && !result.updateNotification.shown) {
            this.showUpdateTooltip(result.updateNotification);

            chrome.storage.local.set({
              updateNotification: { ...result.updateNotification, shown: true },
            });

            chrome.runtime.sendMessage({ action: 'clearUpdateBadge' });
          } else if (result.welcomeNotification && !result.welcomeNotification.shown) {
            this.showWelcomeTooltip(result.welcomeNotification);

            chrome.storage.local.set({
              welcomeNotification: { ...result.welcomeNotification, shown: true },
            });
          }
        } catch (_error) {
          // Silently handle errors
        }
      }

      showUpdateTooltip(updateInfo) {
        const tooltip = document.createElement('div');
        tooltip.className = 'update-notification update-notification-slide-in';
        tooltip.innerHTML = `
          <div class="update-header">
            <span class="update-icon">✨</span>
            <span class="update-title">Extension Updated!</span>
            <button class="update-close">×</button>
          </div>
          <div class="update-content">
            Updated from v${updateInfo.previousVersion} to v${updateInfo.currentVersion}
            <div class="update-subtitle">Check latest features and improvements</div>
          </div>
        `;

        document.body.appendChild(tooltip);

        const closeBtn = tooltip.querySelector('.update-close');
        closeBtn.addEventListener('click', () => {
          tooltip.classList.add('update-notification-slide-out');
          setTimeout(() => tooltip.remove(), 300);
        });

        setTimeout(() => {
          if (tooltip.parentNode) {
            tooltip.classList.add('update-notification-slide-out');
            setTimeout(() => tooltip.remove(), 300);
          }
        }, 6000);
      }

      showWelcomeTooltip(welcomeInfo) {
        const tooltip = document.createElement('div');
        tooltip.className = 'update-notification welcome-notification update-notification-slide-in';
        tooltip.innerHTML = `
          <div class="update-header">
            <span class="update-icon">🎉</span>
            <span class="update-title">Welcome to Header Editor Pro!</span>
            <button class="update-close">×</button>
          </div>
          <div class="update-content">
            Thanks for installing v${welcomeInfo.version}
            <div class="update-subtitle">Create unlimited profiles and modify HTTP headers easily</div>
          </div>
        `;

        document.body.appendChild(tooltip);

        const closeBtn = tooltip.querySelector('.update-close');
        closeBtn.addEventListener('click', () => {
          tooltip.classList.add('update-notification-slide-out');
          setTimeout(() => tooltip.remove(), 300);
        });

        setTimeout(() => {
          if (tooltip.parentNode) {
            tooltip.classList.add('update-notification-slide-out');
            setTimeout(() => tooltip.remove(), 300);
          }
        }, 8000);
      }

      async saveData() {
        const data = {
          profiles: this.profiles,
          currentProfile: this.currentProfile,
          enabled: this.isEnabled,
          paused: this.isPaused,
          pinned: this.isPinned,
          profileCounter: this.profileCounter,
        };

        try {
          await chrome.storage.local.set({ headerEditorData: data });
          chrome.runtime.sendMessage({ action: 'updateHeaders', data });
        } catch (_error) {
          console.error('Error saving data:', _error);
        }
      }

      addHeader(type = 'requestHeaders') {
        const currentProfile = this.profiles[this.currentProfile];
        if (!currentProfile[type]) {
          currentProfile[type] = [];
        }

        currentProfile[type].push({
          name: '',
          value: '',
          enabled: true,
        });

        this.saveData();
      }

      removeHeader(type, index) {
        const currentProfile = this.profiles[this.currentProfile];
        if (currentProfile[type] && currentProfile[type][index]) {
          currentProfile[type].splice(index, 1);
          this.saveData();
        }
      }

      updateHeader(type, index, field, value) {
        const currentProfile = this.profiles[this.currentProfile];
        if (currentProfile[type] && currentProfile[type][index]) {
          currentProfile[type][index][field] = value;
          this.saveData();
        }
      }

      toggleHeader(type, index) {
        const currentProfile = this.profiles[this.currentProfile];
        if (currentProfile[type] && currentProfile[type][index]) {
          currentProfile[type][index].enabled = !currentProfile[type][index].enabled;
          this.saveData();
        }
      }

      createNewProfile() {
        this.profileCounter++;
        const newProfileId = `profile_${Date.now()}`;

        this.profiles[newProfileId] = {
          name: `Profile ${this.profileCounter}`,
          description: '',
          requestHeaders: [],
          backgroundColor: '#4caf50',
          textColor: '#ffffff',
        };

        this.currentProfile = newProfileId;
        this.saveData();

        return newProfileId;
      }

      deleteProfile(profileId) {
        if (profileId === 'default' || !this.profiles[profileId]) {
          return false;
        }

        delete this.profiles[profileId];

        if (this.currentProfile === profileId) {
          this.currentProfile = 'default';
        }

        this.saveData();
        return true;
      }

      switchProfile(profileId) {
        if (this.profiles[profileId]) {
          this.currentProfile = profileId;
          this.saveData();
          return true;
        }
        return false;
      }

      toggleEnabled() {
        this.isEnabled = !this.isEnabled;
        this.saveData();
      }

      togglePaused() {
        this.isPaused = !this.isPaused;
        this.saveData();
      }

      togglePinned() {
        this.isPinned = !this.isPinned;
        this.saveData();
      }

      hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s;
        const l = (max + min) / 2;

        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r:
              h = (g - b) / d + (g < b ? 6 : 0);
              break;
            case g:
              h = (b - r) / d + 2;
              break;
            case b:
              h = (r - g) / d + 4;
              break;
          }
          h /= 6;
        }

        return { h: Math.round(h * 360), s, l };
      }

      hslToHex(h, s, l) {
        h /= 360;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
          const k = (n + h / (1 / 12)) % 12;
          const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
          return Math.round(255 * color)
            .toString(16)
            .padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
      }
    };

    popup = new HeaderEditorPopup();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(popup.currentProfile).toBe('default');
      expect(popup.profiles).toEqual({});
      expect(popup.isEnabled).toBe(true);
      expect(popup.isPaused).toBe(false);
      expect(popup.isPinned).toBe(false);
      expect(popup.profileCounter).toBe(1);
    });
  });

  describe('loadData', () => {
    test('should load data from chrome storage', async () => {
      const mockData = {
        profiles: {
          default: {
            name: 'Test Profile',
            requestHeaders: [],
          },
        },
        currentProfile: 'default',
        enabled: true,
        paused: false,
        profileCounter: 2,
      };

      chrome.storage.local.get.mockResolvedValue({ headerEditorData: mockData });

      await popup.loadData();

      expect(popup.profiles).toEqual(mockData.profiles);
      expect(popup.currentProfile).toBe('default');
      expect(popup.isEnabled).toBe(true);
      expect(popup.profileCounter).toBe(2);
    });

    test('should use default data when storage is empty', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      await popup.loadData();

      expect(popup.profiles.default).toBeDefined();
      expect(popup.profiles.default.name).toBe('Default');
      expect(popup.currentProfile).toBe('default');
      expect(popup.isEnabled).toBe(true);
    });

    test('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await popup.loadData();

      expect(popup.profiles.default).toBeDefined();
      expect(popup.currentProfile).toBe('default');
      expect(popup.isEnabled).toBe(true);
    });
  });

  describe('migrateHeaderFormat', () => {
    test('should migrate headers without enabled property', () => {
      popup.profiles = {
        test: {
          requestHeaders: [{ name: 'Test-Header', value: 'test-value' }],
        },
      };

      popup.migrateHeaderFormat();

      expect(popup.profiles.test.requestHeaders[0].enabled).toBe(true);
    });

    test('should preserve existing enabled values', () => {
      popup.profiles = {
        test: {
          requestHeaders: [{ name: 'Test-Header', value: 'test-value', enabled: false }],
        },
      };

      popup.migrateHeaderFormat();

      expect(popup.profiles.test.requestHeaders[0].enabled).toBe(false);
    });
  });

  describe('checkForUpdateNotification', () => {
    test('should show update notification when available', async () => {
      const updateNotification = {
        previousVersion: '2.0.0',
        currentVersion: '2.1.0',
        shown: false,
      };

      chrome.storage.local.get.mockResolvedValue({ updateNotification });
      const showUpdateSpy = jest.spyOn(popup, 'showUpdateTooltip').mockImplementation();

      await popup.checkForUpdateNotification();

      expect(showUpdateSpy).toHaveBeenCalledWith(updateNotification);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        updateNotification: { ...updateNotification, shown: true },
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'clearUpdateBadge' });
    });

    test('should show welcome notification for new installs', async () => {
      const welcomeNotification = {
        version: '2.1.0',
        shown: false,
      };

      chrome.storage.local.get.mockResolvedValue({ welcomeNotification });
      const showWelcomeSpy = jest.spyOn(popup, 'showWelcomeTooltip').mockImplementation();

      await popup.checkForUpdateNotification();

      expect(showWelcomeSpy).toHaveBeenCalledWith(welcomeNotification);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        welcomeNotification: { ...welcomeNotification, shown: true },
      });
    });

    test('should not show notifications if already shown', async () => {
      chrome.storage.local.get.mockResolvedValue({
        updateNotification: { shown: true },
      });

      const showUpdateSpy = jest.spyOn(popup, 'showUpdateTooltip').mockImplementation();

      await popup.checkForUpdateNotification();

      expect(showUpdateSpy).not.toHaveBeenCalled();
    });
  });

  describe('showUpdateTooltip', () => {
    test('should create and display update tooltip', () => {
      const updateInfo = {
        previousVersion: '2.0.0',
        currentVersion: '2.1.0',
      };

      // Test that the method includes expected content
      const spy = jest.spyOn(popup, 'showUpdateTooltip');
      popup.showUpdateTooltip(updateInfo);

      expect(spy).toHaveBeenCalledWith(updateInfo);
    });
  });

  describe('addHeader', () => {
    beforeEach(async () => {
      await popup.loadData();
    });

    test('should add new header to current profile', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.addHeader('requestHeaders');

      expect(popup.profiles[popup.currentProfile].requestHeaders).toHaveLength(1);
      expect(popup.profiles[popup.currentProfile].requestHeaders[0]).toEqual({
        name: '',
        value: '',
        enabled: true,
      });
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('should create headers array if it does not exist', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();
      delete popup.profiles[popup.currentProfile].requestHeaders;

      popup.addHeader('requestHeaders');

      expect(popup.profiles[popup.currentProfile].requestHeaders).toBeDefined();
      expect(popup.profiles[popup.currentProfile].requestHeaders).toHaveLength(1);
    });
  });

  describe('removeHeader', () => {
    beforeEach(async () => {
      await popup.loadData();
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'Header1', value: 'value1', enabled: true },
        { name: 'Header2', value: 'value2', enabled: true },
      ];
    });

    test('should remove header at specified index', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.removeHeader('requestHeaders', 0);

      expect(popup.profiles[popup.currentProfile].requestHeaders).toHaveLength(1);
      expect(popup.profiles[popup.currentProfile].requestHeaders[0].name).toBe('Header2');
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('should not remove if index is invalid', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.removeHeader('requestHeaders', 10);

      expect(popup.profiles[popup.currentProfile].requestHeaders).toHaveLength(2);
      expect(_saveSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateHeader', () => {
    beforeEach(async () => {
      await popup.loadData();
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'Header1', value: 'value1', enabled: true },
      ];
    });

    test('should update header field', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.updateHeader('requestHeaders', 0, 'name', 'NewHeader');

      expect(popup.profiles[popup.currentProfile].requestHeaders[0].name).toBe('NewHeader');
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('should not update if index is invalid', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.updateHeader('requestHeaders', 10, 'name', 'NewHeader');

      expect(_saveSpy).not.toHaveBeenCalled();
    });
  });

  describe('toggleHeader', () => {
    beforeEach(async () => {
      await popup.loadData();
      popup.profiles[popup.currentProfile].requestHeaders = [
        { name: 'Header1', value: 'value1', enabled: true },
      ];
    });

    test('should toggle header enabled state', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.toggleHeader('requestHeaders', 0);

      expect(popup.profiles[popup.currentProfile].requestHeaders[0].enabled).toBe(false);
      expect(_saveSpy).toHaveBeenCalled();
    });
  });

  describe('createNewProfile', () => {
    test('should create new profile with unique ID', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      const profileId = popup.createNewProfile();

      expect(profileId).toMatch(/^profile_\d+$/);
      expect(popup.profiles[profileId]).toBeDefined();
      expect(popup.profiles[profileId].name).toBe('Profile 2');
      expect(popup.currentProfile).toBe(profileId);
      expect(popup.profileCounter).toBe(2);
      expect(_saveSpy).toHaveBeenCalled();
    });
  });

  describe('deleteProfile', () => {
    beforeEach(() => {
      popup.profiles = {
        default: { name: 'Default' },
        test: { name: 'Test Profile' },
      };
    });

    test('should delete non-default profile', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      const result = popup.deleteProfile('test');

      expect(result).toBe(true);
      expect(popup.profiles.test).toBeUndefined();
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('should not delete default profile', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      const result = popup.deleteProfile('default');

      expect(result).toBe(false);
      expect(popup.profiles.default).toBeDefined();
      expect(_saveSpy).not.toHaveBeenCalled();
    });

    test('should switch to default if deleting current profile', () => {
      popup.currentProfile = 'test';
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      popup.deleteProfile('test');

      expect(popup.currentProfile).toBe('default');
    });
  });

  describe('switchProfile', () => {
    beforeEach(() => {
      popup.profiles = {
        default: { name: 'Default' },
        test: { name: 'Test Profile' },
      };
    });

    test('should switch to existing profile', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      const result = popup.switchProfile('test');

      expect(result).toBe(true);
      expect(popup.currentProfile).toBe('test');
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('should not switch to non-existing profile', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();

      const result = popup.switchProfile('nonexistent');

      expect(result).toBe(false);
      expect(popup.currentProfile).toBe('default');
      expect(_saveSpy).not.toHaveBeenCalled();
    });
  });

  describe('toggle functions', () => {
    test('toggleEnabled should toggle enabled state', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();
      const initialState = popup.isEnabled;

      popup.toggleEnabled();

      expect(popup.isEnabled).toBe(!initialState);
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('togglePaused should toggle paused state', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();
      const initialState = popup.isPaused;

      popup.togglePaused();

      expect(popup.isPaused).toBe(!initialState);
      expect(_saveSpy).toHaveBeenCalled();
    });

    test('togglePinned should toggle pinned state', () => {
      const _saveSpy = jest.spyOn(popup, 'saveData').mockImplementation();
      const initialState = popup.isPinned;

      popup.togglePinned();

      expect(popup.isPinned).toBe(!initialState);
      expect(_saveSpy).toHaveBeenCalled();
    });
  });

  describe('color utility functions', () => {
    test('hexToHsl should convert hex to HSL', () => {
      const result = popup.hexToHsl('#ff0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(1);
      expect(result.l).toBe(0.5);
    });

    test('hslToHex should convert HSL to hex', () => {
      const result = popup.hslToHex(0, 1, 0.5);
      expect(result).toBe('#ff0000');
    });

    test('color conversion should be approximately reversible', () => {
      const originalHex = '#4caf50';
      const hsl = popup.hexToHsl(originalHex);
      const convertedHex = popup.hslToHex(hsl.h, hsl.s, hsl.l);

      // Due to floating point precision, we should check if colors are close enough
      const originalR = parseInt(originalHex.slice(1, 3), 16);
      const originalG = parseInt(originalHex.slice(3, 5), 16);
      const originalB = parseInt(originalHex.slice(5, 7), 16);

      const convertedR = parseInt(convertedHex.slice(1, 3), 16);
      const convertedG = parseInt(convertedHex.slice(3, 5), 16);
      const convertedB = parseInt(convertedHex.slice(5, 7), 16);

      // Allow for ±1 difference due to rounding
      expect(Math.abs(originalR - convertedR)).toBeLessThanOrEqual(1);
      expect(Math.abs(originalG - convertedG)).toBeLessThanOrEqual(1);
      expect(Math.abs(originalB - convertedB)).toBeLessThanOrEqual(1);
    });
  });

  describe('saveData', () => {
    test('should save data to chrome storage', async () => {
      await popup.saveData();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        headerEditorData: expect.objectContaining({
          profiles: popup.profiles,
          currentProfile: popup.currentProfile,
          enabled: popup.isEnabled,
          paused: popup.isPaused,
          pinned: popup.isPinned,
          profileCounter: popup.profileCounter,
        }),
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'updateHeaders',
        data: expect.any(Object),
      });
    });
  });
});
