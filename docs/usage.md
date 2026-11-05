# Usage

Everything the extension does, from the popup.

## Basic usage

1. **Click the extension icon** in the browser toolbar
2. **Create profiles** using the numbered circles in the sidebar
3. **Add headers** with the "+" button or the "Add header" buttons
4. **Enable/disable** individual headers using their checkboxes
5. **Switch profiles** by clicking a different numbered circle

## Profile management

- **Create**: click the "+" circle at the bottom of the sidebar
- **Switch**: click any numbered circle
- **Delete**: right-click a profile circle (the default profile can't be deleted)
- **Active indicator**: green circle = active, red = inactive
- **Import/Export**: the toolbar menu shares configurations as JSON. Importing a
  file holding a list of profiles creates one profile per entry,
  including its request and response headers — URL filters are not supported and
  are skipped.
- **Import from Requestly**: import a Requestly rules export (*Export rules* in
  Requestly) with the same Import option, in "Create new profile" mode. Each
  Requestly group becomes a profile with its Redirect rules; rules outside any
  group go to a profile named "Requestly". A summary then lists every rule left
  out and why: other rule types, rules using request filters (method, resource
  type, page), path or host-regex sources, local file/mock destinations, and
  rules missing a source or destination.

## Header controls

- **Add**: "Add header" buttons in the request and response sections
- **Edit**: type directly in the name/value fields
- **Enable/disable**: the checkbox next to each header
- **Delete**: the "✕" button
- **Reorder**: drag a header to a new position
- **Copy to another profile**: the per-row 📋 button (shown when you have more
  than one profile) appends the header — name, value, enabled state, append
  mode and note — to another profile's matching section
- **Note**: the per-row 📝 button opens a free-text note below the header, to
  remember what it is for; click again to close it. The button lights up when
  the header has a note, and hovering it shows the text. Notes are saved with
  the header (and travel with export, import and copy) but never affect requests

## Redirects

The **Redirects** section sends requests matching a pattern to another URL, per
profile — so they follow the profile's filters, tab group and pause like headers do.

- **Pattern** — a regular expression matched against the full request URL, e.g.
  `^https://dev\.example\.com/api/(.*)`. Chrome validates it as you type; an
  invalid pattern is underlined in red with the reason in its tooltip.
- **Target** — the destination URL. `$1`, `$2`… insert the pattern's capture
  groups: `https://www.example.com/api/$1`.
- **CORS** — when a page fetches from one origin and the redirect lands on
  another, the browser blocks the response unless the target allows it. This
  toggle adds `Access-Control-Allow-*: *` to responses from the target host.
  `*` is rejected by browsers for credentialed requests (cookies), so it won't
  help there.
- Only subresources (fetch/XHR, scripts, styles, images…) are redirected, never
  the page you navigate to.

## Profile filters

Both filters live in the **Filters** section below Redirects, and are set
per profile.

- **Domains** — limit a profile to specific domains (comma-separated). Headers
  apply to requests going to those domains, or initiated from pages on them.
  Works on Chrome and Firefox.
- **Tab group** (Chrome only) — limit a profile to a tab group. Enabling it while
  the current tab is inside a group picks that group automatically; tabs added to
  the group later inherit the headers. Keeps sandbox headers away from
  production tabs.
- **Concurrent scoped profiles** — every profile with a tab group filter stays
  active inside its group even while another profile is selected, so different
  tab groups can carry different headers at the same time. On conflicts, the
  scoped profile wins over the selected one.
- **Profile badge** — the toolbar icon shows the initial and colour of the
  profile governing the current tab, so you always know what's applied where.

## Toolbar

Left to right:

| Button | What it does |
|---|---|
| 🔄 Refresh | Reload the profile from storage |
| ⏸️ / ▶️ Pause | Temporarily disable every modification, keeping configurations |
| 📌 Pin | Keep the popup open when you click elsewhere |
| 🎨 Colour | Pick the colour of the profile circle and its badge |
| 🌐 Language | Switch the interface language, or follow the browser ("Auto") |
| ⋮ Menu | Import, export, delete profile |

The profile name is editable inline, and "+" quickly adds a request or response
header.

## Permissions

- **declarativeNetRequest** — modify HTTP headers efficiently
- **storage** — save configurations locally on your device
- **tabGroups** — list your tab groups for the tab group filter (Chrome)
- **host permissions** — modify headers across all websites

Rules are applied by the browser itself through declarativeNetRequest: the
extension never reads page content and never sees the requests it modifies. See
the [privacy policy](https://testacode.github.io/header-editor-pro-free/privacy.html).
