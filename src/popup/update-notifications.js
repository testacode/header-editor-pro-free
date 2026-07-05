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
    } catch (error) {
      console.error('Update notification check failed:', error);
    }
  }

  showTooltip({ className, icon, title, body, subtitle, autoCloseMs }) {
    const tooltip = document.createElement('div');
    tooltip.className = className;
    tooltip.innerHTML = `
      <div class="update-header">
        <span class="update-icon">${icon}</span>
        <span class="update-title">${title}</span>
        <button class="update-close">×</button>
      </div>
      <div class="update-content">
        ${body}
        <div class="update-subtitle">${subtitle}</div>
      </div>
    `;

    document.body.appendChild(tooltip);

    const slideOutAndRemove = () => {
      tooltip.classList.add('update-notification-slide-out');
      setTimeout(() => tooltip.remove(), 300);
    };

    // Setup close button
    tooltip.querySelector('.update-close').addEventListener('click', slideOutAndRemove);

    // Auto-close after the configured delay
    setTimeout(() => {
      if (tooltip.parentNode) {
        slideOutAndRemove();
      }
    }, autoCloseMs);
  }

  showUpdateTooltip(updateInfo) {
    this.showTooltip({
      className: 'update-notification update-notification-slide-in',
      icon: '✨',
      title: 'Extension Updated!',
      body: `Updated from v${updateInfo.previousVersion} to v${updateInfo.currentVersion}`,
      subtitle: 'Check latest features and improvements',
      autoCloseMs: 6000,
    });
  }

  showWelcomeTooltip(welcomeInfo) {
    this.showTooltip({
      className: 'update-notification welcome-notification update-notification-slide-in',
      icon: '🎉',
      title: 'Welcome to Header Editor Pro!',
      body: `Thanks for installing v${welcomeInfo.version}`,
      subtitle: 'Create unlimited profiles and modify HTTP headers easily',
      autoCloseMs: 8000,
    });
  }
}
