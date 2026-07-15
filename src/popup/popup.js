// Import CSS
import './popup.css';

import { normalizeHeader, isHeaderEnabled, isAppendMode } from './header-normalize.js';
import { defaultHeaderEditorData } from './default-data.js';
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
    await this.updateNotifications.checkForUpdateNotification();
    this.setupEventListeners();
    this.renderUI();
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(['headerEditorData']);
      const data = result.headerEditorData || defaultHeaderEditorData();

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
    } catch (error) {
      console.error('Failed to load data from storage, using defaults:', error);
      const data = defaultHeaderEditorData();
      this.profiles = data.profiles;
      this.currentProfile = data.currentProfile;
      this.isEnabled = data.enabled;
      this.isPaused = data.paused;
      this.isPinned = data.pinned;
      this.profileCounter = data.profileCounter;
    }
  }

  migrateHeaderFormat() {
    Object.values(this.profiles).forEach(profile => {
      ['requestHeaders', 'responseHeaders'].forEach(headerType => {
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
      this.importExport.showImportModal();
      this.closeDropdown();
    });

    document.getElementById('export-item').addEventListener('click', () => {
      this.importExport.showExportModal();
      this.closeDropdown();
    });

    document.getElementById('color-picker-btn').addEventListener('click', () => {
      this.colorPicker.showColorPicker();
    });

    // Handle file input change
    document.getElementById('import-file-input').addEventListener('change', e => {
      this.importExport.handleImportFile(e);
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
      this.importExport.closeModal();
    });

    document.getElementById('modal-cancel').addEventListener('click', () => {
      this.importExport.closeModal();
    });

    document.getElementById('modal-action').addEventListener('click', () => {
      this.importExport.handleModalAction();
    });

    document.getElementById('modal-copy').addEventListener('click', () => {
      this.importExport.copyToClipboard();
    });

    document.getElementById('modal-download').addEventListener('click', () => {
      this.importExport.downloadExport();
    });

    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        this.importExport.closeModal();
      }
    });

    // Color picker modal event listeners
    document.getElementById('color-picker-close').addEventListener('click', () => {
      this.colorPicker.closeColorPicker();
    });

    document.getElementById('color-picker-cancel').addEventListener('click', () => {
      this.colorPicker.closeColorPicker();
    });

    document.getElementById('color-picker-save').addEventListener('click', () => {
      this.colorPicker.saveProfileColor();
    });

    document.getElementById('color-picker-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        this.colorPicker.closeColorPicker();
      }
    });

    // JSON validation on input
    document.getElementById('json-textarea').addEventListener('input', () => {
      this.importExport.validateJSON();
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

    document.getElementById('add-response-header').addEventListener('click', () => {
      this.addHeader('response');
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
        this.showProfileMenu(key);
      });

      container.appendChild(circleDiv);
    });
  }

  renderHeaders() {
    this.renderHeadersList('request');
    this.renderHeadersList('response');
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
    dragHandle.innerHTML =
      '<svg viewBox="0 0 320 512" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M40 352l48 0c22.1 0 40 17.9 40 40l0 48c0 22.1-17.9 40-40 40l-48 0c-22.1 0-40-17.9-40-40l0-48c0-22.1 17.9-40 40-40zm192 0l48 0c22.1 0 40 17.9 40 40l0 48c0 22.1-17.9 40-40 40l-48 0c-22.1 0-40-17.9-40-40l0-48c0-22.1 17.9-40 40-40zM40 320c-22.1 0-40-17.9-40-40l0-48c0-22.1 17.9-40 40-40l48 0c22.1 0 40 17.9 40 40l0 48c0 22.1-17.9 40-40 40l-48 0zM232 192l48 0c22.1 0 40 17.9 40 40l0 48c0 22.1-17.9 40-40 40l-48 0c-22.1 0-40-17.9-40-40l0-48c0-22.1 17.9-40 40-40zM40 160c-22.1 0-40-17.9-40-40L0 72C0 49.9 17.9 32 40 32l48 0c22.1 0 40 17.9 40 40l0 48c0 22.1-17.9 40-40 40l-48 0zM232 32l48 0c22.1 0 40 17.9 40 40l0 48c0 22.1-17.9 40-40 40l-48 0c-22.1 0-40-17.9-40-40l0-48c0-22.1 17.9-40 40-40z"/></svg>';
    dragHandle.title = 'Drag to reorder';

    // Checkbox for enable/disable
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'header-checkbox';
    checkbox.checked = isHeaderEnabled(header);
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

    // Append-mode toggle (append instead of set for multi-value headers)
    const appendToggle = document.createElement('button');
    appendToggle.className = 'header-append-toggle';
    appendToggle.textContent = 'A';
    appendToggle.title = 'Append instead of set';
    if (isAppendMode(header)) {
      appendToggle.classList.add('active');
    }
    appendToggle.addEventListener('click', () => {
      const next = !isAppendMode(this.profiles[this.currentProfile][`${type}Headers`][index]);
      this.updateHeader(type, index, 'appendMode', next);
      this.saveData();
      appendToggle.classList.toggle('active', next);
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
    div.appendChild(appendToggle);
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
      pauseBtn.innerHTML =
        '<svg viewBox="0 0 384 512" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>';
    } else {
      pauseBtn.classList.remove('paused');
      pauseBtn.title = 'Pause Extension';
      pauseBtn.innerHTML =
        '<svg viewBox="0 0 320 512" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z"/></svg>';
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
    const key = `${type}Headers`;
    // Pre-existing profiles in storage may lack responseHeaders — init on demand.
    if (!this.profiles[this.currentProfile][key]) {
      this.profiles[this.currentProfile][key] = [];
    }
    const headers = this.profiles[this.currentProfile][key];
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
      responseHeaders: [],
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

  async deleteProfile(profileKey) {
    if (profileKey === 'default' || !this.profiles[profileKey]) {
      return; // default is never deletable; unknown keys are a no-op
    }

    const profileName = this.profiles[profileKey]?.name || 'this profile';
    if (
      !confirm(`Are you sure you want to delete "${profileName}"? This action cannot be undone.`)
    ) {
      return;
    }

    delete this.profiles[profileKey];
    if (this.currentProfile === profileKey) {
      this.currentProfile = 'default';
    }
    await this.saveData();
    this.renderUI();
  }

  async deleteCurrentProfile() {
    this.closeDropdown();
    return this.deleteProfile(this.currentProfile);
  }

  showProfileMenu(profileKey) {
    return this.deleteProfile(profileKey);
  }

  async refreshHeaders() {
    await this.loadData();
    this.renderUI();
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
        '<svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0L284.2 0c12.1 0 23.2 6.8 28.6 17.7L320 32l96 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 96C14.3 96 0 81.7 0 64S14.3 32 32 32l96 0 7.2-14.3zM32 128l384 0 0 320c0 35.3-28.7 64-64 64L96 512c-35.3 0-64-28.7-64-64l0-320zm96 64c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16z"/></svg><span>Cannot delete default profile</span>';
    } else {
      deleteItem.classList.remove('disabled');
      deleteItem.classList.add('danger');
      deleteItem.innerHTML =
        '<svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0L284.2 0c12.1 0 23.2 6.8 28.6 17.7L320 32l96 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 96C14.3 96 0 81.7 0 64S14.3 32 32 32l96 0 7.2-14.3zM32 128l384 0 0 320c0 35.3-28.7 64-64 64L96 512c-35.3 0-64-28.7-64-64l0-320zm96 64c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16z"/></svg><span>Delete Profile</span>';
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new HeaderEditorPopup();
});
