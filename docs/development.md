# Development

## Project structure

```
├── src/                  # Extension source (bundled by Rspack)
│   ├── manifest.json    # Unified config for Chrome & Firefox
│   ├── _locales/        # Extension translation catalogs (7 locales)
│   ├── popup/           # UI components (HTML, CSS, JS, i18n)
│   ├── background/      # Service worker logic
│   └── assets/icons/    # Extension icons (16px-128px)
├── site/                 # GitHub Pages source — edit here, never the output
│   ├── templates/       # Page templates with {{key}} placeholders
│   ├── locales/         # Site translation catalogs (7 locales)
│   └── __tests__/       # Key-coverage tests for the catalogs
├── docs/                 # Contributor docs
├── scripts/              # Release automation + site build
├── .github/workflows/    # GitHub Actions
├── dist/                 # Built extension (gitignored)
├── index.html            # Generated site: English at the root…
├── es/ ja/ ko/ ru/ …     # …and one directory per other language
├── sitemap.xml           # Generated alongside the pages
└── og-image.png          # Open Graph image for social sharing
```

## Local development

1. Clone the repository
2. `npm install`
3. `npm run dev` — watch mode
4. Edit files under `src/`
5. Go to `chrome://extensions` and click "Reload" on the extension card
6. Before pushing: `npm run code-quality` (lint + format check + tests — the same
   gate CI runs)

## Build

The extension uses **Rspack** for bundling:

- **Minification** without obfuscation, as store policies require
- **Cross-browser**: a single build works for Chrome and Firefox
- **Source maps** in development mode

The GitHub Pages site is a separate build: `npm run build:site`. See
[i18n.md](i18n.md#landing-page-github-pages) for how it works — in short, the
HTML at the repo root is generated output and must never be edited by hand.

## Releases

### Automated (recommended)

```bash
./scripts/release.sh
```

The script bumps the version in `src/manifest.json`, `package.json` and the
`getManifest` mock in `src/__tests__/setup.js`, syncs `package-lock.json`,
commits, tags, and pushes — which triggers the automated ZIP build.

### Manual

```bash
# Bump the version in all three places first — CI runs `npm ci`, which fails if
# package-lock.json disagrees:
#   src/manifest.json, package.json, src/__tests__/setup.js
npm install --package-lock-only
git add .
git commit -m "release: bump version to 1.1.0"
git tag v1.1.0
git push origin master --tags
```

Both paths trigger GitHub Actions to build the ZIP and create a GitHub release.

## Distribution

Each release publishes two files:

- `header-editor-pro-free-extension-vX.X.X.zip` — ready for Chrome and Firefox
- `header-editor-pro-free-source-vX.X.X.zip` — source package for Firefox reviewers

Store compliance rests on: minified but never obfuscated code, a single manifest
for both browsers, no tracking, and a fully open source tree for reviewers.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run code-quality` — CI enforces it
5. Open a pull request

Translations have their own workflow: see [i18n.md](i18n.md). Spotted a bad
translation? [Open an issue](https://github.com/testacode/header-editor-pro-free/issues/new?template=translation.yml).

## Testing

Vitest with jsdom, and a custom Chrome API mock for Manifest V3.

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

Coverage thresholds are enforced in `vitest.config.js`; a regression breaks CI.
Known gotchas live in [GOTCHAS.md](GOTCHAS.md).
