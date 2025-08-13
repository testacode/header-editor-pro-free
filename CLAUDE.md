# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Header Editor Pro - Free is a professional Chrome extension for modifying HTTP request and response headers during testing and development. Features unlimited profiles, individual header controls, and a modern dark-themed interface. Completely free alternative to paid header modification tools.

## Architecture

**Current Structure:**
- `manifest.json` - Chrome extension manifest (v3) with declarativeNetRequest permissions
- `popup.html` - Clean HTML structure referencing external CSS and JS files (191 lines)
- `popup.css` - Professional dark theme styling with ModHeader-style interface (652 lines)
- `popup.js` - Complete header and profile management system with unlimited profiles (1041 lines)
- `background.js` - Service worker handling header modification via declarativeNetRequest API
- `icon.png` - Extension icon from Chrome developer tutorial

**Extension Features:**
- **Profile Management**: Unlimited profiles with numbered circle UI and active/inactive indicators
- **Header Modification**: Both request and response header support with individual enable/disable checkboxes
- **Professional UI**: Dark theme matching original ModHeader with left sidebar navigation
- **Pause Functionality**: Global pause/resume without losing configurations
- **Pin Functionality**: Toggle button to disable/enable auto-close on outside click
- **Real-time Updates**: Instant header rule application through background service worker
- **Persistent Storage**: All configurations saved automatically using Chrome storage API

## Development Workflow

**Testing Extension:**
1. Open `chrome://extensions`
2. Enable "Developer mode" 
3. Click "Load unpacked" and select project folder
4. After changes, click reload button on extension card

**Chrome Extension Development:**
- All changes to `manifest.json` require extension reload
- HTML/JS changes in popup require extension reload to see changes
- Use Chrome DevTools to debug popup (right-click extension icon > Inspect popup)

## User Interface

**Layout:**
- **Sidebar (60px)**: Profile circles with numbered indicators and active/inactive status
- **Main Content**: Top toolbar with profile name and action buttons, content area with header sections
- **Headers Display**: Condensed format with checkboxes, name/value inputs, delete and menu buttons

**Key UI Elements:**
- Profile circles: Click to switch, right-click to delete (except default)
- Pause button: ⏸ (pause) / ▶ (resume) in toolbar
- Pin button: 📌 toggle to disable/enable auto-close on outside click
- Header checkboxes: Individual enable/disable per header
- Add buttons: + in toolbar and at bottom of each section

## Data Structure

**Storage Format:**
```javascript
{
  profiles: {
    'profile_id': {
      name: 'Profile Name',
      requestHeaders: [{ name: 'header', value: 'value', enabled: true }],
      responseHeaders: [{ name: 'header', value: 'value', enabled: true }]
    }
  },
  currentProfile: 'profile_id',
  enabled: true,
  paused: false,
  pinned: false,
  profileCounter: 1
}
```

**Future Enhancements:**
- URL filtering for targeted header modification
- Import/Export functionality for sharing profiles
- Header templates and presets for common use cases
- Advanced context menus for profile and header management