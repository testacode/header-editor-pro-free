# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Header Editor Pro - Free is a Chrome/Firefox extension for HTTP header modification during development. Cross-browser compatibility with unified manifest.

## Architecture

**Current Structure (Rspack bundled):**
- `src/manifest.json` - Unified manifest v3 (Chrome + Firefox compatibility)
- `src/popup/` - UI components (HTML, CSS, JS) 
- `src/background/` - Service worker for header modification
- `src/assets/icons/` - Extension icons (16-128px)
- `privacy.html` - Privacy policy hosted via GitHub Pages for Chrome Web Store compliance
- `dist/` - Build output (gitignored)

**Extension Features:**
- **Profile Management**: Unlimited profiles with numbered circle UI and active/inactive indicators
- **Header Modification**: Both request and response header support with individual enable/disable checkboxes
- **Professional UI**: Dark theme matching original ModHeader with left sidebar navigation
- **Pause Functionality**: Global pause/resume without losing configurations
- **Pin Functionality**: Toggle button to disable/enable auto-close on outside click
- **Real-time Updates**: Instant header rule application through background service worker
- **Persistent Storage**: All configurations saved automatically using Chrome storage API

## Development Workflow

**Build System:**
- `npm run dev` - Development with watch mode
- `npm run build` - Production build to `dist/`
- `npm run package` - Generate versioned ZIPs

**Testing Extension:**
1. `npm run build` to generate `dist/`
2. Load `dist/` folder in `chrome://extensions` (developer mode)
3. For changes: rebuild and reload extension

**Cross-browser:**
- Single `src/manifest.json` works for Chrome + Firefox
- Chrome ignores `browser_specific_settings`, Firefox ignores unknown fields

## User Interface

**Layout:**
- **Sidebar (60px)**: Profile circles with numbered indicators and active/inactive status
- **Main Content**: Top toolbar with profile name and action buttons, content area with header sections
- **Headers Display**: Condensed format with checkboxes, name/value inputs, delete and menu buttons

**Key UI Elements:**
- Profile circles: Click to switch, right-click to delete (except default)
- Pause button: ⏸ (pause) / ▶ (resume) in toolbar
- Pin button: 📌 toggle to disable/enable auto-close on outside click
- Header checkboxes: Individual enable/disable per header
- Add buttons: + in toolbar and at bottom of each section

## Data Structure

**Storage Format:**
```javascript
{
  profiles: {
    'profile_id': {
      name: 'Profile Name',
      requestHeaders: [{ name: 'header', value: 'value', enabled: true }],
      responseHeaders: [{ name: 'header', value: 'value', enabled: true }]
    }
  },
  currentProfile: 'profile_id',
  enabled: true,
  paused: false,
  pinned: false,
  profileCounter: 1
}
```

## Build & Release

**Rspack Configuration:**
- `rspack.config.js` - Production bundling with minification (no obfuscation)
- Store-compliant: minified only, no code obfuscation
- CSS extraction and JS bundling for performance

**Release Process:**
- `./scripts/release.sh` - Automated version bump, git tag, GitHub Actions trigger
- GitHub Actions generates: `header-editor-pro-free-extension-vX.X.X.zip` + source package
- Unified ZIP works for both Chrome Web Store and Firefox Add-ons

## Chrome Web Store Compliance

**Privacy Policy Setup:**
- Privacy policy hosted at root `privacy.html` for GitHub Pages accessibility
- URL: `https://testacode.github.io/header-editor-pro-free/privacy.html`
- Referenced in `manifest.json` via `privacy_policy` field
- Required for Chrome Web Store approval process