#!/usr/bin/env bash
set -euo pipefail
echo "🔄 Syncing with main..."
git fetch origin || true
git reset --hard origin/main || true

echo "📦 Installing deps..."
rm -rf node_modules package-lock.json
npm ci || npm install

echo "🚀 Starting bot..."
node -v
npm start
