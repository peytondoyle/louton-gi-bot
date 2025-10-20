#!/bin/bash
set -euo pipefail

echo "🔄 Syncing with main..."
git fetch origin >/dev/null 2>&1 || true
git reset --hard origin/main

echo "📦 Installing dependencies..."
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

# Optional: Set Node memory limit for Replit
export NODE_OPTIONS="--max_old_space_size=512"

echo "🚀 Starting Louton GI Bot..."
npm start
