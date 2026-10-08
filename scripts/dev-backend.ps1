# Run FastAPI backend (Windows). First run creates .venv and installs requirements.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\backend')

$python = '.\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    Write-Host 'Creating .venv and installing requirements...'
    py -3 -m venv .venv
    & $python -m pip install -r requirements.txt
}

& (Join-Path $PSScriptRoot 'stop-dev.ps1') -Ports 8000

& $python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
