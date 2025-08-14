# Release Scripts

This folder contains scripts to automate the release process for Header Editor Pro - Free.

## 🚀 Quick Release

### Option 1: Bash Script (Mac/Linux)
```bash
./scripts/release.sh
```

### Option 2: Node.js Script (Cross-platform)
```bash
node scripts/release.js
```

## ✨ What These Scripts Do

1. **Version Validation** - Checks current version and suggests next version
2. **Safety Checks** - Ensures clean git state and correct branch
3. **Version Bumping** - Updates `manifest.json` with new version
4. **Git Operations** - Creates commit and tag automatically
5. **GitHub Integration** - Pushes tag to trigger GitHub Actions
6. **User Guidance** - Provides next steps and useful links

## 📋 Interactive Features

### Version Selection
- **Patch** (1.0.0 → 1.0.1) - Bug fixes
- **Minor** (1.0.0 → 1.1.0) - New features  
- **Major** (1.0.0 → 2.0.0) - Breaking changes
- **Custom** - Enter any version manually

### Safety Features
- ✅ Checks for uncommitted changes
- ✅ Validates semantic versioning format
- ✅ Confirms before making changes
- ✅ Provides helpful error messages

### Smart Defaults
- ✅ Auto-generates commit messages
- ✅ Creates proper git tags with descriptions
- ✅ Includes release notes in commits and tags

## 🔧 Requirements

### Bash Script (`release.sh`)
- **Git** - For version control operations
- **Bash** - Available on Mac/Linux by default
- **sed/awk** - For text processing (included in most systems)

### Node.js Script (`release.js`)
- **Node.js** - Any recent version (12+)
- **Git** - For version control operations
- **No external dependencies** - Uses only Node.js built-ins

## 📱 Usage Examples

### Quick Patch Release
```bash
# Run script, choose option 1 (patch), press Enter for default notes
./scripts/release.sh
```

### Major Release with Notes
```bash
# Run script, choose option 3 (major), add custom release notes
node scripts/release.js
```

## 🎯 Integration with GitHub Actions

These scripts work perfectly with the automated workflows:

1. **Script runs locally** → Updates version, creates tag, pushes
2. **GitHub Actions detects tag** → Builds versioned ZIPs, creates release
3. **You download ZIP** → `header-editor-pro-free-extension-vX.X.X.zip` ready for stores

## 🐛 Troubleshooting

### "Command not found"
- **Bash script**: Make sure it's executable: `chmod +x scripts/release.sh`
- **Node script**: Make sure Node.js is installed: `node --version`

### "Not a git repository"
- Run the script from the project root directory
- Ensure the directory is a git repository: `git status`

### "Uncommitted changes"
- Commit or stash your changes before running the script
- Use `git status` to see what needs to be committed

### Version update failed
- Check that `manifest.json` exists and has proper format
- Verify you have write permissions in the directory

## 💡 Tips

1. **Test first** - Always test the ZIP package before releasing
2. **Branch management** - Run releases from `main` or `master` branch
3. **Backup** - Scripts create git commits, so your changes are safe
4. **Monitor** - Watch GitHub Actions after running the script
5. **Versioned files** - ZIP files automatically include version numbers for easy identification

## 🔗 Related

- **GitHub Actions** - `.github/workflows/` - Automated versioned ZIP building
- **Manual Process** - `.github/README.md` - Non-script alternatives  
- **Chrome Web Store** - Use `header-editor-pro-free-extension-vX.X.X.zip` for submissions
- **Firefox Add-ons** - Use both extension ZIP + source ZIP for AMO submission