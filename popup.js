class ModHeaderPopup {
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
      const result = await chrome.storage.local.get(['modHeaderData']);
      const data = result.modHeaderData || {
        profiles: {
          default: {
            name: 'Default',
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
    } catch (error) {
      this.profiles = {
        default: {
          name: 'Default',
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

  async saveData() {
    const data = {
      profiles: this.profiles,
      currentProfile: this.currentProfile,
      enabled: this.isEnabled,
      paused: this.isPaused,
      profileCounter: this.profileCounter
    };
    await chrome.storage.local.set({ modHeaderData: data });
    
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
      circleDiv.textContent = index + 1;
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
    
    div.appendChild(checkbox);
    div.appendChild(nameInput);
    div.appendChild(valueInput);
    div.appendChild(actions);
    
    return div;
  }

  updateToolbar() {
    // Update profile name
    const profileName = document.getElementById('profile-name');
    profileName.textContent = this.profiles[this.currentProfile]?.name || 'Default';
    
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
    const name = prompt('Enter profile name:');
    if (name && name.trim()) {
      this.profileCounter++;
      const key = 'profile_' + Date.now();
      this.profiles[key] = {
        name: name.trim(),
        requestHeaders: [],
        responseHeaders: []
      };
      this.currentProfile = key;
      this.saveData();
      this.renderUI();
    }
  }

  async deleteCurrentProfile() {
    if (this.currentProfile === 'default') {
      alert('Cannot delete the default profile');
      return;
    }
    
    if (confirm('Are you sure you want to delete this profile?')) {
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ModHeaderPopup();
});