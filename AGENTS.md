# AGENTS.md

Essential guidance for agentic coding agents working in this Chrome/Firefox extension repository.

## Build Commands

- `npm run dev` - Development build with watch mode
- `npm run build` - Production build to `dist/`
- `npm run package` - Create extension ZIP packages
- `npm run clean` - Remove build artifacts
- No tests currently configured - extension uses manual testing via browser developer mode

## Code Style & Standards

- **Language**: Vanilla JavaScript (ES2020 target), no TypeScript
- **Classes**: Use ES6 classes with constructor initialization
- **Async/Await**: Prefer async/await over Promises, wrap in try/catch
- **Chrome APIs**: Use `chrome.*` APIs (auto-polyfilled for Firefox)
- **Storage**: Use `chrome.storage.local` for persistence
- **Naming**: camelCase for variables/methods, PascalCase for classes
- **No console.log**: Remove all console.log statements from production code
- **File Size**: Keep files under 200 lines, maintain separation of concerns
- **Error Handling**: Always wrap async operations in try/catch blocks
- **CSS**: No frameworks (no Tailwind), vanilla CSS with class-based styling

## Architecture

- Entry points: `src/popup/popup.js` (UI) and `src/background/background.js` (service worker)
- Build system: Rspack with SWC loader, CSS extraction
- Cross-browser: Single manifest.json works for Chrome + Firefox
