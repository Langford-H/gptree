#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Starting preview..."
echo "Preview: http://localhost:4173"
echo "Press Ctrl+C to stop preview"
npm run preview
