import { hexToHsl, hslToHex } from './color-utils.js';

export class ColorPickerManager {
  constructor(popup) {
    this.popup = popup;
  }

  // ── Convenience accessors ─────────────────────────────────────────────────

  get state() {
    return this.popup.colorPickerState;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  showColorPicker() {
    const popup = this.popup;
    const profile = popup.profiles[popup.currentProfile];

    // Set initial colors from current profile
    this.state.tempBackgroundColor = profile.backgroundColor || '#4caf50';
    this.state.tempTextColor = profile.textColor || '#ffffff';
    this.state.currentTab = 'background';

    // Update UI
    this.updateColorPickerUI();

    // Show modal
    document.getElementById('color-picker-overlay').style.display = 'flex';
  }

  closeColorPicker() {
    document.getElementById('color-picker-overlay').style.display = 'none';
  }

  // ── UI updates ────────────────────────────────────────────────────────────

  updateColorPickerUI() {
    const popup = this.popup;
    const profile = popup.profiles[popup.currentProfile];
    const previewCircle = document.getElementById('color-preview-circle');
    const previewText = document.getElementById('color-preview-text');

    // Update preview circle
    previewCircle.style.backgroundColor = this.state.tempBackgroundColor;
    previewText.style.color = this.state.tempTextColor;
    previewText.textContent = profile.name.charAt(0).toUpperCase();

    // Update tab states
    document
      .getElementById('background-tab')
      .classList.toggle('active', this.state.currentTab === 'background');
    document
      .getElementById('text-tab')
      .classList.toggle('active', this.state.currentTab === 'text');

    // Update color gradient background based on current tab
    const currentColor =
      this.state.currentTab === 'background'
        ? this.state.tempBackgroundColor
        : this.state.tempTextColor;

    this.updateGradientBackground(currentColor);
    this.setupColorPickerInteractions();
    this.updateColorSelector(currentColor, false); // No smooth transition on initial load
  }

  updateGradientBackground(color, preserveHue = false) {
    const hslColor = hexToHsl(color);

    // Only update hue if not preserving it (e.g., when saturation > 0.1)
    if (!preserveHue && hslColor.s > 0.1) {
      this.state.hue = hslColor.h;
    }

    const gradient = document.getElementById('color-gradient');
    const hueSlider = document.getElementById('hue-slider');

    // Update gradient background - combine both gradients properly
    gradient.style.background = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%), linear-gradient(to right, rgba(255,255,255,1) 0%, hsl(${this.state.hue}, 100%, 50%) 100%)`;

    // Update hue slider
    hueSlider.value = this.state.hue;
  }

  updateColorSelector(color, smooth = true) {
    const hslColor = hexToHsl(color);
    const selector = document.getElementById('color-selector');

    // Position the selector based on current color
    const saturation = hslColor.s;
    const lightness = hslColor.l;

    // Store in state for hue slider to use
    this.state.saturation = saturation;
    this.state.lightness = lightness;

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
    const popup = this.popup;
    const profile = popup.profiles[popup.currentProfile];
    const previewCircle = document.getElementById('color-preview-circle');
    const previewText = document.getElementById('color-preview-text');

    // Update preview circle
    previewCircle.style.backgroundColor = this.state.tempBackgroundColor;
    previewText.style.color = this.state.tempTextColor;
    previewText.textContent = profile.name.charAt(0).toUpperCase();
  }

  setupColorPickerInteractions() {
    // Only set up interactions once
    if (this.popup.colorPickerInteractionsSetup) {
      return;
    }
    this.popup.colorPickerInteractionsSetup = true;

    // Tab switching
    document.getElementById('background-tab').onclick = () => {
      this.state.currentTab = 'background';
      this.updateColorPickerUI();
    };

    document.getElementById('text-tab').onclick = () => {
      this.state.currentTab = 'text';
      this.updateColorPickerUI();
    };

    // Color gradient interaction
    const gradient = document.getElementById('color-gradient');
    const selector = document.getElementById('color-selector');

    let isDragging = false;

    const updateColorFromPosition = e => {
      const rect = gradient.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const saturation = Math.max(0, Math.min(1, x / rect.width));
      const lightness = Math.max(0, Math.min(1, 1 - y / rect.height));

      // Store saturation and lightness in state
      this.state.saturation = saturation;
      this.state.lightness = lightness;

      // Preserve the current hue when saturation is 0 (white/grey area)
      // Don't let hexToHsl change the hue when color becomes achromatic
      const color = hslToHex(this.state.hue, saturation, lightness);

      if (this.state.currentTab === 'background') {
        this.state.tempBackgroundColor = color;
      } else {
        this.state.tempTextColor = color;
      }

      // Update selector position (no smooth transition during drag)
      selector.classList.remove('smooth');
      selector.style.left = `${saturation * 100}%`;
      selector.style.top = `${(1 - lightness) * 100}%`;

      // Update UI but don't call updateColorPickerUI which might recalculate hue
      this.updateColorPreview();
    };

    // Mouse events for gradient
    gradient.onmousedown = e => {
      isDragging = true;
      updateColorFromPosition(e);
      e.preventDefault();
      e.stopPropagation();
    };

    // Global mouse events to handle dragging outside the gradient
    // assigned-by-property on purpose: single active handler
    document.onmousemove = e => {
      if (isDragging) {
        updateColorFromPosition(e);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // assigned-by-property on purpose: single active handler
    document.onmouseup = () => {
      if (isDragging) {
        isDragging = false;
        // Re-enable smooth transitions after dragging
        selector.classList.add('smooth');
      }
    };

    // Also keep the click handler for single clicks
    gradient.onclick = e => {
      if (!isDragging) {
        updateColorFromPosition(e);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Hue slider
    const hueSlider = document.getElementById('hue-slider');
    hueSlider.oninput = () => {
      this.state.hue = parseInt(hueSlider.value);

      // Use stored saturation and lightness values
      const saturation = this.state.saturation;
      const lightness = this.state.lightness;

      // Generate new color with updated hue
      const newColor = hslToHex(this.state.hue, saturation, lightness);

      // Update the appropriate color value
      if (this.state.currentTab === 'background') {
        this.state.tempBackgroundColor = newColor;
      } else {
        this.state.tempTextColor = newColor;
      }

      // Update the entire UI
      this.updateColorPickerUI();
    };

    // Preset colors
    document.querySelectorAll('.preset-color').forEach(preset => {
      preset.onclick = () => {
        const color = preset.getAttribute('data-color');

        // Update the appropriate temp color
        if (this.state.currentTab === 'background') {
          this.state.tempBackgroundColor = color;
        } else {
          this.state.tempTextColor = color;
        }

        // Update HSL values and selector position
        const hslColor = hexToHsl(color);
        this.state.hue = hslColor.h;
        this.state.saturation = hslColor.s;
        this.state.lightness = hslColor.l;

        this.updateColorPickerUI();
      };
    });
  }

  saveProfileColor() {
    const popup = this.popup;
    const profile = popup.profiles[popup.currentProfile];
    profile.backgroundColor = this.state.tempBackgroundColor;
    profile.textColor = this.state.tempTextColor;

    popup.saveData();
    popup.renderProfileCircles();
    this.closeColorPicker();
  }
}
