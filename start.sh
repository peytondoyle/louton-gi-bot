#!/usr/bin/env bash
set -euo pipefail

echo "🔄 Syncing with main..."
git fetch origin
git reset --hard origin/main || true

echo "📦 Installing dependencies..."
if command -v npm >/dev/null 2>&1; then
  npm ci || npm install
else
  echo "❌ npm not found (Nix env not built yet)."
  echo "➡️  Click 'Rebuild environment' (hammer icon) or 'Run' to trigger Nix build, then run again."
  exit 1
fi

echo "🚀 Starting Louton GI Bot..."
npm start
