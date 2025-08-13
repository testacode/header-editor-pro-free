class ModHeaderPopup {
  constructor() {
    this.currentProfile = 'default';
    this.profiles = {};
    this.isEnabled = false;
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
            name: 'Default Profile',
            requestHeaders: [],
            responseHeaders: []
          }
        },
        currentProfile: 'default',
        enabled: false
      };
      
      this.profiles = data.profiles;
      this.currentProfile = data.currentProfile;
      this.isEnabled = data.enabled;
    } catch (error) {
      this.profiles = {
        default: {
          name: 'Default Profile',
          requestHeaders: [],
          responseHeaders: []
        }
      };
      this.currentProfile = 'default';
      this.isEnabled = false;
    }
  }

  async saveData() {
    const data = {
      profiles: this.profiles,
      currentProfile: this.currentProfile,
      enabled: this.isEnabled
    };
    await chrome.storage.local.set({ modHeaderData: data });
    
    // Notify background script of changes
    await chrome.runtime.sendMessage({
      action: 'updateHeaders',
      data: data
    });
  }

  setupEventListeners() {
    // Enable/Disable toggle
    const enabledToggle = document.getElementById('enabled-toggle');
    enabledToggle.addEventListener('change', async (e) => {
      this.isEnabled = e.target.checked;
      await this.saveData();
      this.updateStatus();
    });

    // Profile management
    const profileSelect = document.getElementById('profile-select');
    profileSelect.addEventListener('change', async (e) => {
      this.currentProfile = e.target.value;
      await this.saveData();
      this.renderHeaders();
    });

    document.getElementById('add-profile-btn').addEventListener('click', () => {
      this.createNewProfile();
    });

    document.getElementById('delete-profile-btn').addEventListener('click', () => {
      this.deleteCurrentProfile();
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
    this.renderProfileSelect();
    this.renderHeaders();
    this.updateStatus();
  }

  renderProfileSelect() {
    const select = document.getElementById('profile-select');
    select.innerHTML = '';
    
    Object.entries(this.profiles).forEach(([key, profile]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = profile.name;
      option.selected = key === this.currentProfile;
      select.appendChild(option);
    });
  }

  renderHeaders() {
    this.renderHeadersList('request');
    this.renderHeadersList('response');
  }

  renderHeadersList(type) {
    const listId = `${type}-headers-list`;
    const list = document.getElementById(listId);
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    
    list.innerHTML = '';
    
    headers.forEach((header, index) => {
      const headerDiv = this.createHeaderElement(type, header, index);
      list.appendChild(headerDiv);
    });
  }

  createHeaderElement(type, header, index) {
    const div = document.createElement('div');
    div.className = 'header-item';
    
    div.innerHTML = `
      <input type="text" placeholder="Header name" value="${header.name || ''}" 
             onchange="popup.updateHeader('${type}', ${index}, 'name', this.value)">
      <input type="text" placeholder="Header value" value="${header.value || ''}" 
             onchange="popup.updateHeader('${type}', ${index}, 'value', this.value)">
      <button class="danger" onclick="popup.removeHeader('${type}', ${index})">Remove</button>
    `;
    
    return div;
  }

  updateStatus() {
    const toggle = document.getElementById('enabled-toggle');
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');
    
    toggle.checked = this.isEnabled;
    statusText.textContent = this.isEnabled ? 'On' : 'Off';
    
    if (this.isEnabled) {
      statusIndicator.textContent = 'Extension is active - Headers are being modified';
      statusIndicator.className = 'status active';
    } else {
      statusIndicator.textContent = 'Extension is disabled';
      statusIndicator.className = 'status inactive';
    }
  }

  addHeader(type) {
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    headers.push({ name: '', value: '' });
    this.saveData();
    this.renderHeadersList(type);
  }

  async updateHeader(type, index, field, value) {
    const headers = this.profiles[this.currentProfile][`${type}Headers`];
    if (headers[index]) {
      headers[index][field] = value;
      await this.saveData();
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
}

// Global instance for HTML event handlers
let popup;

document.addEventListener('DOMContentLoaded', () => {
  popup = new ModHeaderPopup();
});