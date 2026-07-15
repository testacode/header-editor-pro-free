import { defaultFilters } from './default-data.js';

// Chrome tab group colors → something a native <option> can show
const GROUP_COLOR_DOTS = {
  grey: '⚪',
  blue: '🔵',
  red: '🔴',
  yellow: '🟡',
  green: '🟢',
  pink: '🩷',
  purple: '🟣',
  cyan: '🟦',
  orange: '🟠',
};

export class FiltersManager {
  constructor(popup) {
    this.popup = popup;
  }

  currentFilters() {
    const profile = this.popup.profiles[this.popup.currentProfile];
    if (!profile.filters) {
      profile.filters = defaultFilters();
    }
    return profile.filters;
  }

  supportsTabGroupFilter() {
    // Firefox's declarativeNetRequest has no tabIds condition, so the tab group
    // filter cannot work there even where the tabGroups API exists. Detect
    // Firefox via getBrowserInfo (Firefox-only) — Chrome 137+ also defines the
    // `browser` global, so its presence alone is not a Firefox signal.
    const isFirefox =
      (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') ||
      navigator.userAgent.includes('Firefox');
    return !isFirefox && typeof chrome.tabGroups !== 'undefined';
  }

  setupEventListeners() {
    document.getElementById('domain-filter-enabled').addEventListener('change', e => {
      this.currentFilters().domains.enabled = e.target.checked;
      this.popup.saveData();
    });

    document.getElementById('domain-filter-input').addEventListener('blur', e => {
      this.currentFilters().domains.list = e.target.value
        .split(',')
        .map(domain => domain.trim())
        .filter(Boolean);
      this.popup.saveData();
    });

    document.getElementById('tab-group-filter-enabled').addEventListener('change', async e => {
      const filters = this.currentFilters();
      filters.tabGroup.enabled = e.target.checked;
      // "Use current group" ergonomics: enabling with nothing selected picks
      // the group of the tab the popup was opened on.
      if (e.target.checked && !filters.tabGroup.group) {
        await this.selectCurrentTabGroup();
      }
      await this.popup.saveData();
      this.render();
    });

    document.getElementById('tab-group-filter-select').addEventListener('change', e => {
      const filters = this.currentFilters();
      const option = e.target.selectedOptions[0];
      filters.tabGroup.group =
        option && option.value
          ? {
              id: Number(option.value),
              title: option.dataset.title || '',
              color: option.dataset.color || 'grey',
            }
          : null;
      this.popup.saveData();
    });
  }

  async selectCurrentTabGroup() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // groupId -1 = tab is not in a group (chrome.tabGroups.TAB_GROUP_ID_NONE)
      if (!activeTab || typeof activeTab.groupId !== 'number' || activeTab.groupId < 0) {
        return;
      }
      const group = await chrome.tabGroups.get(activeTab.groupId);
      this.currentFilters().tabGroup.group = {
        id: group.id,
        title: group.title || '',
        color: group.color,
      };
    } catch (error) {
      console.error('Failed to detect current tab group:', error);
    }
  }

  render() {
    const filters = this.currentFilters();

    document.getElementById('domain-filter-enabled').checked = filters.domains.enabled;
    document.getElementById('domain-filter-input').value = (filters.domains.list || []).join(', ');

    const groupItem = document.getElementById('tab-group-filter-item');
    if (!this.supportsTabGroupFilter()) {
      groupItem.style.display = 'none';
      return;
    }
    groupItem.style.display = '';
    document.getElementById('tab-group-filter-enabled').checked = filters.tabGroup.enabled;
    this.populateTabGroupSelect(filters.tabGroup.group);
  }

  async populateTabGroupSelect(selectedGroup) {
    const select = document.getElementById('tab-group-filter-select');
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a tab group…';
    select.appendChild(placeholder);

    let groups = [];
    try {
      groups = await chrome.tabGroups.query({});
    } catch (error) {
      console.error('Failed to list tab groups:', error);
    }

    const addOption = (group, suffix = '') => {
      const option = document.createElement('option');
      option.value = String(group.id);
      const dot = GROUP_COLOR_DOTS[group.color] || '●';
      option.textContent = `${dot} ${group.title || '(unnamed)'}${suffix}`;
      option.dataset.title = group.title || '';
      option.dataset.color = group.color;
      select.appendChild(option);
    };

    groups.forEach(group => addOption(group));

    // Keep the saved group visible/selected even when it is not open right now
    if (selectedGroup && !groups.some(group => group.id === selectedGroup.id)) {
      addOption(selectedGroup, ' (not open)');
    }
    if (selectedGroup) {
      select.value = String(selectedGroup.id);
    }
  }
}
