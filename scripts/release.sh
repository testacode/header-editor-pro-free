#!/bin/bash

# Header Editor Pro - Free Release Script
# Automates version bumping, tagging, and GitHub release creation

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "This script must be run from within a git repository"
    exit 1
fi

# Check if we're on main/master branch
current_branch=$(git branch --show-current)
if [[ "$current_branch" != "main" && "$current_branch" != "master" ]]; then
    print_warning "You're on branch '$current_branch'. Releases are typically made from main/master."
    read -p "Continue anyway? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    print_error "You have uncommitted changes. Please commit or stash them first."
    git status --short
    exit 1
fi

# Get current version from src/manifest.json
if [[ ! -f "src/manifest.json" ]]; then
    print_error "src/manifest.json not found. Are you in the correct directory?"
    exit 1
fi

current_version=$(grep '"version"' src/manifest.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
print_step "Current version: $current_version"

# Ask for new version
echo ""
echo "What type of release is this?"
echo "1) Patch (bug fixes): $current_version → $(echo $current_version | awk -F. '{$3++; print $1"."$2"."$3}')"
echo "2) Minor (new features): $current_version → $(echo $current_version | awk -F. '{$2++; $3=0; print $1"."$2"."$3}')"
echo "3) Major (breaking changes): $current_version → $(echo $current_version | awk -F. '{$1++; $2=0; $3=0; print $1"."$2"."$3}')"
echo "4) Custom version"

read -p "Choose (1-4): " choice

case $choice in
    1)
        new_version=$(echo $current_version | awk -F. '{$3++; print $1"."$2"."$3}')
        release_type="patch"
        ;;
    2)
        new_version=$(echo $current_version | awk -F. '{$2++; $3=0; print $1"."$2"."$3}')
        release_type="minor"
        ;;
    3)
        new_version=$(echo $current_version | awk -F. '{$1++; $2=0; $3=0; print $1"."$2"."$3}')
        release_type="major"
        ;;
    4)
        read -p "Enter custom version (e.g., 1.2.3): " new_version
        release_type="custom"
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Validate version format
if ! [[ $new_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format. Use semantic versioning (e.g., 1.2.3)"
    exit 1
fi

print_step "New version will be: $new_version"

# Ask for release notes
echo ""
read -p "Enter release notes (optional, press Enter to skip): " release_notes
if [[ -z "$release_notes" ]]; then
    release_notes="Release version $new_version"
fi

# Confirmation
echo ""
print_warning "This will:"
echo "  • Update src/manifest.json version to $new_version"
echo "  • Create a commit: 'release: bump version to $new_version'"
echo "  • Create and push tag: v$new_version" 
echo "  • Trigger GitHub Action to create release with ZIP file"
echo ""
read -p "Continue? (y/N): " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_step "Release cancelled"
    exit 0
fi

print_step "Starting release process..."

# Update version in src/manifest.json
print_step "Updating src/manifest.json version..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" src/manifest.json
else
    # Linux
    sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" src/manifest.json
fi

# Verify the change
updated_version=$(grep '"version"' src/manifest.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [[ "$updated_version" != "$new_version" ]]; then
    print_error "Failed to update version in src/manifest.json"
    exit 1
fi

print_success "Updated src/manifest.json version to $new_version"

# Create commit
print_step "Creating commit..."
git add src/manifest.json
git commit -m "release: bump version to $new_version

$release_notes"

print_success "Created release commit"

# Create and push tag
print_step "Creating and pushing tag v$new_version..."
git tag "v$new_version" -m "Release version $new_version

$release_notes"

git push origin "$current_branch" --tags

print_success "Tag v$new_version pushed successfully"

# Wait a moment and check GitHub Actions
print_step "GitHub Actions should now be building the release..."
print_step "You can monitor progress at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"

echo ""
print_success "🚀 Release v$new_version initiated successfully!"
echo ""
echo "Next steps:"
echo "  1. Monitor GitHub Actions for build completion"
echo "  2. Check the release page for the generated ZIP file" 
echo "  3. Download and test the ZIP package"
echo "  4. Submit to Chrome Web Store if ready"
echo ""
echo "Release page: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/releases"