#!/usr/bin/env node

/**
 * Header Editor Pro - Free Release Script (Node.js version)
 * Cross-platform version bumping, tagging, and GitHub release creation
 */

const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function print(type, message) {
    const color = colors[type] || colors.reset;
    console.log(`${color}[${type.toUpperCase()}]${colors.reset} ${message}`);
}

function execCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (error) {
        throw new Error(`Command failed: ${command}\n${error.message}`);
    }
}

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function main() {
    try {
        print('blue', 'Header Editor Pro - Free Release Script');
        
        // Check if in git repo
        try {
            execCommand('git rev-parse --git-dir');
        } catch {
            print('red', 'This script must be run from within a git repository');
            process.exit(1);
        }

        // Check current branch
        const currentBranch = execCommand('git branch --show-current');
        if (currentBranch !== 'main' && currentBranch !== 'master') {
            print('yellow', `You're on branch '${currentBranch}'. Releases are typically made from main/master.`);
            const proceed = await question('Continue anyway? (y/N): ');
            if (!proceed.toLowerCase().startsWith('y')) {
                process.exit(1);
            }
        }

        // Check for uncommitted changes
        const gitStatus = execCommand('git status --porcelain');
        if (gitStatus) {
            print('red', 'You have uncommitted changes. Please commit or stash them first.');
            console.log(gitStatus);
            process.exit(1);
        }

        // Get current version
        if (!fs.existsSync('src/manifest.json')) {
            print('red', 'src/manifest.json not found. Are you in the correct directory?');
            process.exit(1);
        }

        const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
        const currentVersion = manifest.version;
        print('blue', `Current version: ${currentVersion}`);

        // Calculate version options
        const [major, minor, patch] = currentVersion.split('.').map(Number);
        const patchVersion = `${major}.${minor}.${patch + 1}`;
        const minorVersion = `${major}.${minor + 1}.0`;
        const majorVersion = `${major + 1}.0.0`;

        console.log('\nWhat type of release is this?');
        console.log(`1) Patch (bug fixes): ${currentVersion} → ${patchVersion}`);
        console.log(`2) Minor (new features): ${currentVersion} → ${minorVersion}`);
        console.log(`3) Major (breaking changes): ${currentVersion} → ${majorVersion}`);
        console.log('4) Custom version');

        const choice = await question('Choose (1-4): ');
        
        let newVersion;
        let releaseType;
        
        switch (choice) {
            case '1':
                newVersion = patchVersion;
                releaseType = 'patch';
                break;
            case '2':
                newVersion = minorVersion;
                releaseType = 'minor';
                break;
            case '3':
                newVersion = majorVersion;
                releaseType = 'major';
                break;
            case '4':
                newVersion = await question('Enter custom version (e.g., 1.2.3): ');
                releaseType = 'custom';
                break;
            default:
                print('red', 'Invalid choice');
                process.exit(1);
        }

        // Validate version format
        if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
            print('red', 'Invalid version format. Use semantic versioning (e.g., 1.2.3)');
            process.exit(1);
        }

        print('blue', `New version will be: ${newVersion}`);

        // Get release notes
        const releaseNotes = await question('Enter release notes (optional, press Enter to skip): ') || `Release version ${newVersion}`;

        // Confirmation
        console.log('\n' + colors.yellow + '[WARNING]' + colors.reset + ' This will:');
        console.log(`  • Update manifest.json version to ${newVersion}`);
        console.log(`  • Create a commit: 'release: bump version to ${newVersion}'`);
        console.log(`  • Create and push tag: v${newVersion}`);
        console.log('  • Trigger GitHub Action to create release with ZIP file');
        
        const confirm = await question('\nContinue? (y/N): ');
        if (!confirm.toLowerCase().startsWith('y')) {
            print('blue', 'Release cancelled');
            process.exit(0);
        }

        print('blue', 'Starting release process...');

        // Update src/manifest.json
        print('blue', 'Updating src/manifest.json version...');
        manifest.version = newVersion;
        fs.writeFileSync('src/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
        print('green', `Updated src/manifest.json version to ${newVersion}`);

        // Create commit
        print('blue', 'Creating commit...');
        execCommand('git add src/manifest.json');
        execCommand(`git commit -m "release: bump version to ${newVersion}

${releaseNotes}"`);
        print('green', 'Created release commit');

        // Create and push tag
        print('blue', `Creating and pushing tag v${newVersion}...`);
        execCommand(`git tag "v${newVersion}" -m "Release version ${newVersion}

${releaseNotes}"`);
        execCommand(`git push origin ${currentBranch} --tags`);
        print('green', `Tag v${newVersion} pushed successfully`);

        // Get repo info for URLs
        const remoteUrl = execCommand('git remote get-url origin');
        const repoPath = remoteUrl.replace(/.*github\.com[:/]([^.]+).*/, '$1');

        print('blue', 'GitHub Actions should now be building the release...');
        print('blue', `You can monitor progress at: https://github.com/${repoPath}/actions`);

        console.log('\n' + colors.green + '[SUCCESS]' + colors.reset + ` 🚀 Release v${newVersion} initiated successfully!`);
        console.log('\nNext steps:');
        console.log('  1. Monitor GitHub Actions for build completion');
        console.log('  2. Check the release page for the generated ZIP file');
        console.log('  3. Download and test the ZIP package');
        console.log('  4. Submit to Chrome Web Store if ready');
        console.log(`\nRelease page: https://github.com/${repoPath}/releases`);

    } catch (error) {
        print('red', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();