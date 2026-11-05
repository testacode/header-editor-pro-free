# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Header Editor Pro - Free is a Chrome/Firefox extension for HTTP header modification during development. Cross-browser compatibility with unified manifest.

## Architecture

**Current Structure (Rspack bundled):**
- `src/manifest.json` - Unified manifest v3 (Chrome + Firefox compatibility)
- `src/_locales/<locale>/messages.json` - Translation catalogs (en, es, ja, ko, ru, zh_CN, zh_TW). `appName` and `appDesc` back the manifest's `__MSG_` references, so the store listing title and summary are localized too — both have per-locale character limits the tests enforce
- `src/popup/` - UI components (HTML, CSS, JS) 
- `src/popup/requestly-import.js` - Pure parser of Requestly rule exports (flat array of rules + groups) into one redirect list per Requestly group (`groupName: null` = ungrouped); non-Redirect rules and unsupported sources are listed in `skipped`. Wired into the import flow by `import-export.js` (`importRequestly`)
- `src/background/` - Service worker for header modification. `rule-compiler.js` is the pure state → DNR rules translation (no `chrome.*`, rules without ids); `background.js` resolves tab groups, assigns ids, swaps the rules atomically and draws the badges
- `src/assets/icons/` - Extension icons (16-128px)
- `site/templates/` + `site/locales/` - Source of the GitHub Pages site (landing, privacy policy, 404), pre-rendered per language by `scripts/build-site.js`
- `index.html`, `privacy.html`, `404.html`, `es/ ja/ ko/ ru/ zh-CN/ zh-TW/`, `sitemap.xml` - **Generated output, committed** so Pages can serve it. Never hand-edit: run `npm run build:site`. Site locale codes use hyphens (`zh-CN`), unlike the extension's underscores (`zh_CN`) — see `docs/i18n.md`
- `dist/` - Build output (gitignored)

