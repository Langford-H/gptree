$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..."
npm install

Write-Host "Building..."
npm run build

Write-Host "Starting preview..."
Write-Host "Preview: http://localhost:4173"
Write-Host "Press Ctrl+C to stop preview"
npm run preview
