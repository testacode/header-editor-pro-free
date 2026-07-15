# Gotchas

Bugs difíciles, comportamientos no documentados y workarounds encontrados en este proyecto.

## Chrome 137+ define el global `browser` (detección de Firefox rota)

**Síntoma (v2.4.0-dev, 2026-07-15):** el filtro por tab group no aparecía en el popup en Chrome, a pesar de tener el permiso `tabGroups` y grupos abiertos. El background además corría los delays "de Firefox" en Chrome.

**Causa:** la detección de Firefox era `typeof browser !== 'undefined'`. Chrome 137+ expone `browser` como alias de `chrome` en contextos de extensión (alineación con el estándar WebExtensions), así que todo Chrome moderno se identificaba como Firefox.

**Fix:** detectar Firefox por una API que solo existe ahí:

```js
const isFirefox =
  (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') ||
  navigator.userAgent.includes('Firefox');
```

`browser.runtime.getBrowserInfo()` es Firefox-only; el alias de Chrome no lo tiene. Aplica en dos lugares: `src/background/background.js` (`detectFirefox`) y `src/popup/filters.js` (`supportsTabGroupFilter`).

**Ojo en tests:** `setup.js` define `global.browser = global.chrome` — con la detección nueva eso simula el Chrome moderno (alias sin `getBrowserInfo`), o sea `isFirefox === false` por default. Para simular Firefox en un test: `vi.stubGlobal('browser', { runtime: { getBrowserInfo: vi.fn() } })`.
