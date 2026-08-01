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

## Header controls

- **Add**: "Add header" buttons in the request and response sections
- **Edit**: type directly in the name/value fields
- **Enable/disable**: the checkbox next to each header
- **Delete**: the "✕" button
- **Reorder**: drag a header to a new position
- **Copy to another profile**: the per-row 📋 button (shown when you have more
  than one profile) appends the header — name, value, enabled state and append
  mode — to another profile's matching section

## Profile filters

Both filters live in the **Filters** section below Response headers, and are set
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
