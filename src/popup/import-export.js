import { t, LocalizedError, describeError } from './i18n.js';
import { normalizeHeader, isHeaderEnabled, isAppendMode } from './header-normalize.js';

export class ImportExportManager {
  constructor(popup) {
    this.popup = popup;
    this.exportScopeListenersSetup = false;
  }

  // ── Modal UI ──────────────────────────────────────────────────────────────

  showImportModal() {
    this.popup.currentModalMode = 'import';
    document.getElementById('modal-title').textContent = t('menuImport');
    document.getElementById('json-textarea').value = '';
    document.getElementById('json-textarea').placeholder = t('modalJsonPlaceholder');
    document.getElementById('modal-action').textContent = t('modalImport');
    document.getElementById('modal-action').style.display = 'block';
    document.getElementById('modal-copy').style.display = 'none';
    document.getElementById('modal-download').style.display = 'none';
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

    document.getElementById('modal-title').textContent = t('menuExport');
    document.getElementById('json-textarea').placeholder = '';
    document.getElementById('modal-action').style.display = 'none';
    document.getElementById('modal-copy').style.display = 'block';
    document.getElementById('modal-download').style.display = 'block';

    // Show export options, hide import options
    document.querySelector('.option-group:first-child').style.display = 'block'; // Show export scope
    document.getElementById('import-options').style.display = 'none';

    // Generate initial export based on current selection
    this.updateExportData();

    // Add event listener for export scope changes (bind once)
    if (!this.exportScopeListenersSetup) {
      this.exportScopeListenersSetup = true;
      document.querySelectorAll('input[name="export-scope"]').forEach(radio => {
        radio.addEventListener('change', () => {
          this.updateExportData();
        });
      });
    }

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
          responseHeaders: profile.responseHeaders || [],
          filters: profile.filters,
          backgroundColor: profile.backgroundColor,
          textColor: profile.textColor,
        };
      });
    }

    const jsonString = JSON.stringify(exportData, null, 2);
    document.getElementById('json-textarea').value = jsonString;

    this.setValidationMessage(
      'success',
      exportScope === 'current'
        ? t('validReadyToCopyCurrent')
        : t('validReadyToCopyProfiles', Object.keys(popup.profiles).length)
    );
  }

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    this.popup.currentModalMode = null;
  }

  // The glyph belongs to the status, not the sentence: keeping it out of the
  // catalog is what stops a translator from turning ✓ into ✅ or dropping it.
  // A name with no ASCII left — any CJK or Cyrillic one — sanitizes to nothing
  // but underscores, so fall back rather than emit "______headers.json".
  filenameStem(profileName) {
    const stem = (profileName || '')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '');
    return stem || t('exportFilenameFallback');
  }

  setValidationMessage(kind, text) {
    const message = document.getElementById('validation-message');
    message.textContent = '';
    if (!text) {
      return;
    }
    const span = document.createElement('span');
    span.className = kind; // 'error' | 'success'
    span.textContent = `${kind === 'error' ? '✗' : '✓'} ${text}`;
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
        if (Array.isArray(parsed) && this.isModHeaderProfileExport(parsed)) {
          this.setValidationMessage('success', t('validJsonProfiles', parsed.length));
        } else if (Array.isArray(parsed)) {
          // Check if headers have required structure
          for (let i = 0; i < parsed.length; i++) {
            const header = parsed[i];
            if (!header.name || typeof header.name !== 'string') {
              throw new LocalizedError('errHeaderMissingName', i + 1);
            }
          }

          this.setValidationMessage('success', t('validJsonHeaders', parsed.length));
        } else if (parsed && typeof parsed === 'object' && parsed.profiles) {
          this.setValidationMessage(
            'success',
            t('validJsonProfiles', Object.keys(parsed.profiles).length)
          );
        } else {
          throw new LocalizedError('errInvalidJsonFormat');
        }
      } else {
        this.setValidationMessage('success', t('validJson'));
      }

      actionBtn.disabled = false;
    } catch (_error) {
      this.setValidationMessage('error', describeError(_error));
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
      this.setValidationMessage('error', t('validImportFailed', describeError(_error)));
    }
  }

  async replaceCurrentProfile(importData) {
    const popup = this.popup;
    if (this.isModHeaderProfileExport(importData)) {
      throw new LocalizedError('errModHeaderExport');
    }
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
        popup.profiles[popup.currentProfile].requestHeaders = this.sanitizeHeaders(
          profileData.requestHeaders
        );
        popup.profiles[popup.currentProfile].responseHeaders = this.sanitizeHeaders(
          profileData.responseHeaders
        );
        if (profileData.filters && typeof profileData.filters === 'object') {
          popup.profiles[popup.currentProfile].filters = profileData.filters;
        }
        if (profileData.backgroundColor) {
          popup.profiles[popup.currentProfile].backgroundColor = profileData.backgroundColor;
        }
        if (profileData.textColor) {
          popup.profiles[popup.currentProfile].textColor = profileData.textColor;
        }
      } else {
        throw new LocalizedError('errCannotReplaceMultiple');
      }
    } else {
      throw new LocalizedError('errInvalidImportFormat');
    }

    await popup.saveData();
    popup.renderUI();
  }

  extractHeadersFromArray(importData) {
    return importData
      .filter(header => header.name && typeof header.name === 'string')
      .map(normalizeHeader);
  }

  sanitizeHeaders(maybeHeaders) {
    return Array.isArray(maybeHeaders) ? this.extractHeadersFromArray(maybeHeaders) : [];
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────

  async copyToClipboard() {
    const textarea = document.getElementById('json-textarea');
    const copyBtn = document.getElementById('modal-copy');

    try {
      await navigator.clipboard.writeText(textarea.value);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = `✓ ${t('modalCopied')}`;
      copyBtn.style.background = '#4CAF50';

      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '#2196F3';
      }, 2000);
    } catch (_error) {
      // Fallback for older browsers
      textarea.select();
      document.execCommand('copy');
      copyBtn.textContent = `✓ ${t('modalCopied')}`;
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
      alert(t('errSelectJsonFile'));
      return;
    }

    try {
      const text = await this.readFileAsText(file);
      const importData = JSON.parse(text);
      await this.importProfile(importData);

      // Clear the file input
      event.target.value = '';
    } catch (_error) {
      alert(t('errImportingFile', describeError(_error)));
      event.target.value = '';
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new LocalizedError('errFailedToReadFile'));
      reader.readAsText(file);
    });
  }

  async importProfile(importData) {
    await this.importProfileFromData(importData);
    alert(t('importSuccess', this.popup.profiles[this.popup.currentProfile].name));
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
      if ((mhProfile.filters || []).length > 0) {
        skippedFeatures++;
      }
      popup.profiles[newKey] = {
        name: mhProfile.title || t('importedProfileName', popup.profileCounter),
        description: t('importedFromModHeader'),
        requestHeaders: this.extractHeadersFromArray(mhProfile.headers),
        responseHeaders: this.sanitizeHeaders(mhProfile.respHeaders),
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
        alert(t('importModHeaderUrlFilters', result.skippedFeatures));
      }
    } else if (Array.isArray(importData)) {
      // Plain headers array format
      await this.createProfileFromHeaders(importData);
    } else if (importData.profiles) {
      // Full export format - multiple profiles
      await this.importMultipleProfiles(importData);
    } else {
      throw new LocalizedError('errInvalidJsonFormat');
    }
  }

  async createProfileFromHeaders(headersArray) {
    const popup = this.popup;
    const headers = this.extractHeadersFromArray(headersArray);

    popup.profileCounter++;
    const key = `profile_${Date.now()}`;
    popup.profiles[key] = {
      name: t('importedProfileName', popup.profileCounter),
      description: t('importedFromJson'),
      requestHeaders: headers,
      responseHeaders: [],
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
        name: profileData.name || t('importedProfileName', popup.profileCounter),
        description: profileData.description || t('importedFromJson'),
        requestHeaders: this.sanitizeHeaders(profileData.requestHeaders),
        responseHeaders: this.sanitizeHeaders(profileData.responseHeaders),
        ...(profileData.filters && typeof profileData.filters === 'object'
          ? { filters: profileData.filters }
          : {}),
        ...(profileData.backgroundColor ? { backgroundColor: profileData.backgroundColor } : {}),
        ...(profileData.textColor ? { textColor: profileData.textColor } : {}),
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

  // Download whatever the export modal is currently showing (the textarea is the
  // source of truth, so a user-edited JSON is honored). Filename depends on scope.
  downloadExport() {
    const exportScope = document.querySelector('input[name="export-scope"]:checked').value;
    const jsonText = document.getElementById('json-textarea').value;

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      this.setValidationMessage('error', describeError(error));
      return;
    }

    const filename =
      exportScope === 'current'
        ? `${this.filenameStem(this.popup.profiles[this.popup.currentProfile]?.name)}_headers.json`
        : `header-editor-profiles-${new Date().toISOString().slice(0, 10)}.json`;

    this.downloadJSON(data, filename);
  }

  convertToModHeaderFormat(profile) {
    const headers = [];

    // Add request headers
    if (profile.requestHeaders) {
      profile.requestHeaders.forEach(header => {
        if (header.name && header.name.trim()) {
          headers.push({
            appendMode: isAppendMode(header),
            enabled: isHeaderEnabled(header),
            name: header.name,
            value: header.value || '',
          });
        }
      });
    }

    // Single-profile export uses the flat ModHeader header array (request-only by
    // shape). Response headers are preserved via the full "all profiles" export.

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