**Extension Features:**
- **Profile Management**: Unlimited profiles with numbered circle UI and active/inactive indicators
- **Header Modification**: Request and response header support with individual enable/disable checkboxes
- **Copy Header to Profile**: Per-row 📋 button (shown when >1 profile) opens a dropdown to append the header (full header: name, value, enabled state, append mode, note) to another profile's same section, with toast confirmation
- **Header Notes**: Per-row 📝 button expands an optional free-text note (`header.note`) below the row; button is highlighted and its tooltip shows the note when non-empty. Expanded state is UI-only (WeakSet of header objects). The textarea is a sibling of the draggable `.header-item`, not a child, so text editing works in Chrome. Notes never affect DNR rules
- **Redirects**: Per-profile regex redirects (`profile.redirects`), compiled to DNR `redirect` rules with `regexSubstitution`. Users write `$1`, the compiler emits `\1`. Subresources only (no `main_frame`/`sub_frame`). Optional per-redirect CORS opens `Access-Control-Allow-*: *` on the target host at the lowest priority (`PRIORITY.cors`), so explicit user headers always win. UI in `src/popup/redirects.js`; pattern validated with `declarativeNetRequest.isRegexSupported` when available
- **Managed Cookies**: Per-profile cookies (`profile.cookies`) appended to the `Cookie` request header of requests to their domain (DNR `append`, one rule per domain, narrowed by the profile's domain filter) — never written to the cookie jar, so pause/profile switch drop them. ⚠ when the site already has a same-name cookie (it goes first and usually wins), click deletes the site's. "This site's cookies" lists the active tab's real cookies (copy into profile / delete). UI in `src/popup/cookies.js` and `src/popup/site-cookies.js`; needs the `cookies` permission
- **Requestly Import**: Importing a Requestly rules export (file or pasted JSON, detected by `objectType: 'rule' | 'group'` before the plain-headers-array branch) creates one profile per Requestly group (ungrouped rules → a profile named "Requestly"), then an `alert` summary: redirects/profiles imported plus every rule left out by name with a translated reason (capped at 15 + "…and N more"). Nothing convertible → summary only, no profiles. "Replace current profile" rejects it (`errRequestlyReplace`)
- **Profile Filters**: Per-profile scoping by domains (cross-browser, requestDomains/initiatorDomains OR'd via two DNR rules) and by Chrome tab group (session rules with tabIds + tab tracking; ignored on Firefox). Tab-group-scoped profiles apply CONCURRENTLY with the selected profile (`PRIORITY.tabScoped` vs `PRIORITY.global` on conflicts); the toolbar badge shows the governing profile's initial+color per tab
- **Internationalization**: 7 languages with an in-popup selector (🌐 in the toolbar) that switches without reloading. Preference in `chrome.storage.local.uiLocale`; absent = follow the browser. Strings live in `src/_locales/`, never hardcoded — see `docs/i18n.md`
- **Professional UI**: Dark theme (default) or light, toggled from the ⋮ menu (`src/popup/theme.js`, `localStorage.uiTheme` so it applies before the first paint). Neutral greys are CSS variables at the top of `popup.css`, one per original grey so dark stays pixel-identical; accents stay hard-coded
- **Share Active Items**: ⋮ menu → copies the current profile with only its enabled headers, redirects and cookies, in the all-profiles export format (`activeItemsExport` in `import-export.js`)
- **Pause Functionality**: Global pause/resume without losing configurations
- **Pin Functionality**: Toggle button to disable/enable auto-close on outside click
- **Real-time Updates**: Instant header rule application through background service worker
- **Persistent Storage**: All configurations saved automatically using Chrome storage API

## Development Workflow

**Build System:**
- `npm run dev` - Development with watch mode
- `npm run build` - Production build to `dist/`
- `npm run package` - Generate versioned ZIPs
- `npm run playground` - Chrome for Testing with the extension loaded, a seeded profile and a local demo page (`-- --check` clicks through the demos and exits). See `docs/development.md`

**Playground = the end-to-end check:** every user-visible feature gets a section in `scripts/playground/page.html` (plus seed data in `run.mjs` and a step in `runChecks`), and `npm run playground -- --check` must pass before opening a PR. Unit tests mock `chrome.*`; this is the only check that runs the real DNR engine.

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
      requestHeaders: [{ name: 'header', value: 'value', enabled: true, appendMode: false, note: '' }], // note: '' = none
      responseHeaders: [],
      cookies: [{ id: 'cookie_…', domain: 'example.com', name: 'sid', value: 'abc', enabled: true }],
      redirects: [{ id: 'redirect_…', pattern: '^https://dev\\.example\\.com/(.*)', target: 'https://example.com/$1', enabled: true, cors: false }],
      backgroundColor: '#4caf50',
      textColor: '#ffffff',
      filters: {
        domains: { enabled: false, list: ['example.com'] },
        tabGroup: { enabled: false, group: { id: 5, title: 'SANDBOX', color: 'purple' } }
      }
    }
  },
  currentProfile: 'profile_id',
  paused: false,
  profileCounter: 1
}
// Up to 2.6.2 it also held `enabled` (folded into `paused`) and `pinned`
// (moved to its own key); migrateLegacyFlags() reads both from old storage.

// Separate keys in chrome.storage.local
// uiLocale: 'zh_CN'  — chosen language; absent means follow the browser
// popupPinned: true  — pin toggle; a UI preference, so writing it doesn't wake the background
// welcomeNotification: { version, shown }  — first-install tooltip
// (localStorage, not chrome.storage) uiTheme: 'light' — absent means dark
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
- Test files (run `npm test` for the current count): the rule compiler (`src/background/__tests__/rule-compiler.test.js`), the Requestly import parser (`src/popup/__tests__/requestly-import.test.js`) and its popup wiring (`requestly-import-ui.test.js`), background service worker (rule application, pause/resume, tab groups, badges), popup logic (profiles, headers CRUD, import/export, language selector), redirects (`src/popup/__tests__/redirects.test.js`), managed and site cookies (`src/popup/__tests__/cookies.test.js`), share and theme (`share-and-theme.test.js`), the i18n helpers, `src/__tests__/locales.test.js`, which cross-checks every translation key used in JS and HTML against all 7 extension catalogs, and `site/__tests__/site-locales.test.js`, which does the same for the site templates and catalogs. Run `npm test`; coverage via `npm run test:coverage`.
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