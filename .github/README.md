# GitHub Actions Workflows

This directory contains automated workflows for building and releasing the Header Editor Pro - Free extension for both Chrome and Firefox.

## 🔄 Available Workflows

### 1. `build.yml` - Development Builds

**Triggers:**
- Every push to `main` or `master` branch
- Every pull request to `main` or `master` branch

**What it does:**
- Creates a clean ZIP package with only extension files
- Uploads ZIP as a downloadable artifact
- Keeps artifacts for 30 days
- Perfect for testing development versions

**How to use:**
1. Push your changes to main branch
2. Go to **Actions** tab in GitHub repository
3. Click on the latest workflow run
4. Download the `header-editor-pro-free-extension` artifact
5. Extract and load in Chrome for testing

---

### 2. `release.yml` - Official Releases

**Triggers:**
- When you push a version tag (e.g., `v1.0.0`, `v1.1.0`)
- Manual trigger from GitHub Actions UI

**What it does:**
- Creates a professional GitHub release
- Generates versioned ZIP files: `header-editor-pro-free-extension-vX.X.X.zip`
- Creates source package: `header-editor-pro-free-source-vX.X.X.zip` (for Firefox AMO)
- Extracts version number from `manifest.json`
- Includes detailed release notes with installation instructions

**How to create a release:**

#### Option A: Automated Scripts (Recommended)
```bash
# Interactive release script (Mac/Linux)
./scripts/release.sh

# Cross-platform Node.js version  
node scripts/release.js
```

**Benefits:**
- ✅ Interactive version selection (patch/minor/major/custom)
- ✅ Automatic manifest.json updates
- ✅ Proper commit messages and tags
- ✅ Safety checks and validation
- ✅ No manual errors

#### Option B: Manual Command Line
```bash
# 1. Update version in manifest.json
# 2. Commit your changes
git add .
git commit -m "release: bump version to 1.1.0"

# 3. Create and push tag
git tag v1.1.0
git push origin main --tags
```

#### Option C: GitHub UI
1. Go to repository **Releases** page
2. Click **"Create a new release"**
3. Create a new tag (e.g., `v1.1.0`)
4. The workflow will run automatically

**📝 Note:** All methods trigger the same GitHub Actions workflow to build the ZIP and create the release.

## 📦 Generated Files

### Extension Package (`header-editor-pro-free-extension-vX.X.X.zip`)
✅ **Included:**
- `manifest.json` - Unified configuration for Chrome & Firefox
- `popup.html` - Main UI interface (processed by Rspack)
- `css/popup.css` - Minified dark theme styling  
- `js/popup.js` - Minified frontend logic
- `js/background.js` - Minified service worker
- `privacy.html` - Privacy policy page
- `icons/` - Extension icons (16px, 32px, 48px, 128px)

### Source Package (`header-editor-pro-free-source-vX.X.X.zip`)
✅ **Included for Firefox AMO reviewers:**
- `src/` - Original source code
- `package.json` & `package-lock.json` - Dependencies
- `rspack.config.js` - Build configuration  
- `BUILD_INSTRUCTIONS.md` - Step-by-step build guide
- `README.md` - Project documentation

❌ **Excluded from both:**
- `.github/` - Workflow files
- `.git/` - Git repository files  
- `dist/` - Build output folder
- `node_modules/` - Development dependencies

## 🚀 Using the ZIP for Extension Stores

### Chrome Web Store
1. **Download** `header-editor-pro-free-extension-vX.X.X.zip` from GitHub release
2. **Extract** to verify contents
3. **Upload** directly to Chrome Web Store Developer Dashboard
4. **Submit** for review

### Firefox Add-ons (AMO)
1. **Download** `header-editor-pro-free-extension-vX.X.X.zip` from GitHub release
2. **Download** `header-editor-pro-free-source-vX.X.X.zip` (required for review)
3. **Upload extension ZIP** to Firefox Add-ons Developer Hub
4. **Upload source ZIP** in the "Source code" field
5. **Submit** for review (free, no payment required)

## 🛠️ Workflow Customization

### Adding New Files to ZIP
Edit both workflow files and add your file to the copy commands:
```yaml
cp your-new-file.js extension-build/
```

### Changing Triggers
Modify the `on:` section in each workflow file:
```yaml
on:
  push:
    branches: [ main, develop ]  # Add more branches
```

### Auto-Publishing to Chrome Web Store
The `release.yml` has a placeholder for Chrome Web Store auto-publishing. To enable:
1. Get Chrome Web Store API credentials
2. Add them as GitHub Secrets
3. Change `if: false` to `if: true` in the upload step
4. Implement the upload script

## 📊 Workflow Status

You can check workflow status:
- **Actions tab** - See all workflow runs
- **Repository badges** - Add status badges to main README
- **Email notifications** - GitHub sends emails on failures

## 🔧 Troubleshooting

### Workflow Not Triggering
- Check branch names match (main vs master)
- Ensure tag format is correct (`v1.0.0` not `1.0.0`)
- Verify you have proper permissions

### ZIP Missing Files
- Check file paths in workflow
- Ensure files exist in repository
- Review workflow logs in Actions tab

### Release Creation Failed
- Check `GITHUB_TOKEN` permissions
- Verify tag doesn't already exist
- Review manifest.json syntax for version extraction

## 💡 Tips

1. **Test first** - Use development builds before creating releases
2. **Version consistency** - Ensure manifest.json version matches your git tag
3. **Clean releases** - Always test the ZIP package before submitting to Chrome Web Store
4. **Documentation** - Update main README.md with new features before releasing

---

**Need help?** Check the [GitHub Actions documentation](https://docs.github.com/en/actions) or open an issue in this repository.