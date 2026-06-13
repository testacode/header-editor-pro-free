import { normalizeHeader } from './header-normalize.js';

export class ImportExportManager {
  constructor(popup) {
    this.popup = popup;
  }

  // ── Modal UI ──────────────────────────────────────────────────────────────

  showImportModal() {
    this.popup.currentModalMode = 'import';
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
    this.popup.currentModalMode = 'export';

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
    const popup = this.popup;
    const exportScope = document.querySelector('input[name="export-scope"]:checked').value;
    let exportData;

    if (exportScope === 'current') {
      const currentProfile = popup.profiles[popup.currentProfile];
      exportData = this.convertToModHeaderFormat(currentProfile);
    } else {
      // Export all profiles in a more comprehensive format
      exportData = {
        profiles: {},
        currentProfile: popup.currentProfile,
        exportedAt: new Date().toISOString(),
      };

      Object.entries(popup.profiles).forEach(([key, profile]) => {
        exportData.profiles[key] = {
          name: profile.name,
          description: profile.description,
          requestHeaders: profile.requestHeaders || [],
        };
      });
    }

    const jsonString = JSON.stringify(exportData, null, 2);
    document.getElementById('json-textarea').value = jsonString;

    const _headerCount =
      exportScope === 'current'
        ? exportData.length
        : Object.values(popup.profiles).reduce(
            (count, profile) => count + (profile.requestHeaders?.length || 0),
            0
          );

    this.setValidationMessage(
      'success',
      `✓ Ready to copy (${exportScope === 'current' ? 'current profile' : `${Object.keys(popup.profiles).length} profiles`})`
    );
  }

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    this.popup.currentModalMode = null;
  }

  setValidationMessage(kind, text) {
    const message = document.getElementById('validation-message');
    message.textContent = '';
    if (!text) {
      return;
    }
    const span = document.createElement('span');
    span.className = kind; // 'error' | 'success'
    span.textContent = text;
    message.appendChild(span);
  }

  validateJSON() {
    const popup = this.popup;
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
      if (popup.currentModalMode === 'import') {
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

        this.setValidationMessage('success', `✓ Valid JSON (${parsed.length} headers)`);
      } else {
        this.setValidationMessage('success', '✓ Valid JSON');
      }

      actionBtn.disabled = false;
    } catch (_error) {
      this.setValidationMessage('error', `✗ ${_error.message}`);
      actionBtn.disabled = true;
    }
  }

  async handleModalAction() {
    if (this.popup.currentModalMode === 'import') {
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
    } catch (_error) {
      this.setValidationMessage('error', `✗ Import failed: ${_error.message}`);
    }
  }

  async replaceCurrentProfile(importData) {
    const popup = this.popup;
    // Handle different import formats
    if (Array.isArray(importData)) {
      // ModHeader format - array of headers
      const headers = this.extractHeadersFromArray(importData);
      popup.profiles[popup.currentProfile].requestHeaders = headers;
    } else if (importData.profiles) {
      // Full export format - multiple profiles
      if (Object.keys(importData.profiles).length === 1) {
        // Import single profile from multi-profile export
        const profileKey = Object.keys(importData.profiles)[0];
        const profileData = importData.profiles[profileKey];
        popup.profiles[popup.currentProfile].requestHeaders = profileData.requestHeaders || [];
      } else {
        throw new Error(
          'Cannot replace current profile with multiple profiles. Use "Create new profile" mode instead.'
        );
      }
    } else {
      throw new Error('Invalid import format');
    }

    await popup.saveData();
    popup.renderUI();
  }

  extractHeadersFromArray(importData) {
    return importData
      .filter(header => header.name && typeof header.name === 'string')
      .map(normalizeHeader);
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────

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
    } catch (_error) {
      // Fallback for older browsers
      textarea.select();
      document.execCommand('copy');
      copyBtn.textContent = '✓ Copied!';
    }
  }

  // ── File import ───────────────────────────────────────────────────────────

  showImportDialog() {
    const fileInput = document.getElementById('import-file-input');
    fileInput.click();
  }

  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

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
    } catch (_error) {
      alert(`Error importing file: ${_error.message}`);
      event.target.value = '';
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async importProfile(importData) {
    await this.importProfileFromData(importData);
    alert(
      `Successfully imported to profile "${this.popup.profiles[this.popup.currentProfile].name}"`
    );
  }

  // ── Import logic ──────────────────────────────────────────────────────────

  isModHeaderProfileExport(data) {
    return (
      Array.isArray(data) &&
      data.length > 0 &&
      data.every(item => item && typeof item === 'object' && Array.isArray(item.headers))
    );
  }

  async importModHeaderProfiles(modHeaderData) {
    const popup = this.popup;
    let firstImportedKey = null;
    let skippedFeatures = 0;
    modHeaderData.forEach((mhProfile, index) => {
      popup.profileCounter++;
      const newKey = `profile_${Date.now()}_mh_${index}`;
      if (firstImportedKey === null) {
        firstImportedKey = newKey;
      }
      if ((mhProfile.respHeaders || []).length > 0 || (mhProfile.filters || []).length > 0) {
        skippedFeatures++;
      }
      popup.profiles[newKey] = {
        name: mhProfile.title || `Imported Profile ${popup.profileCounter}`,
        description: 'Imported from ModHeader - click to edit',
        requestHeaders: this.extractHeadersFromArray(mhProfile.headers),
      };
    });
    if (firstImportedKey) {
      popup.currentProfile = firstImportedKey;
    }
    await popup.saveData();
    popup.renderUI();
    return { imported: modHeaderData.length, skippedFeatures };
  }

  async importProfileFromData(importData) {
    if (this.isModHeaderProfileExport(importData)) {
      // ModHeader profile export format: array of profile objects with headers[]
      const result = await this.importModHeaderProfiles(importData);
      if (result.skippedFeatures > 0) {
        alert(
          `Note: ${result.skippedFeatures} profile(s) contained response headers or URL filters, which are not supported and were not imported.`
        );
      }
    } else if (Array.isArray(importData)) {
      // Plain headers array format
      await this.createProfileFromHeaders(importData);
    } else if (importData.profiles) {
      // Full export format - multiple profiles
      await this.importMultipleProfiles(importData);
    } else {
      throw new Error('Invalid JSON format. Expected array of headers or profiles object.');
    }
  }

  async createProfileFromHeaders(headersArray) {
    const popup = this.popup;
    const headers = this.extractHeadersFromArray(headersArray);

    popup.profileCounter++;
    const key = `profile_${Date.now()}`;
    popup.profiles[key] = {
      name: `Imported Profile ${popup.profileCounter}`,
      description: 'Imported from JSON - click to edit',
      requestHeaders: headers,
    };

    popup.currentProfile = key;
    await popup.saveData();
    popup.renderUI();
  }

  async importMultipleProfiles(exportData) {
    const popup = this.popup;
    let importedCount = 0;
    let firstImportedKey = null;

    for (const [_originalKey, profileData] of Object.entries(exportData.profiles)) {
      popup.profileCounter++;
      const newKey = `profile_${Date.now()}_${importedCount}`;

      if (firstImportedKey === null) {
        firstImportedKey = newKey;
      }

      popup.profiles[newKey] = {
        name: profileData.name || `Imported Profile ${popup.profileCounter}`,
        description: profileData.description || 'Imported from JSON - click to edit',
        requestHeaders: profileData.requestHeaders || [],
      };

      importedCount++;
    }

    if (firstImportedKey) {
      popup.currentProfile = firstImportedKey;
    }

    await popup.saveData();
    popup.renderUI();
  }

  // ── Export logic ──────────────────────────────────────────────────────────

  exportCurrentProfile() {
    const popup = this.popup;
    const currentProfile = popup.profiles[popup.currentProfile];
    if (!currentProfile) {
      alert('No profile selected to export');
      return;
    }

    // Convert to ModHeader format
    const exportData = this.convertToModHeaderFormat(currentProfile);

    // Create and download the file
    this.downloadJSON(
      exportData,
      `${currentProfile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_headers.json`
    );
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
            value: header.value || '',
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
}
