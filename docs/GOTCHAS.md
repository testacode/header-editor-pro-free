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

## `chrome.i18n.getMessage()` no permite elegir el idioma

**Síntoma (v2.6.0-dev, 2026-07-30):** se pidió un selector de idioma en el popup. `chrome.i18n` parecía la vía obvia, pero no hay forma de decirle "traducí a este otro idioma": siempre resuelve contra el idioma del navegador.

**Fix:** el popup importa `src/_locales/<locale>/messages.json` estáticamente y hace el lookup él mismo (`src/popup/i18n.js`). Los archivos mantienen el formato de Chrome, así que siguen siendo una sola fuente de verdad: Chrome los lee para el `__MSG_` del manifest y el popup los bundlea.

`chrome.i18n` queda solo para `getUILanguage()` (el default "Auto").

**Consecuencia aceptada:** la `description` que se ve en `chrome://extensions` y en la store sigue al navegador, no al selector. No hay API para cambiarlo.

**Beneficio lateral:** forzar un idioma en un test end-to-end es escribir `uiLocale` en storage. Con `chrome.i18n` puro habría que pelear con `--lang`, que **no funciona en macOS** — ahí Chrome toma el locale de `NSUserDefaults`, no de argv.

## `__MSG_x__` no funciona en HTML

Chrome sustituye `__MSG_` en `manifest.json` y en CSS, **nunca en HTML**: se renderiza literal y no hay warning.

Por eso `popup.html` usa `data-i18n="key"` (y `-title` / `-placeholder` / `-value`), sustituidos en runtime por `applyI18n()`. Corre como primera línea de `init()`, antes del primer `await`, para que el popup pinte ya traducido.

## Rspack no copia `src/_locales` solo — y sin eso Chrome rechaza todo

**Síntoma:** con `default_locale` en el manifest y sin `_locales` en `dist/`, Chrome no carga la extensión. No es que falten traducciones: **la rechaza entera**.

`CopyRspackPlugin` solo copia lo que se le lista, y tenía únicamente `manifest.json` y los iconos. Hay que agregar el pattern explícito:

```js
{ from: 'src/_locales', to: '_locales' },
```

## El `description` del manifest se valida por locale (132 chars)

**Síntoma:** el `appDesc` en ruso medía 145 caracteres. El límite de la Chrome Web Store para la description del manifest es 132.

Como el manifest dice `"description": "__MSG_appDesc__"`, la store resuelve **una description por idioma** y valida cada una — no alcanza con que el inglés entre. `src/__tests__/locales.test.js` ahora asserta el límite en los 7 catálogos.

Los idiomas CJK entran holgados (50-60 chars); los de alfabeto latino y el ruso son los que rozan el límite. Volvió a pasar en la 2.6.1 al reescribir el summary: español dio 139 y ruso 142 en el primer intento, y hubo que acortar los dos.

Desde la 2.6.1 el `name` también sale de un `__MSG_`, con **dos** techos distintos: Chrome corta en 75, AMO en 50 (y AMO trunca en silencio en vez de rechazar, que es peor — te enterás mirando el listing). Los tests assertan el más chico de los dos.

## Texto visible guardado como dato (el centinela de descripción)

**Síntoma:** `'Click to edit description'` se escribía en `chrome.storage.local` como la `description` del perfil, y después se comparaba **literalmente** en dos lugares para decidir qué mostrar. Al traducirlo, el guard dejaba de matchear para todos los usuarios existentes, cuyo storage tiene el texto en inglés.

**Fix:** el centinela pasó a ser `''` y el hint vive en el `placeholder` del input. El literal viejo quedó congelado como `LEGACY_PLACEHOLDER_DESCRIPTION` en `default-data.js` — nunca se traduce, nunca se edita — y `migrateProfileFormat` lo mapea a `''`.

**Regla general que salió de acá:** si un string se guarda en storage, no se traduce al leerlo. Se traduce **al escribirlo** y no se re-traduce nunca (nombres de perfil incluidos). Cambiar de idioma deja la lista de perfiles mezclada, y está bien: no hay forma de distinguir un nombre autogenerado de uno que el usuario tipeó igual.

## `npx web-ext lint` = el linter de AMO, sin abrir Firefox

Vale correrlo antes de publicar:

```bash
npx web-ext lint --source-dir=dist --output=json
```

Valida el manifest, los `_locales` y las APIs contra el `strict_min_version`. Al 2026-07-30 da **0 errores** y 67 warnings, todos preexistentes: `tabGroups.*` e `declarativeNetRequest.updateDynamicRules` no existen en Firefox 101 (nuestro mínimo declarado), `background.service_worker` se ignora en Firefox, y `MISSING_DATA_COLLECTION_PERMISSIONS`. Ninguno bloquea la review — la 2.5.x se publicó con todos ellos.

## GitHub Pages sirve un solo `404.html` (el de la raíz)

Al pre-renderizar el sitio por idioma (v2.6.0, 2026-08-01) se generó un
`404.html` por locale. **Pages ignora los de subcarpeta**: cualquier path
inexistente, a cualquier profundidad, recibe el de la raíz — o sea, el inglés.

La consecuencia que muerde no es el idioma sino las rutas: el 404 se renderiza
bajo la URL rota que lo disparó, así que `href="index.html"` o
`href="../src/assets/..."` resuelven contra un directorio que no existe. En esa
página **todo link y todo asset va con URL absoluta** (`{{__siteRoot}}`,
`{{__homeUrl}}` en el template); el resto de las páginas sí usa rutas relativas.

Los `<locale>/404.html` se generan igual, por si alguien los linkea directo.

## Banco de pruebas CDP: perfil nuevo por corrida

Los scripts de `plans/verify-*.py` lanzan Chrome for Testing con `--user-data-dir`. **Reusar el mismo directorio entre corridas hace que Chrome restaure los tabs de la corrida anterior**, y un chequeo del tipo "reabro el popup y leo el valor" termina leyendo un popup viejo — falso negativo silencioso.

Usar `tempfile.mkdtemp()` por corrida, e identificar el tab nuevo por diferencia contra los targets previos, no por "el último de la lista".
