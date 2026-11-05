#!/usr/bin/env bash
# Publishes the site to GitHub Pages. This makes it public.
# Run it from anywhere: bash site/scripts/deploy.sh
set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SITE_DIR"

REMOTE_URL="$(git remote get-url origin)"
NAME="$(git config user.name)"
EMAIL="$(git config user.email)"

echo "Checking types and running tests..."
npx tsc --noEmit
npm test

echo "Building..."
npm run build

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
cp -r dist/. "$OUT/"
cd "$OUT"
# Tells GitHub Pages to serve files as they are.
touch .nojekyll
git init -q -b gh-pages
git config user.name "$NAME"
git config user.email "$EMAIL"
git add -A
git commit -q -m "Deploy System Design Lab"
git push --force "$REMOTE_URL" gh-pages

OWNER_REPO="$(echo "$REMOTE_URL" | sed -E 's#.*github.com[:/]##; s#\.git$##')"
OWNER="${OWNER_REPO%%/*}"
REPO="${OWNER_REPO##*/}"
OWNER_LOWER="$(echo "$OWNER" | tr '[:upper:]' '[:lower:]')"
echo
echo "Pushed to the gh-pages branch."
echo "If this is the first deploy, turn it on under: https://github.com/$OWNER_REPO/settings/pages"
echo "Choose Deploy from a branch, then gh-pages, then / (root)."
echo "The site will be live at: https://$OWNER_LOWER.github.io/$REPO/"
