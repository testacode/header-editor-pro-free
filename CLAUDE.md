# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ModHeader is a Chrome extension for modifying HTTP request and response headers during testing and development. This is a basic Chrome extension following the Hello World tutorial structure.

## Architecture

**Current Structure:**
- `manifest.json` - Chrome extension manifest (v3) with basic popup action
- `popup.html` - Simple popup interface with title and description
- `popup.js` - Basic JavaScript that logs popup loading
- `icon.png` - Extension icon from Chrome developer tutorial

**Extension Type:** Basic popup-only extension with no background service worker, content scripts, or permissions currently configured.

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

## Future Development Considerations

The extension is currently a basic Hello World implementation. To fulfill the "ModHeader" purpose of header modification, it will need:
- `declarativeNetRequest` permissions in manifest
- Background service worker for header manipulation
- More sophisticated popup UI for header configuration
- Storage permissions for saving header configurations