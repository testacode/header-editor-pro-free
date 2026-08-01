# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Header Editor Pro - Free is a Chrome/Firefox extension for HTTP header modification during development. Cross-browser compatibility with unified manifest.

## Architecture

**Current Structure (Rspack bundled):**
- `src/manifest.json` - Unified manifest v3 (Chrome + Firefox compatibility)
- `src/_locales/<locale>/messages.json` - Translation catalogs (en, es, ja, ko, ru, zh_CN, zh_TW). `appName` and `appDesc` back the manifest's `__MSG_` references, so the store listing title and summary are localized too — both have per-locale character limits the tests enforce
- `src/popup/` - UI components (HTML, CSS, JS) 
- `src/background/` - Service worker for header modification
- `src/assets/icons/` - Extension icons (16-128px)
- `site/templates/` + `site/locales/` - Source of the GitHub Pages site (landing, privacy policy, 404), pre-rendered per language by `scripts/build-site.js`
- `index.html`, `privacy.html`, `404.html`, `es/ ja/ ko/ ru/ zh-CN/ zh-TW/`, `sitemap.xml` - **Generated output, committed** so Pages can serve it. Never hand-edit: run `npm run build:site`. Site locale codes use hyphens (`zh-CN`), unlike the extension's underscores (`zh_CN`) — see `docs/i18n.md`
- `dist/` - Build output (gitignored)

**Extension Features:**
- **Profile Management**: Unlimited profiles with numbered circle UI and active/inactive indicators
- **Header Modification**: Request and response header support with individual enable/disable checkboxes
- **Copy Header to Profile**: Per-row 📋 button (shown when >1 profile) opens a dropdown to append the header (full header: name, value, enabled state, append mode) to another profile's same section, with toast confirmation
- **Profile Filters**: Per-profile scoping by domains (cross-browser, requestDomains/initiatorDomains OR'd via two DNR rules) and by Chrome tab group (session rules with tabIds + tab tracking; ignored on Firefox). Tab-group-scoped profiles apply CONCURRENTLY with the selected profile (priority 2 vs 1 on conflicts); the toolbar badge shows the governing profile's initial+color per tab
- **Internationalization**: 7 languages with an in-popup selector (🌐 in the toolbar) that switches without reloading. Preference in `chrome.storage.local.uiLocale`; absent = follow the browser. Strings live in `src/_locales/`, never hardcoded — see `docs/i18n.md`
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
- Toolbar buttons, left to right: refresh, pause, pin, profile colour, language, menu
- Language button: 🌐 opens a menu of flag + native name, plus "Auto"
- Pause button: ⏸ (pause) / ▶ (resume) in toolbar
- Pin button: 📌 toggle to disable/enable auto-close on outside click
- Header checkboxes: Individual enable/disable per header
- Add buttons: + in toolbar and at bottom of each section

## Data Structure

**Storage Format:**
```javascript
// chrome.storage.local.headerEditorData
{
  profiles: {
    'profile_id': {
      name: 'Profile Name',
      description: '',            // '' means "none" — the placeholder is the hint
      requestHeaders: [{ name: 'header', value: 'value', enabled: true, appendMode: false }],
      responseHeaders: [],
      backgroundColor: '#4caf50',
      textColor: '#ffffff',
      filters: {
        domains: { enabled: false, list: ['example.com'] },
        tabGroup: { enabled: false, group: { id: 5, title: 'SANDBOX', color: 'purple' } }
      }
    }
  },
  currentProfile: 'profile_id',
  enabled: true,
  paused: false,
  pinned: false,
  profileCounter: 1
}

// Separate keys in chrome.storage.local
// uiLocale: 'zh_CN'  — chosen language; absent means follow the browser
// welcomeNotification: { version, shown }  — first-install tooltip
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

**Site Build (separate from the extension):**
- `npm run build:site` - Renders `site/templates/` × `site/locales/` into 21 pages (3 per language) plus `sitemap.xml`
- English lands at the repo root; every other language in its own directory
- Run it after touching any template or catalog, and commit the regenerated HTML

## Quality Assurance

**Testing:**
- Vitest framework with jsdom environment (modern Jest alternative)
- Custom Chrome API mocking for Manifest V3 compatibility
- 410 tests across 8 files: background service worker (declarativeNetRequest rule building, pause/resume), popup logic (profiles, headers CRUD, import/export, language selector), the i18n helpers, `src/__tests__/locales.test.js`, which cross-checks every translation key used in JS and HTML against all 7 extension catalogs, and `site/__tests__/site-locales.test.js`, which does the same for the site templates and catalogs. Run `npm test`; coverage via `npm run test:coverage`.
- Commands: `npm test`, `npm run test:watch`, `npm run test:ui`

**Code Quality:**
- ESLint configuration optimized for Chrome extension development
- Prettier integration for consistent code formatting
- Chrome extension globals configured (chrome, browser APIs)
- Custom rules for:
  - Unused variables with underscore prefix pattern
  - Allow console.log in development
  - Browser alert/confirm warnings (expected in extensions)
- Commands: `npm run lint`, `npm run lint:fix`, `npm run format`

**CI/CD:**
- GitHub Actions workflow (`.github/workflows/ci.yml`)
- Automated linting, testing, and building on push/PR
- Node.js 22 requirement with engine strict enforcement
- Build artifact generation and validation
- Code coverage reporting integration with Codecov

## Chrome Web Store Compliance

**Privacy Policy Setup:**
- Privacy policy hosted at root `privacy.html` for GitHub Pages accessibility, translated into all 7 languages (`<locale>/privacy.html`)
- URL for the stores: `https://testacode.github.io/header-editor-pro-free/privacy.html` — always the English one; the translations exist for users, not for review
- Generated from `site/templates/privacy.html`; edit there, never the output
- URL is set in each store's Developer Dashboard (Chrome Web Store / AMO), not in `manifest.json` — `privacy_policy` is not a recognized MV3 manifest key
- Required for Chrome Web Store approval process (via dashboard)