# Run admin-web (Vite). Port 5173 is fixed to match Google OAuth origins.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\admin-web')

if (-not (Test-Path '.\node_modules')) {
    npm install
}

& (Join-Path $PSScriptRoot 'stop-dev.ps1') -Ports 5173

npm run dev
