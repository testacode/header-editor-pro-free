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
  the largest files (popup.js ~900 lines) are already decomposed into
  managers — extend the managers rather than growing popup.js.
- **Error Handling**: Always wrap async operations in try/catch blocks
- **CSS**: No frameworks (no Tailwind), vanilla CSS with class-based styling

## Architecture

- Entry points: `src/popup/popup.js` (UI) and `src/background/background.js` (service worker)
- Build system: Rspack with SWC loader, CSS extraction
- Cross-browser: Single manifest.json works for Chrome + Firefox
