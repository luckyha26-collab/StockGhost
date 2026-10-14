#!/usr/bin/env bash
# Installs dependencies (first run) and starts the UI on http://localhost:5173
set -e
cd "$(dirname "$0")/frontend"
[ -d node_modules ] || npm install
npm run dev
