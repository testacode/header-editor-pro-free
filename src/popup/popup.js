// Import CSS
import './popup.css';

class HeaderEditorPopup {
  constructor() {
    this.currentProfile = 'default';
    this.profiles = {};
    this.isEnabled = true;
    this.isPaused = false;
    this.isPinned = false;
    this.colorPickerInteractionsSetup = false;
    this.infoLinksSetup = false;
    this.profileCounter = 1;
    this.init();
  }

  async init() {
    await this.loadData();
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
            textColor: '#ffffff'
          }
        },
        currentProfile: 'default',
        enabled: true,
        paused: false,
        pinned: false,
        profileCounter: 1
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
        lightness: 0.5
      };
    } catch (error) {
      this.profiles = {
        default: {
          name: 'Default',
          description: 'Click to edit description',
          requestHeaders: []
        }
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
            enabled: header.enabled !== undefined ? header.enabled : true
          }));
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
      profileCounter: this.profileCounter
    };
    await chrome.storage.local.set({ headerEditorData: data });
    
    // Notify background script of changes
    try {
      await chrome.runtime.sendMessage({
        action: 'updateHeaders',
        data: data
      });
    } catch (error) {
      // Background script might not be ready, ignore error
    }
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
    document.getElementById('import-file-input').addEventListener('change', (e) => {
      this.handleImportFile(e);
    });

    // Profile name inline editing
    document.getElementById('profile-name-input').addEventListener('blur', (e) => {
      this.updateProfileName(e.target.value);
    });

    document.getElementById('profile-name-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    // Profile description inline editing
    document.getElementById('description-input').addEventListener('blur', (e) => {
      this.updateProfileDescription(e.target.value);
    });

    document.getElementById('description-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    // Show description input when clicking if it's hidden
    document.getElementById('description-input').addEventListener('focus', () => {
      document.getElementById('profile-description').style.display = 'block';
    });

    // Dropdown menu functionality
    document.getElementById('menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    document.getElementById('delete-profile-item').addEventListener('click', (e) => {
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

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
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

    document.getElementById('color-picker-overlay').addEventListener('click', (e) => {
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
      
      if (!this.isPinned && 
          modalOverlay.style.display === 'none' && 
          dropdown.style.display === 'none') {
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
    document.addEventListener('click', (e) => {
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
    
    Object.entries(this.profiles).forEach(([key, profile], index) => {
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
      if (profile.description && profile.description.trim() && 
          profile.description !== 'Click to edit description') {
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
      circleDiv.addEventListener('contextmenu', (e) => {
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
    checkbox.addEventListener('change', (e) => {
      this.updateHeader(type, index, 'enabled', e.target.checked);
    });
    
    // Header name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'header-name';
    nameInput.placeholder = 'Header name';
    nameInput.value = header.name || '';
    nameInput.addEventListener('input', (e) => {
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
    valueInput.addEventListener('input', (e) => {
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
    const key = 'profile_' + Date.now();
    this.profiles[key] = {
      name: `Profile ${this.profileCounter}`,
      description: 'Click to edit description',
      requestHeaders: [],
      backgroundColor: '#4caf50',
      textColor: '#ffffff'
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
      link.addEventListener('click', (e) => {
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
    
    if (confirm(`Are you sure you want to delete "${profileName}"? This action cannot be undone.`)) {
      delete this.profiles[this.currentProfile];
      this.currentProfile = 'default';
      await this.saveData();
      this.renderUI();
    }
  }

  showProfileMenu(profileKey, x, y) {
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
      height: 600
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
      deleteItem.innerHTML = '<i class="fas fa-trash-alt"></i><span>Cannot delete default profile</span>';
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
    element.addEventListener('dragstart', (e) => {
      this.handleDragStart(e, type, index);
    });

    element.addEventListener('dragover', (e) => {
      this.handleDragOver(e);
    });

    element.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });

    element.addEventListener('dragleave', (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drop-target');
      }
    });

    element.addEventListener('drop', (e) => {
      this.handleDrop(e, type, index);
    });

    element.addEventListener('dragend', (e) => {
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
    
    if (!this.dragData) return;
    
    const { type: sourceType, index: sourceIndex } = this.dragData;
    
    // Only allow reordering within the same type (request/response)
    if (sourceType !== type) return;
    
    if (sourceIndex !== targetIndex) {
      this.reorderHeaders(type, sourceIndex, targetIndex);
    }
    
    this.clearDragStyles();
  }

  handleDragEnd(e) {
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

  showImportModal() {
    this.currentModalMode = 'import';
    document.getElementById('modal-title').textContent = 'Import Configuration';
    document.getElementById('json-textarea').value = '';
    document.getElementById('json-textarea').placeholder = 'Paste your JSON configuration here...';
    document.getElementById('modal-action').textContent = 'Import';
    document.getElementById('modal-action').style.display = 'block';
    document.getElementById('modal-copy').style.display = 'none';
    document.getElementById('validation-message').textContent = '';
    
    // Show import options, hide export options
    document.getElementById('import-options').style.display = 'block';
    document.querySelector('.option-group:first-child').style.display = 'none'; // Hide export scope
    
    document.getElementById('modal-overlay').style.display = 'flex';
    
    // Focus on textarea
    setTimeout(() => {
      document.getElementById('json-textarea').focus();
    }, 100);
  }

  showExportModal() {
    this.currentModalMode = 'export';
    
    document.getElementById('modal-title').textContent = 'Export Configuration';
    document.getElementById('json-textarea').placeholder = '';
    document.getElementById('modal-action').style.display = 'none';
    document.getElementById('modal-copy').style.display = 'block';
    
    // Show export options, hide import options
    document.querySelector('.option-group:first-child').style.display = 'block'; // Show export scope
    document.getElementById('import-options').style.display = 'none';
    
    // Generate initial export based on current selection
    this.updateExportData();
    
    // Add event listener for export scope changes
    document.querySelectorAll('input[name="export-scope"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.updateExportData();
      });
    });
    
    document.getElementById('modal-overlay').style.display = 'flex';
    
    // Select all text for easy copying
    setTimeout(() => {
      document.getElementById('json-textarea').select();
    }, 100);
  }

  updateExportData() {
    const exportScope = document.querySelector('input[name="export-scope"]:checked').value;
    let exportData;
    
    if (exportScope === 'current') {
      const currentProfile = this.profiles[this.currentProfile];
      exportData = this.convertToModHeaderFormat(currentProfile);
    } else {
      // Export all profiles in a more comprehensive format
      exportData = {
        profiles: {},
        currentProfile: this.currentProfile,
        exportedAt: new Date().toISOString()
      };
      
      Object.entries(this.profiles).forEach(([key, profile]) => {
        exportData.profiles[key] = {
          name: profile.name,
          description: profile.description,
          requestHeaders: profile.requestHeaders || []
        };
      });
    }
    
    const jsonString = JSON.stringify(exportData, null, 2);
    document.getElementById('json-textarea').value = jsonString;
    
    const headerCount = exportScope === 'current' 
      ? exportData.length 
      : Object.values(this.profiles).reduce((count, profile) => 
          count + (profile.requestHeaders?.length || 0), 0);
      
    document.getElementById('validation-message').innerHTML = 
      `<span class="success">✓ Ready to copy (${exportScope === 'current' ? 'current profile' : Object.keys(this.profiles).length + ' profiles'})</span>`;
  }

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    this.currentModalMode = null;
  }

  validateJSON() {
    const textarea = document.getElementById('json-textarea');
    const message = document.getElementById('validation-message');
    const actionBtn = document.getElementById('modal-action');
    
    if (!textarea.value.trim()) {
      message.textContent = '';
      actionBtn.disabled = true;
      return;
    }
    
    try {
      const parsed = JSON.parse(textarea.value);
      
      // Validate structure for import
      if (this.currentModalMode === 'import') {
        if (!Array.isArray(parsed)) {
          throw new Error('JSON must be an array of headers');
        }
        
        // Check if headers have required structure
        for (let i = 0; i < parsed.length; i++) {
          const header = parsed[i];
          if (!header.name || typeof header.name !== 'string') {
            throw new Error(`Header ${i + 1}: missing or invalid 'name' field`);
          }
        }
        
        message.innerHTML = `<span class="success">✓ Valid JSON (${parsed.length} headers)</span>`;
      } else {
        message.innerHTML = '<span class="success">✓ Valid JSON</span>';
      }
      
      actionBtn.disabled = false;
    } catch (error) {
      message.innerHTML = `<span class="error">✗ ${error.message}</span>`;
      actionBtn.disabled = true;
    }
  }

  async handleModalAction() {
    if (this.currentModalMode === 'import') {
      await this.handleImportFromModal();
    }
  }

  async handleImportFromModal() {
    const textarea = document.getElementById('json-textarea');
    const importMode = document.querySelector('input[name="import-mode"]:checked').value;
    
    try {
      const importData = JSON.parse(textarea.value);
      
      if (importMode === 'new') {
        await this.importProfileFromData(importData);
      } else {
        // Replace current profile
        await this.replaceCurrentProfile(importData);
      }
      
      this.closeModal();
    } catch (error) {
      const message = document.getElementById('validation-message');
      message.innerHTML = `<span class="error">✗ Import failed: ${error.message}</span>`;
    }
  }

  async replaceCurrentProfile(importData) {
    // Handle different import formats
    if (Array.isArray(importData)) {
      // ModHeader format - array of headers
      const headers = this.extractHeadersFromArray(importData);
      this.profiles[this.currentProfile].requestHeaders = headers;
    } else if (importData.profiles) {
      // Full export format - multiple profiles
      if (Object.keys(importData.profiles).length === 1) {
        // Import single profile from multi-profile export
        const profileKey = Object.keys(importData.profiles)[0];
        const profileData = importData.profiles[profileKey];
        this.profiles[this.currentProfile].requestHeaders = profileData.requestHeaders || [];
      } else {
        throw new Error('Cannot replace current profile with multiple profiles. Use "Create new profile" mode instead.');
      }
    } else {
      throw new Error('Invalid import format');
    }
    
    await this.saveData();
    this.renderUI();
  }

  extractHeadersFromArray(importData) {
    const headers = [];
    importData.forEach(header => {
      if (header.name && typeof header.name === 'string') {
        headers.push({
          name: header.name,
          value: header.value || '',
          enabled: header.enabled !== false
        });
      }
    });
    return headers;
  }

  async copyToClipboard() {
    const textarea = document.getElementById('json-textarea');
    const copyBtn = document.getElementById('modal-copy');
    
    try {
      await navigator.clipboard.writeText(textarea.value);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✓ Copied!';
      copyBtn.style.background = '#4CAF50';
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '#2196F3';
      }, 2000);
    } catch (error) {
      // Fallback for older browsers
      textarea.select();
      document.execCommand('copy');
      copyBtn.textContent = '✓ Copied!';
    }
  }

  showImportDialog() {
    const fileInput = document.getElementById('import-file-input');
    fileInput.click();
  }

  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert('Please select a JSON file');
      return;
    }

    try {
      const text = await this.readFileAsText(file);
      const importData = JSON.parse(text);
      await this.importProfile(importData);
      
      // Clear the file input
      event.target.value = '';
    } catch (error) {
      alert('Error importing file: ' + error.message);
      event.target.value = '';
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async importProfile(importData) {
    await this.importProfileFromData(importData);
    alert(`Successfully imported to profile "${this.profiles[this.currentProfile].name}"`);
  }

  async importProfileFromData(importData) {
    if (Array.isArray(importData)) {
      // ModHeader format - single profile from headers array
      this.createProfileFromHeaders(importData);
    } else if (importData.profiles) {
      // Full export format - multiple profiles
      await this.importMultipleProfiles(importData);
    } else {
      throw new Error('Invalid JSON format. Expected array of headers or profiles object.');
    }
  }

  createProfileFromHeaders(headersArray) {
    const headers = this.extractHeadersFromArray(headersArray);
    
    this.profileCounter++;
    const key = 'profile_' + Date.now();
    this.profiles[key] = {
      name: `Imported Profile ${this.profileCounter}`,
      description: 'Imported from JSON - click to edit',
      requestHeaders: headers
    };

    this.currentProfile = key;
    this.saveData();
    this.renderUI();
  }

  async importMultipleProfiles(exportData) {
    let importedCount = 0;
    
    for (const [originalKey, profileData] of Object.entries(exportData.profiles)) {
      this.profileCounter++;
      const newKey = 'profile_' + Date.now() + '_' + importedCount;
      
      this.profiles[newKey] = {
        name: profileData.name || `Imported Profile ${this.profileCounter}`,
        description: profileData.description || 'Imported from JSON - click to edit',
        requestHeaders: profileData.requestHeaders || []
      };
      
      importedCount++;
      
      // Small delay to ensure unique timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // Switch to first imported profile
    const firstImportedKey = Object.keys(this.profiles).find(key => 
      key.includes('profile_' + Date.now().toString().slice(0, -3))
    );
    if (firstImportedKey) {
      this.currentProfile = firstImportedKey;
    }

    await this.saveData();
    this.renderUI();
  }

  exportCurrentProfile() {
    const currentProfile = this.profiles[this.currentProfile];
    if (!currentProfile) {
      alert('No profile selected to export');
      return;
    }

    // Convert to ModHeader format
    const exportData = this.convertToModHeaderFormat(currentProfile);
    
    // Create and download the file
    this.downloadJSON(exportData, `${currentProfile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_headers.json`);
  }

  convertToModHeaderFormat(profile) {
    const headers = [];
    
    // Add request headers
    if (profile.requestHeaders) {
      profile.requestHeaders.forEach(header => {
        if (header.name && header.name.trim()) {
          headers.push({
            appendMode: false,
            enabled: header.enabled !== false,
            name: header.name,
            value: header.value || ''
          });
        }
      });
    }

    // Response headers would need different handling in ModHeader format
    
    return headers;
  }

  downloadJSON(data, filename) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    URL.revokeObjectURL(url);
  }

  // Color Picker Methods
  showColorPicker() {
    const profile = this.profiles[this.currentProfile];
    
    // Set initial colors from current profile
    this.colorPickerState.tempBackgroundColor = profile.backgroundColor || '#4caf50';
    this.colorPickerState.tempTextColor = profile.textColor || '#ffffff';
    this.colorPickerState.currentTab = 'background';
    
    // Update UI
    this.updateColorPickerUI();
    
    // Show modal
    document.getElementById('color-picker-overlay').style.display = 'flex';
  }

  closeColorPicker() {
    document.getElementById('color-picker-overlay').style.display = 'none';
  }

  updateColorPickerUI() {
    const profile = this.profiles[this.currentProfile];
    const previewCircle = document.getElementById('color-preview-circle');
    const previewText = document.getElementById('color-preview-text');
    
    // Update preview circle
    previewCircle.style.backgroundColor = this.colorPickerState.tempBackgroundColor;
    previewText.style.color = this.colorPickerState.tempTextColor;
    previewText.textContent = profile.name.charAt(0).toUpperCase();
    
    // Update tab states
    document.getElementById('background-tab').classList.toggle('active', this.colorPickerState.currentTab === 'background');
    document.getElementById('text-tab').classList.toggle('active', this.colorPickerState.currentTab === 'text');
    
    // Update color gradient background based on current tab
    const currentColor = this.colorPickerState.currentTab === 'background' 
      ? this.colorPickerState.tempBackgroundColor 
      : this.colorPickerState.tempTextColor;
    
    this.updateGradientBackground(currentColor);
    this.setupColorPickerInteractions();
    this.updateColorSelector(currentColor, false); // No smooth transition on initial load
  }

  updateGradientBackground(color, preserveHue = false) {
    const hslColor = this.hexToHsl(color);
    
    // Only update hue if not preserving it (e.g., when saturation > 0.1)
    if (!preserveHue && hslColor.s > 0.1) {
      this.colorPickerState.hue = hslColor.h;
    }
    
    const gradient = document.getElementById('color-gradient');
    const hueSlider = document.getElementById('hue-slider');
    
    // Update gradient background - combine both gradients properly
    gradient.style.background = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%), linear-gradient(to right, rgba(255,255,255,1) 0%, hsl(${this.colorPickerState.hue}, 100%, 50%) 100%)`;
    
    // Update hue slider
    hueSlider.value = this.colorPickerState.hue;
  }

  updateColorSelector(color, smooth = true) {
    const hslColor = this.hexToHsl(color);
    const selector = document.getElementById('color-selector');
    
    // Position the selector based on current color
    const saturation = hslColor.s;
    const lightness = hslColor.l;
    
    // Store in state for hue slider to use
    this.colorPickerState.saturation = saturation;
    this.colorPickerState.lightness = lightness;
    
    // Add smooth transition for non-dragging updates
    if (smooth) {
      selector.classList.add('smooth');
    } else {
      selector.classList.remove('smooth');
    }
    
    selector.style.left = `${saturation * 100}%`;
    selector.style.top = `${(1 - lightness) * 100}%`;
  }

  updateColorPreview() {
    const profile = this.profiles[this.currentProfile];
    const previewCircle = document.getElementById('color-preview-circle');
    const previewText = document.getElementById('color-preview-text');
    
    // Update preview circle
    previewCircle.style.backgroundColor = this.colorPickerState.tempBackgroundColor;
    previewText.style.color = this.colorPickerState.tempTextColor;
    previewText.textContent = profile.name.charAt(0).toUpperCase();
  }

  setupColorPickerInteractions() {
    // Only set up interactions once
    if (this.colorPickerInteractionsSetup) return;
    this.colorPickerInteractionsSetup = true;
    
    // Tab switching
    document.getElementById('background-tab').onclick = () => {
      this.colorPickerState.currentTab = 'background';
      this.updateColorPickerUI();
    };
    
    document.getElementById('text-tab').onclick = () => {
      this.colorPickerState.currentTab = 'text';
      this.updateColorPickerUI();
    };
    
    // Color gradient interaction
    const gradient = document.getElementById('color-gradient');
    const selector = document.getElementById('color-selector');
    
    let isDragging = false;
    
    const updateColorFromPosition = (e) => {
      const rect = gradient.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const saturation = Math.max(0, Math.min(1, x / rect.width));
      const lightness = Math.max(0, Math.min(1, 1 - (y / rect.height)));
      
      // Store saturation and lightness in state
      this.colorPickerState.saturation = saturation;
      this.colorPickerState.lightness = lightness;
      
      // Preserve the current hue when saturation is 0 (white/grey area)
      // Don't let hexToHsl change the hue when color becomes achromatic
      const color = this.hslToHex(this.colorPickerState.hue, saturation, lightness);
      
      if (this.colorPickerState.currentTab === 'background') {
        this.colorPickerState.tempBackgroundColor = color;
      } else {
        this.colorPickerState.tempTextColor = color;
      }
      
      // Update selector position (no smooth transition during drag)
      selector.classList.remove('smooth');
      selector.style.left = `${saturation * 100}%`;
      selector.style.top = `${(1 - lightness) * 100}%`;
      
      // Update UI but don't call updateColorPickerUI which might recalculate hue
      this.updateColorPreview();
    };
    
    // Mouse events for gradient
    gradient.onmousedown = (e) => {
      isDragging = true;
      updateColorFromPosition(e);
      e.preventDefault();
      e.stopPropagation();
    };
    
    // Global mouse events to handle dragging outside the gradient
    document.onmousemove = (e) => {
      if (isDragging) {
        updateColorFromPosition(e);
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    document.onmouseup = () => {
      if (isDragging) {
        isDragging = false;
        // Re-enable smooth transitions after dragging
        selector.classList.add('smooth');
      }
    };
    
    // Also keep the click handler for single clicks
    gradient.onclick = (e) => {
      if (!isDragging) {
        updateColorFromPosition(e);
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    // Hue slider
    const hueSlider = document.getElementById('hue-slider');
    hueSlider.oninput = () => {
      this.colorPickerState.hue = parseInt(hueSlider.value);
      
      // Use stored saturation and lightness values
      const saturation = this.colorPickerState.saturation;
      const lightness = this.colorPickerState.lightness;
      
      // Generate new color with updated hue
      const newColor = this.hslToHex(this.colorPickerState.hue, saturation, lightness);
      
      // Update the appropriate color value
      if (this.colorPickerState.currentTab === 'background') {
        this.colorPickerState.tempBackgroundColor = newColor;
      } else {
        this.colorPickerState.tempTextColor = newColor;
      }
      
      // Update the entire UI
      this.updateColorPickerUI();
    };
    
    // Preset colors
    document.querySelectorAll('.preset-color').forEach(preset => {
      preset.onclick = () => {
        const color = preset.getAttribute('data-color');
        
        // Update the appropriate temp color
        if (this.colorPickerState.currentTab === 'background') {
          this.colorPickerState.tempBackgroundColor = color;
        } else {
          this.colorPickerState.tempTextColor = color;
        }
        
        // Update HSL values and selector position
        const hslColor = this.hexToHsl(color);
        this.colorPickerState.hue = hslColor.h;
        this.colorPickerState.saturation = hslColor.s;
        this.colorPickerState.lightness = hslColor.l;
        
        this.updateColorPickerUI();
      };
    });
  }

  saveProfileColor() {
    const profile = this.profiles[this.currentProfile];
    profile.backgroundColor = this.colorPickerState.tempBackgroundColor;
    profile.textColor = this.colorPickerState.tempTextColor;
    
    this.saveData();
    this.renderProfileCircles();
    this.closeColorPicker();
  }

  // Color utility functions
  hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: Math.round(h * 360), s, l };
  }

  hslToHex(h, s, l) {
    h /= 360;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / (1/12)) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new HeaderEditorPopup();
});