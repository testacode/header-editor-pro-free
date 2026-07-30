import { t } from './i18n.js';

export class UpdateNotificationsManager {
  constructor(popup) {
    this.popup = popup;
  }

  async checkForUpdateNotification() {
    try {
      const result = await chrome.storage.local.get(['welcomeNotification']);

      if (result.welcomeNotification && !result.welcomeNotification.shown) {
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

  showWelcomeTooltip(welcomeInfo) {
    this.showTooltip({
      className: 'update-notification welcome-notification update-notification-slide-in',
      icon: '🎉',
      title: t('welcomeTitle'),
      body: t('welcomeBody', welcomeInfo.version),
      subtitle: t('welcomeSubtitle'),
      autoCloseMs: 8000,
    });
  }
}
