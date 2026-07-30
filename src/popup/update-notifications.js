// One short line per release telling the user what's new and where to find it.
// Keyed by exact manifest version; versions without an entry fall back to the
// generic subtitle.
export const RELEASE_HIGHLIGHTS = {
  '2.4.0':
    'New: profile Filters — scope headers to domains or a Chrome tab group. See the Filters section below Response headers.',
  '2.4.1':
    'New: profile Filters — scope headers to domains or a Chrome tab group. See the Filters section below Response headers.',
  '2.5.0': 'New: copy a header to another profile from the copy button on each header row.',
  '2.5.1':
    'Fixes: backups now keep profile filters & colors, copied headers keep their append/enabled state, and invalid domain filters are flagged inline.',
  '2.5.2':
    'Fix: edits are now saved as you type — changing a header value and closing the popup no longer loses the change.',
  '2.5.3':
    'Domain filters are now saved as you type too, and the info tooltip shows the extension version.',
};

export class UpdateNotificationsManager {
  constructor(popup) {
    this.popup = popup;
  }

  async checkForUpdateNotification() {
    try {
      const result = await chrome.storage.local.get(['updateNotification', 'welcomeNotification']);

      if (result.updateNotification && !result.updateNotification.shown) {
        this.showUpdateTooltip(result.updateNotification);

        // Mark as shown
        chrome.storage.local.set({
          updateNotification: { ...result.updateNotification, shown: true },
        });

        // Clear the badge
        chrome.runtime.sendMessage({ action: 'clearUpdateBadge' });
      } else if (result.welcomeNotification && !result.welcomeNotification.shown) {
        this.showWelcomeTooltip(result.welcomeNotification);

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
    const highlight = RELEASE_HIGHLIGHTS[updateInfo.currentVersion];
    this.showTooltip({
      className: 'update-notification update-notification-slide-in',
      icon: '✨',
      title: 'Extension Updated!',
      body: `Updated from v${updateInfo.previousVersion} to v${updateInfo.currentVersion}`,
      subtitle: highlight || 'Check latest features and improvements',
      autoCloseMs: highlight ? 10000 : 6000,
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
