export class UpdateNotificationsManager {
  constructor(popup) {
    this.popup = popup;
  }

  async checkForUpdateNotification() {
    try {
      const result = await chrome.storage.local.get(['updateNotification', 'welcomeNotification']);

      if (result.updateNotification && !result.updateNotification.shown) {
        // Delegate back to popup so vi.spyOn on the popup instance still works.
        this.popup.showUpdateTooltip(result.updateNotification);

        // Mark as shown
        chrome.storage.local.set({
          updateNotification: { ...result.updateNotification, shown: true },
        });

        // Clear the badge
        chrome.runtime.sendMessage({ action: 'clearUpdateBadge' });
      } else if (result.welcomeNotification && !result.welcomeNotification.shown) {
        // Delegate back to popup so vi.spyOn on the popup instance still works.
        this.popup.showWelcomeTooltip(result.welcomeNotification);

        // Mark as shown
        chrome.storage.local.set({
          welcomeNotification: { ...result.welcomeNotification, shown: true },
        });
      }
    } catch (_error) {
      // Silently handle errors
    }
  }

  showUpdateTooltip(updateInfo) {
    const tooltip = document.createElement('div');
    tooltip.className = 'update-notification update-notification-slide-in';
    tooltip.innerHTML = `
      <div class="update-header">
        <span class="update-icon">✨</span>
        <span class="update-title">Extension Updated!</span>
        <button class="update-close">×</button>
      </div>
      <div class="update-content">
        Updated from v${updateInfo.previousVersion} to v${updateInfo.currentVersion}
        <div class="update-subtitle">Check latest features and improvements</div>
      </div>
    `;

    document.body.appendChild(tooltip);

    // Setup close button
    const closeBtn = tooltip.querySelector('.update-close');
    closeBtn.addEventListener('click', () => {
      tooltip.classList.add('update-notification-slide-out');
      setTimeout(() => tooltip.remove(), 300);
    });

    // Auto-close after 6 seconds
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.classList.add('update-notification-slide-out');
        setTimeout(() => tooltip.remove(), 300);
      }
    }, 6000);
  }

  showWelcomeTooltip(welcomeInfo) {
    const tooltip = document.createElement('div');
    tooltip.className = 'update-notification welcome-notification update-notification-slide-in';
    tooltip.innerHTML = `
      <div class="update-header">
        <span class="update-icon">🎉</span>
        <span class="update-title">Welcome to Header Editor Pro!</span>
        <button class="update-close">×</button>
      </div>
      <div class="update-content">
        Thanks for installing v${welcomeInfo.version}
        <div class="update-subtitle">Create unlimited profiles and modify HTTP headers easily</div>
      </div>
    `;

    document.body.appendChild(tooltip);

    // Setup close button
    const closeBtn = tooltip.querySelector('.update-close');
    closeBtn.addEventListener('click', () => {
      tooltip.classList.add('update-notification-slide-out');
      setTimeout(() => tooltip.remove(), 300);
    });

    // Auto-close after 8 seconds for welcome message
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.classList.add('update-notification-slide-out');
        setTimeout(() => tooltip.remove(), 300);
      }
    }, 8000);
  }
}
