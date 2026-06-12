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
and copies `src/manifest.json` and the icons. Output is minified but NOT
obfuscated.

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
