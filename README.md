# Header Editor Pro - Free

<div align="center">

🚀 **Professional HTTP Header Editor for Chrome** 🚀

*Completely free alternative to paid header modification tools*

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-brightgreen?logo=googlechrome&logoColor=white)]()
[![GitHub](https://img.shields.io/badge/GitHub-Open%20Source-blue?logo=github&logoColor=white)](https://github.com/testacode/header-editor-pro-free)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)]()

</div>

## ✨ Features

🔥 **100% FREE** - No subscriptions, no premium features, no limitations  
🎯 **Unlimited Profiles** - Create as many header configurations as you need  
⚡ **Real-time Header Modification** - Instant application via Chrome's declarativeNetRequest API  
🎨 **Professional Dark UI** - Clean, modern interface designed for developers  
☑️ **Individual Header Controls** - Enable/disable each header independently  
⏸️ **Pause Functionality** - Temporarily disable without losing configurations  
🔒 **Privacy Focused** - All data stored locally, no tracking or analytics  

## 🎯 Perfect For

- **Web Developers** - Testing API responses and CORS configurations
- **QA Testers** - Simulating different environments and conditions  
- **API Testing** - Adding authentication headers and custom parameters
- **Debugging** - Troubleshooting header-related issues
- **Development** - Local testing with modified headers

## 📸 Screenshots

*Extension popup showing profile management and header editing*

## 🚀 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](#) (link coming soon)
2. Click "Add to Chrome"
3. Click "Add Extension" in the popup

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the project folder
5. The extension icon will appear in your toolbar

## 💡 How to Use

### Basic Usage
1. **Click the extension icon** in Chrome toolbar
2. **Create profiles** using the numbered circles in the sidebar
3. **Add headers** by clicking the "+" button or "Add header" buttons
4. **Enable/disable** individual headers using checkboxes
5. **Switch profiles** by clicking different numbered circles

### Profile Management
- **Create new profile**: Click the "+" circle at bottom of sidebar
- **Switch profiles**: Click any numbered circle
- **Delete profile**: Right-click on a profile circle (except default)
- **Active indicator**: Green circle = active, red = inactive

### Header Controls
- **Add headers**: Use "Add header" buttons for request/response sections
- **Edit headers**: Type directly in name/value fields
- **Enable/disable**: Use checkboxes next to each header
- **Delete headers**: Click the "✕" button

### Toolbar Features
- **Pause/Resume**: ⏸️/▶️ button to temporarily disable all modifications
- **Profile name**: Shows current active profile
- **Quick add**: "+" button to add request headers

## 🔧 Technical Details

### Permissions Used
- **declarativeNetRequest**: Modify HTTP headers efficiently
- **storage**: Save configurations locally on your device  
- **activeTab**: Apply headers to current tab
- **host permissions**: Modify headers across all websites

### Data Privacy
✅ **No data collection** - Extension doesn't track or collect any personal data  
✅ **Local storage only** - All configurations stored on your device  
✅ **No external servers** - No data transmitted anywhere  
✅ **Open source** - Full transparency of all code  

## 🆚 Why Choose Header Editor Pro - Free?

| Feature | Header Editor Pro - Free | Other Extensions |
|---------|-------------------------|------------------|
| **Price** | 🟢 Completely Free | 🔴 $5-15/month subscriptions |
| **Profiles** | 🟢 Unlimited | 🔴 3 profiles max (free tier) |
| **UI Quality** | 🟢 Professional dark theme | 🔴 Basic/outdated interfaces |
| **Privacy** | 🟢 No tracking/analytics | 🔴 Often collect usage data |
| **Open Source** | 🟢 Full transparency | 🔴 Proprietary/closed source |

## 🛠️ Development

### Project Structure
```
├── manifest.json          # Extension configuration
├── popup.html             # Main UI interface  
├── popup.js              # Frontend logic and profile management
├── background.js         # Service worker for header modification
├── privacy.html          # Privacy policy page
└── icons/               # Extension icons (16px, 32px, 48px, 128px)
```

### Local Development
1. Clone the repository
2. Make changes to the code
3. Go to `chrome://extensions`
4. Click "Reload" on the extension card
5. Test your changes

### Contributing
Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/testacode/header-editor-pro-free/issues)
- **Privacy Policy**: [View Policy](https://testacode.github.io/header-editor-pro-free/privacy.html)
- **Documentation**: This README and inline code comments

## 💖 Support This Project

If you find Header Editor Pro - Free helpful, consider supporting its development:

[![Buy Me A Coffee](https://img.shields.io/badge/☕%20Buy%20Me%20A%20Coffee-Support-orange?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/charlybrown)
[![GitHub Sponsors](https://img.shields.io/badge/💝%20GitHub%20Sponsors-Support-pink?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/testacode)

Your support helps keep this extension **completely free** and actively maintained for the developer community!

## 🌟 Show Your Support

If you find this extension helpful:
- ⭐ Star this repository
- 🔄 Share with fellow developers
- 🐛 Report bugs and suggest features
- 📝 Contribute to the codebase
- ☕ Buy me a coffee to fuel development

---

<div align="center">

**Made with ❤️ for the developer community**

*Free alternative to expensive header modification tools*

</div>