class HeaderEditorPopup {
  constructor() {
    this.currentProfile = 'default';
    this.profiles = {};
    this.isEnabled = true;
    this.isPaused = false;
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
            responseHeaders: []
          }
        },
        currentProfile: 'default',
        enabled: true,
        paused: false,
        profileCounter: 1
      };
      
      this.profiles = data.profiles;
      this.currentProfile = data.currentProfile;
      this.isEnabled = data.enabled;
      this.isPaused = data.paused || false;
      this.profileCounter = data.profileCounter || 1;
      
      // Migrate old header format to include 'enabled' property
      this.migrateHeaderFormat();
      
      // Migrate profiles to include description field
      this.migrateProfileFormat();
    } catch (error) {
      this.profiles = {
        default: {
          name: 'Default',
          description: 'Click to edit description',
          requestHeaders: [],
          responseHeaders: []
        }
      };
      this.currentProfile = 'default';
      this.isEnabled = true;
      this.isPaused = false;
      this.profileCounter = 1;
    }
  }

  migrateHeaderFormat() {
    Object.values(this.profiles).forEach(profile => {
      ['requestHeaders', 'responseHeaders'].forEach(headerType => {
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

    document.getElementById('add-btn').addEventListener('click', () => {
      this.addHeader('request');
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.refreshHeaders();
    });

    document.getElementById('import-btn').addEventListener('click', () => {
      this.showImportModal();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      this.showExportModal();
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

    // JSON validation on input
    document.getElementById('json-textarea').addEventListener('input', () => {
      this.validateJSON();
    });

    // Profile management
    document.getElementById('add-profile').addEventListener('click', () => {
      this.createNewProfile();
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
    
    Object.entries(this.profiles).forEach(([key, profile], index) => {
      const circleDiv = document.createElement('div');
      circleDiv.className = `profile-circle ${key === this.currentProfile ? 'active' : ''}`;
      
      // Extract number from profile name or use fallback
      let displayNumber = index + 1;
      if (key === 'default') {
        displayNumber = 'D';
      } else {
        // Try to extract number from profile name
        const nameMatch = profile.name.match(/(\d+)$/);
        if (nameMatch) {
          displayNumber = nameMatch[1];
        }
      }
      
      circleDiv.textContent = displayNumber;
      circleDiv.title = profile.name;
      
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
    dragHandle.innerHTML = '⋮⋮';
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
    
    // Menu button
    const menuButton = document.createElement('button');
    menuButton.className = 'header-menu';
    menuButton.innerHTML = '⋮';
    menuButton.title = 'Header options';
    
    actions.appendChild(deleteButton);
    actions.appendChild(menuButton);
    
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
      pauseBtn.innerHTML = '▶';
    } else {
      pauseBtn.classList.remove('paused');
      pauseBtn.title = 'Pause Extension';
      pauseBtn.innerHTML = '⏸';
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
      responseHeaders: []
    };
    this.currentProfile = key;
    this.saveData();
    this.renderUI();
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
      deleteItem.innerHTML = '<span>🗑️</span><span>Cannot delete default profile</span>';
    } else {
      deleteItem.classList.remove('disabled');
      deleteItem.classList.add('danger');
      deleteItem.innerHTML = '<span>🗑️</span><span>Delete Profile</span>';
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
    document.getElementById('modal-overlay').style.display = 'flex';
    
    // Focus on textarea
    setTimeout(() => {
      document.getElementById('json-textarea').focus();
    }, 100);
  }

  showExportModal() {
    this.currentModalMode = 'export';
    const currentProfile = this.profiles[this.currentProfile];
    const exportData = this.convertToModHeaderFormat(currentProfile);
    const jsonString = JSON.stringify(exportData, null, 2);
    
    document.getElementById('modal-title').textContent = 'Export Configuration';
    document.getElementById('json-textarea').value = jsonString;
    document.getElementById('json-textarea').placeholder = '';
    document.getElementById('modal-action').style.display = 'none';
    document.getElementById('modal-copy').style.display = 'block';
    document.getElementById('validation-message').innerHTML = 
      '<span class="success">✓ Valid JSON - Ready to copy</span>';
    document.getElementById('modal-overlay').style.display = 'flex';
    
    // Select all text for easy copying
    setTimeout(() => {
      document.getElementById('json-textarea').select();
    }, 100);
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
    
    try {
      const importData = JSON.parse(textarea.value);
      await this.importProfileFromData(importData);
      this.closeModal();
    } catch (error) {
      const message = document.getElementById('validation-message');
      message.innerHTML = `<span class="error">✗ Import failed: ${error.message}</span>`;
    }
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
    // Validate the import data structure
    if (!Array.isArray(importData)) {
      throw new Error('Invalid JSON format. Expected an array of headers.');
    }

    // Extract headers from the import data
    const requestHeaders = [];
    const responseHeaders = [];

    importData.forEach(header => {
      if (!header.name || typeof header.name !== 'string') {
        return; // Skip invalid headers
      }

      const newHeader = {
        name: header.name,
        value: header.value || '',
        enabled: header.enabled !== false
      };

      // ModHeader format may not specify type, assume request by default
      // or you could add logic to detect response headers
      requestHeaders.push(newHeader);
    });

    // Create a new profile with imported data using default names
    this.profileCounter++;
    const key = 'profile_' + Date.now();
    this.profiles[key] = {
      name: `Imported Profile ${this.profileCounter}`,
      description: 'Imported from JSON - click to edit',
      requestHeaders: requestHeaders,
      responseHeaders: responseHeaders
    };

    // Switch to the new profile
    this.currentProfile = key;
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

    // Add response headers (if needed in the future)
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new HeaderEditorPopup();
});