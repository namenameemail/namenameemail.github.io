#!/usr/bin/env sh
set -eu

QR_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$QR_DIR/.." && pwd)"
SOURCE_DIR="$QR_DIR/source"
VERSION_FILE="$SOURCE_DIR/src/version.ts"

cd "$REPO_ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "deploy: not a git repository" >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  echo "deploy: expected main or master branch, got: $BRANCH" >&2
  exit 1
fi

echo "deploy: bumping patch version…"
cd "$SOURCE_DIR"
NEW_VERSION="$(npm version patch --no-git-tag-version)"
cd "$REPO_ROOT"

# npm version prints "v0.0.1"; strip the prefix.
NEW_VERSION="${NEW_VERSION#v}"

sed -i "s/export const APP_VERSION = '[^']*'/export const APP_VERSION = '$NEW_VERSION'/" "$VERSION_FILE"

echo "deploy: version $NEW_VERSION"

echo "deploy: building…"
"$QR_DIR/build.sh"

echo "deploy: committing…"
git add qr-drop/
if git diff --cached --quiet; then
  echo "deploy: nothing to commit" >&2
  exit 1
fi

git commit -m "$(cat <<EOF
chore(qr-drop): release v$NEW_VERSION
EOF
)"

echo "deploy: pushing to origin/$BRANCH…"
git push origin "$BRANCH"

echo "deploy: done — v$NEW_VERSION published"
