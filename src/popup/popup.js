// Import CSS
import './popup.css';

import { hexToHsl, hslToHex } from './color-utils.js';
import { normalizeHeader } from './header-normalize.js';
import { ImportExportManager } from './import-export.js';
import { UpdateNotificationsManager } from './update-notifications.js';
import { ColorPickerManager } from './color-picker.js';

export class HeaderEditorPopup {
  constructor() {
    this.currentProfile = 'default';
    this.profiles = {};
    this.isEnabled = true;
    this.isPaused = false;
    this.isPinned = false;
    this.colorPickerInteractionsSetup = false;
    this.infoLinksSetup = false;
    this.profileCounter = 1;
    this.importExport = new ImportExportManager(this);
    this.updateNotifications = new UpdateNotificationsManager(this);
    this.colorPicker = new ColorPickerManager(this);
    this.init();
  }

  async init() {
    await this.loadData();
    await this.checkForUpdateNotification();
    this.setupEventListeners();
    this.renderUI();
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

      // Migrate old header format to include 'enabled' property
      this.migrateHeaderFormat();

      // Migrate profiles to include description field
      this.migrateProfileFormat();

      // Initialize color picker state
      this.colorPickerState = {
        currentTab: 'background', // 'background' or 'text'
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
          profile[headerType] = profile[headerType].map(normalizeHeader);
        }
      });
    });
  }

  migrateProfileFormat() {
    Object.entries(this.profiles).forEach(([key, profile]) => {
      if (profile.description === undefined) {
        // Give default profile and others a placeholder description
        profile.description = key === 'default' ? 'Click to edit description' : '';
      } else if (key === 'default' && profile.description === '') {
        // Update existing empty default profile description
        profile.description = 'Click to edit description';
      }
    });
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
    await chrome.storage.local.set({ headerEditorData: data });
  }

  setupEventListeners() {
    // Toolbar buttons
    document.getElementById('pause-btn').addEventListener('click', () => {
      this.togglePause();
    });

    document.getElementById('pin-btn').addEventListener('click', () => {
      this.togglePin();
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.refreshHeaders();
    });

    document.getElementById('import-item').addEventListener('click', () => {
      this.showImportModal();
      this.closeDropdown();
    });

    document.getElementById('export-item').addEventListener('click', () => {
      this.showExportModal();
      this.closeDropdown();
    });

    document.getElementById('color-picker-btn').addEventListener('click', () => {
      this.showColorPicker();
    });

    document.getElementById('fullscreen-btn').addEventListener('click', () => {
      this.openFullscreen();
    });

    // Handle file input change
    document.getElementById('import-file-input').addEventListener('change', e => {
      this.handleImportFile(e);
    });

    // Profile name inline editing
    document.getElementById('profile-name-input').addEventListener('blur', e => {
      this.updateProfileName(e.target.value);
    });

    document.getElementById('profile-name-input').addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    // Profile description inline editing
    document.getElementById('description-input').addEventListener('blur', e => {
      this.updateProfileDescription(e.target.value);
    });

    document.getElementById('description-input').addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    // Show description input when clicking if it's hidden
    document.getElementById('description-input').addEventListener('focus', () => {
      document.getElementById('profile-description').style.display = 'block';
    });

    // Dropdown menu functionality
    document.getElementById('menu-btn').addEventListener('click', e => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    document.getElementById('delete-profile-item').addEventListener('click', e => {
      if (e.target.closest('.dropdown-item').classList.contains('disabled')) {
        return; // Don't delete if disabled
      }
      this.deleteCurrentProfile();
      this.closeDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.closeDropdown();
    });

    // Modal event listeners
    document.getElementById('modal-close').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('modal-cancel').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('modal-action').addEventListener('click', () => {
      this.handleModalAction();
    });

    document.getElementById('modal-copy').addEventListener('click', () => {
      this.copyToClipboard();
    });

    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    });

    // Color picker modal event listeners
    document.getElementById('color-picker-close').addEventListener('click', () => {
      this.closeColorPicker();
    });

    document.getElementById('color-picker-cancel').addEventListener('click', () => {
      this.closeColorPicker();
    });

    document.getElementById('color-picker-save').addEventListener('click', () => {
      this.saveProfileColor();
    });

    document.getElementById('color-picker-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        this.closeColorPicker();
      }
    });

    // JSON validation on input
    document.getElementById('json-textarea').addEventListener('input', () => {
      this.validateJSON();
    });

    // Close popup when clicking outside (blur event)
    window.addEventListener('blur', () => {
      // Only close if not pinned and no modal is open
      const modalOverlay = document.getElementById('modal-overlay');
      const dropdown = document.getElementById('profile-dropdown');

      if (
        !this.isPinned &&
        modalOverlay.style.display === 'none' &&
        dropdown.style.display === 'none'
      ) {
        window.close();
      }
    });

    // Profile management
    document.getElementById('add-profile').addEventListener('click', () => {
      this.createNewProfile();
    });

    // Info circle tooltip
    document.getElementById('info-circle').addEventListener('click', () => {
      this.toggleInfoTooltip();
    });

    // Click outside to close tooltip
    document.addEventListener('click', e => {
      if (!e.target.closest('#info-circle') && !e.target.closest('#info-tooltip')) {
        this.hideInfoTooltip();
      }
    });

    // Header management
    document.getElementById('add-request-header').addEventListener('click', () => {
      this.addHeader('request');
    });
  }

  renderUI() {
    this.renderProfileCircles();
    this.renderHeaders();
    this.updateToolbar();
  }

  renderProfileCircles() {
    const container = document.getElementById('profile-circles');
    container.innerHTML = '';

    Object.entries(this.profiles).forEach(([key, profile], _index) => {
      const circleDiv = document.createElement('div');
      circleDiv.className = `profile-circle ${key === this.currentProfile ? 'active' : ''}`;

      // Use first letter of profile name
      const firstLetter = profile.name.charAt(0).toUpperCase();
      circleDiv.textContent = firstLetter;

      // Apply custom colors
      if (profile.backgroundColor) {
        circleDiv.style.backgroundColor = profile.backgroundColor;
      }
      if (profile.textColor) {
        circleDiv.style.color = profile.textColor;
      }

      // Use description as tooltip if available, otherwise just the name
      let tooltip = profile.name;
      if (
        profile.description &&
        profile.description.trim() &&
        profile.description !== 'Click to edit description'
      ) {
        tooltip = `${profile.name}\n${profile.description}`;
      }
      circleDiv.title = tooltip;

      // Add indicator
      const indicator = document.createElement('div');
      indicator.className = `profile-indicator ${key === this.currentProfile ? 'active' : 'inactive'}`;
      circleDiv.appendChild(indicator);

      // Click to activate profile
      circleDiv.addEventListener('click', () => {
        this.switchProfile(key);
      });

      // Context menu for profile management
      circleDiv.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.showProfileMenu(key, e.clientX, e.clientY);
      });

      container.appendChild(circleDiv);
    });
  }

  renderHeaders() {
    this.renderHeadersList('request');
  }

  renderHeadersList(type) {
    const listId = `${type}-headers-list`;
    const list = document.getElementById(listId);
    const headers = this.profiles[this.currentProfile][`${type}Headers`] || [];

    list.innerHTML = '';

    headers.forEach((header, index) => {
      const headerDiv = this.createHeaderElement(type, header, index);
      list.appendChild(headerDiv);
    });
  }

  createHeaderElement(type, header, index) {
    const div = document.createElement('div');
    div.className = 'header-item';
    div.draggable = true;
    div.dataset.headerType = type;
    div.dataset.headerIndex = index;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
    dragHandle.title = 'Drag to reorder';

    // Checkbox for enable/disable
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'header-checkbox';
    checkbox.checked = header.enabled !== false;
    checkbox.addEventListener('change', e => {
      this.updateHeader(type, index, 'enabled', e.target.checked);
    });

    // Header name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'header-name';
    nameInput.placeholder = 'Header name';
    nameInput.value = header.name || '';
    nameInput.addEventListener('input', e => {
      this.updateHeader(type, index, 'name', e.target.value);
    });
    nameInput.addEventListener('blur', () => {
      this.saveData();
    });

    // Header value input
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'header-value';
    valueInput.placeholder = 'Header value';
    valueInput.value = header.value || '';
    valueInput.addEventListener('input', e => {
      this.updateHeader(type, index, 'value', e.target.value);
    });
    valueInput.addEventListener('blur', () => {
      this.saveData();
    });

    // Actions
    const actions = document.createElement('div');
    actions.className = 'header-actions';

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'header-delete';
    deleteButton.innerHTML = '✕';
    deleteButton.title = 'Delete header';
    deleteButton.addEventListener('click', () => {
      this.removeHeader(type, index);
    });

    actions.appendChild(deleteButton);

    div.appendChild(dragHandle);
    div.appendChild(checkbox);
    div.appendChild(nameInput);
    div.appendChild(valueInput);
    div.appendChild(actions);

    // Add drag and drop event listeners
    this.addDragListeners(div, type, index);

    return div;
  }

  updateToolbar() {
    // Update profile name input
    const profileNameInput = document.getElementById('profile-name-input');
    profileNameInput.value = this.profiles[this.currentProfile]?.name || 'Default';

    // Update profile description
    const currentProfile = this.profiles[this.currentProfile];
    const descriptionDiv = document.getElementById('profile-description');
    const descriptionInput = document.getElementById('description-input');

    // Always show description input, but adjust visibility based on content
    descriptionInput.value = currentProfile?.description || '';
    if (currentProfile?.description && currentProfile.description !== 'Click to edit description') {
      descriptionDiv.style.display = 'block';
    } else {
      // Show for new profiles with placeholder, hide for profiles without description
      descriptionDiv.style.display = currentProfile?.description ? 'block' : 'none';
    }

    // Update pause button
    const pauseBtn = document.getElementById('pause-btn');
    if (this.isPaused) {
      pauseBtn.classList.add('paused');
      pauseBtn.title = 'Resume Extension';
      pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    } else {
      pauseBtn.classList.remove('paused');
      pauseBtn.title = 'Pause Extension';
      pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }

    // Update pin button
    const pinBtn = document.getElementById('pin-btn');
    if (this.isPinned) {
      pinBtn.classList.add('pinned');
      pinBtn.title = 'Unpin (Enable auto-close)';
    } else {
      pinBtn.classList.remove('pinned');
      pinBtn.title = 'Pin (Disable auto-close)';
    }
  }

  async switchProfile(profileKey) {
    if (!this.profiles[profileKey]) {
      return;
    }
    this.currentProfile = profileKey;
    await this.saveData();
    this.renderUI();
  }

  async togglePause() {
    this.isPaused = !this.isPaused;
    await this.saveData();
    this.updateToolbar();
  }

  async togglePin() {
    this.isPinned = !this.isPinned;
    await this.saveData();
    this.updateToolbar();
  }

  addHeader(type) {
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    headers.push({ name: '', value: '', enabled: true });
    this.renderHeadersList(type);
    // Don't save immediately, wait for user input
  }

  async updateHeader(type, index, field, value) {
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    if (headers[index]) {
      headers[index][field] = value;
      if (field === 'enabled') {
        await this.saveData(); // Save immediately for enable/disable
      }
    }
  }

  async removeHeader(type, index) {
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    headers.splice(index, 1);
    await this.saveData();
    this.renderHeadersList(type);
  }

  createNewProfile() {
    this.profileCounter++;
    const key = `profile_${Date.now()}`;
    this.profiles[key] = {
      name: `Profile ${this.profileCounter}`,
      description: 'Click to edit description',
      requestHeaders: [],
      backgroundColor: '#4caf50',
      textColor: '#ffffff',
    };
    this.currentProfile = key;
    this.saveData();
    this.renderUI();
  }

  toggleInfoTooltip() {
    const tooltip = document.getElementById('info-tooltip');
    const isVisible = tooltip.style.display !== 'none';

    if (isVisible) {
      this.hideInfoTooltip();
    } else {
      this.showInfoTooltip();
    }
  }

  showInfoTooltip() {
    const tooltip = document.getElementById('info-tooltip');
    tooltip.style.display = 'block';

    // Only add event listeners once
    if (!this.infoLinksSetup) {
      this.setupInfoLinks();
      this.infoLinksSetup = true;
    }
  }

  setupInfoLinks() {
    const tooltip = document.getElementById('info-tooltip');
    const links = tooltip.querySelectorAll('a');

    links.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();

        const url = link.href;

        // Try chrome.tabs.create first, fallback to window.open
        if (chrome && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: url }).catch(() => {
            window.open(url, '_blank');
          });
        } else {
          window.open(url, '_blank');
        }
      });
    });
  }

  hideInfoTooltip() {
    const tooltip = document.getElementById('info-tooltip');
    tooltip.style.display = 'none';
  }

  async deleteCurrentProfile() {
    // Close dropdown first
    this.closeDropdown();

    if (this.currentProfile === 'default') {
      return; // Should not happen due to UI logic, but safety check
    }

    const profileName = this.profiles[this.currentProfile]?.name || 'this profile';

    if (
      confirm(`Are you sure you want to delete "${profileName}"? This action cannot be undone.`)
    ) {
      delete this.profiles[this.currentProfile];
      this.currentProfile = 'default';
      await this.saveData();
      this.renderUI();
    }
  }

  showProfileMenu(profileKey, _x, _y) {
    // Simple context menu - could be enhanced
    if (profileKey !== 'default') {
      if (confirm(`Delete profile "${this.profiles[profileKey].name}"?`)) {
        delete this.profiles[profileKey];
        if (this.currentProfile === profileKey) {
          this.currentProfile = 'default';
        }
        this.saveData();
        this.renderUI();
      }
    }
  }

  refreshHeaders() {
    this.renderHeaders();
  }

  openFullscreen() {
    // Open the extension in a new window for fullscreen experience
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 800,
      height: 600,
    });

    // Close the popup
    window.close();
  }

  async updateProfileName(newName) {
    if (newName && newName.trim()) {
      this.profiles[this.currentProfile].name = newName.trim();
      await this.saveData();
      this.renderProfileCircles(); // Update tooltips
    } else {
      // Restore original name if empty
      this.updateToolbar();
    }
  }

  async updateProfileDescription(newDescription) {
    this.profiles[this.currentProfile].description = newDescription.trim();
    await this.saveData();

    // Hide description div if empty
    const descriptionDiv = document.getElementById('profile-description');
    if (!newDescription.trim()) {
      descriptionDiv.style.display = 'none';
    }
  }

  toggleDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    const deleteItem = document.getElementById('delete-profile-item');

    // Update delete item state based on current profile
    if (this.currentProfile === 'default') {
      deleteItem.classList.add('disabled');
      deleteItem.innerHTML =
        '<i class="fas fa-trash-alt"></i><span>Cannot delete default profile</span>';
    } else {
      deleteItem.classList.remove('disabled');
      deleteItem.classList.add('danger');
      deleteItem.innerHTML = '<i class="fas fa-trash-alt"></i><span>Delete Profile</span>';
    }

    // Toggle dropdown visibility
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  }

  closeDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.style.display = 'none';
  }

  addDragListeners(element, type, index) {
    element.addEventListener('dragstart', e => {
      this.handleDragStart(e, type, index);
    });

    element.addEventListener('dragover', e => {
      this.handleDragOver(e);
    });

    element.addEventListener('dragenter', e => {
      e.preventDefault();
    });

    element.addEventListener('dragleave', e => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drop-target');
      }
    });

    element.addEventListener('drop', e => {
      this.handleDrop(e, type, index);
    });

    element.addEventListener('dragend', e => {
      this.handleDragEnd(e);
    });
  }

  handleDragStart(e, type, index) {
    this.dragData = { type, index };
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Clear all drop targets first
    document.querySelectorAll('.drop-target').forEach(item => {
      item.classList.remove('drop-target');
    });

    const headerItem = e.target.closest('.header-item');
    if (headerItem && !headerItem.classList.contains('dragging')) {
      headerItem.classList.add('drop-target');
    }
  }

  handleDrop(e, type, targetIndex) {
    e.preventDefault();

    if (!this.dragData) {
      return;
    }

    const { type: sourceType, index: sourceIndex } = this.dragData;

    // Only allow reordering within the same type (request/response)
    if (sourceType !== type) {
      return;
    }

    if (sourceIndex !== targetIndex) {
      this.reorderHeaders(type, sourceIndex, targetIndex);
    }

    this.clearDragStyles();
  }

  handleDragEnd(_e) {
    this.clearDragStyles();
    this.dragData = null;
  }

  clearDragStyles() {
    document.querySelectorAll('.header-item').forEach(item => {
      item.classList.remove('dragging', 'drop-target');
    });
  }

  async reorderHeaders(type, fromIndex, toIndex) {
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    const movedHeader = headers.splice(fromIndex, 1)[0];
    headers.splice(toIndex, 0, movedHeader);

    await this.saveData();
    this.renderHeadersList(type);
  }

  // ── Import/Export delegations (tests call these directly on the popup instance) ──
  showImportModal() {
    return this.importExport.showImportModal();
  }
  showExportModal() {
    return this.importExport.showExportModal();
  }
  updateExportData() {
    return this.importExport.updateExportData();
  }
  closeModal() {
    return this.importExport.closeModal();
  }
  setValidationMessage(kind, text) {
    return this.importExport.setValidationMessage(kind, text);
  }
  validateJSON() {
    return this.importExport.validateJSON();
  }
  async handleModalAction() {
    return this.importExport.handleModalAction();
  }
  async handleImportFromModal() {
    return this.importExport.handleImportFromModal();
  }
  async replaceCurrentProfile(importData) {
    return this.importExport.replaceCurrentProfile(importData);
  }
  extractHeadersFromArray(importData) {
    return this.importExport.extractHeadersFromArray(importData);
  }
  async copyToClipboard() {
    return this.importExport.copyToClipboard();
  }
  showImportDialog() {
    return this.importExport.showImportDialog();
  }
  async handleImportFile(event) {
    return this.importExport.handleImportFile(event);
  }
  readFileAsText(file) {
    return this.importExport.readFileAsText(file);
  }
  async importProfile(importData) {
    return this.importExport.importProfile(importData);
  }
  isModHeaderProfileExport(data) {
    return this.importExport.isModHeaderProfileExport(data);
  }
  async importModHeaderProfiles(modHeaderData) {
    return this.importExport.importModHeaderProfiles(modHeaderData);
  }
  async importProfileFromData(importData) {
    return this.importExport.importProfileFromData(importData);
  }
  async createProfileFromHeaders(headersArray) {
    return this.importExport.createProfileFromHeaders(headersArray);
  }
  async importMultipleProfiles(exportData) {
    return this.importExport.importMultipleProfiles(exportData);
  }
  exportCurrentProfile() {
    return this.importExport.exportCurrentProfile();
  }
  convertToModHeaderFormat(profile) {
    return this.importExport.convertToModHeaderFormat(profile);
  }
  downloadJSON(data, filename) {
    return this.importExport.downloadJSON(data, filename);
  }

  // ── Color picker delegations ──────────────────────────────────────────────
  showColorPicker() {
    return this.colorPicker.showColorPicker();
  }
  closeColorPicker() {
    return this.colorPicker.closeColorPicker();
  }
  updateColorPickerUI() {
    return this.colorPicker.updateColorPickerUI();
  }
  updateGradientBackground(color, preserveHue) {
    return this.colorPicker.updateGradientBackground(color, preserveHue);
  }
  updateColorSelector(color, smooth) {
    return this.colorPicker.updateColorSelector(color, smooth);
  }
  updateColorPreview() {
    return this.colorPicker.updateColorPreview();
  }
  setupColorPickerInteractions() {
    return this.colorPicker.setupColorPickerInteractions();
  }
  saveProfileColor() {
    return this.colorPicker.saveProfileColor();
  }

  // Wrappers kept for tests that call these through the class instance.
  hexToHsl(hex) {
    return hexToHsl(hex);
  }
  hslToHex(h, s, l) {
    return hslToHex(h, s, l);
  }

  // ── Update notification delegations (tests spy on popup instance directly) ──
  async checkForUpdateNotification() {
    return this.updateNotifications.checkForUpdateNotification();
  }
  showUpdateTooltip(updateInfo) {
    return this.updateNotifications.showUpdateTooltip(updateInfo);
  }
  showWelcomeTooltip(welcomeInfo) {
    return this.updateNotifications.showWelcomeTooltip(welcomeInfo);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new HeaderEditorPopup();
});
