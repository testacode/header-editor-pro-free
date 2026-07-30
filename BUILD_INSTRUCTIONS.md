# Build Instructions

## Requirements

- Node.js >= 22 (enforced via `engines` + `engine-strict`)
- npm (bundled with Node 22)

## Build steps

```bash
npm ci
npm run build
```

The production extension is generated in `dist/`. The bundler is Rspack
(`rspack.config.js`): it bundles `src/popup/popup.js` and
`src/background/background.js` into `dist/js/`, extracts CSS to `dist/css/`,
and copies `src/manifest.json`, the icons and `src/_locales/` (the translation
catalogs, one directory per locale). Output is minified but NOT obfuscated.

Note on translations: the popup imports the same `_locales/*/messages.json`
files that Chrome reads for the manifest's `__MSG_appDesc__`, so they are
bundled into `dist/js/popup.js` **and** copied verbatim to `dist/_locales/`.
That duplication is intentional — the extension has an in-popup language
selector, and `chrome.i18n` can only resolve the browser's own language.

## Loading the built extension

- Chrome: open `chrome://extensions`, enable Developer mode, "Load unpacked",
  select the `dist/` folder.
- Firefox: open `about:debugging#/runtime/this-firefox`, "Load Temporary
  Add-on", select `dist/manifest.json`.

## Packaging

```bash
npm run package
```

Generates `header-editor-pro-free-extension-v<version>.zip` (the store
artifact) and `header-editor-pro-free-source-v<version>.zip` (this source
package). The version comes from `src/manifest.json`.
