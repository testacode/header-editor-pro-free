# AGENTS.md

Essential guidance for agentic coding agents working in this Chrome/Firefox extension repository.

## Build Commands

- `npm run dev` - Development build with watch mode
- `npm run build` - Production build to `dist/`
- `npm run package` - Create extension ZIP packages
- `npm run clean` - Remove build artifacts
- `npm test` - Vitest unit tests (jsdom). Also: `npm run test:watch`, `npm run test:coverage`. Tests live in `src/**/__tests__/`.

## Code Style & Standards

- **Language**: Vanilla JavaScript (ES2020 target), no TypeScript
- **Classes**: Use ES6 classes with constructor initialization
- **Async/Await**: Prefer async/await over Promises, wrap in try/catch
- **Chrome APIs**: Use `chrome.*` APIs (auto-polyfilled for Firefox)
- **Storage**: Use `chrome.storage.local` for persistence
- **Naming**: camelCase for variables/methods, PascalCase for classes
- **Console logging**: `console.error`/`console.log` are allowed and used
  deliberately for on-device debugging (eslint `no-console` is off). Do NOT
  strip existing logging; it was added intentionally (see commits afc5604,
  c25f150).
- **File Size**: Prefer small, focused modules. There is no hard line limit;
  the largest files (popup.js ~1050 lines) are already decomposed into
  managers — extend the managers rather than growing popup.js.
- **User-facing text is NEVER hardcoded.** Every string the user reads comes
  from the catalogs. In JS use `t('key')` from `src/popup/i18n.js`; in HTML use
  `data-i18n="key"` (or `data-i18n-title` / `-placeholder` / `-value`). Errors
  that reach the UI are `throw new LocalizedError('errKey', ...)`, rendered via
  `describeError()`. A new key must be added to **all 7** files under
  `src/_locales/` — `src/__tests__/locales.test.js` fails otherwise. Full rules
  in `docs/i18n.md`.
- **Not translated**: the `'default'` profile key (storage key and sentinel),
  HTTP header names, Chrome tab-group colour enums, storage keys, and
  `console.*` messages.
- **Error Handling**: Always wrap async operations in try/catch blocks
- **CSS**: No frameworks (no Tailwind), vanilla CSS with class-based styling

## Architecture

- Entry points: `src/popup/popup.js` (UI) and `src/background/background.js` (service worker)
- Translations: `src/popup/i18n.js` + `src/_locales/<locale>/messages.json` (7 locales).
  Rspack copies `_locales` into `dist/`; without it Chrome rejects the extension
  outright, because the manifest declares `default_locale`.
- Build system: Rspack with SWC loader, CSS extraction
- Cross-browser: Single manifest.json works for Chrome + Firefox

## Releasing

`./scripts/release.sh` bumps the version in `src/manifest.json`, `package.json`
and the `getManifest` mock in `src/__tests__/setup.js`, then runs
`npm install --package-lock-only` so the lock follows. Those four must agree —
CI runs `npm ci`, which is strict about the lock.
