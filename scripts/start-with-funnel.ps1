# Start the app stack and enable Tailscale Funnel on port 5000 so you don't have to run "tailscale funnel 5000" manually.
# Requires: Tailscale installed and logged in on this machine.
# On Windows, run PowerShell as Administrator if Funnel fails (e.g. "need to enable Funnel in admin console").

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "Starting app stack..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for app to be ready..."
Start-Sleep -Seconds 5

Write-Host "Enabling Tailscale Funnel on port 5000 (background)..."
& tailscale funnel --bg 5000
if ($LASTEXITCODE -ne 0) {
    Write-Warning "tailscale funnel failed. If on Windows, try running this script as Administrator."
    exit $LASTEXITCODE
}

Write-Host "Done. App is up and Funnel is on. Check 'tailscale funnel status' for the public URL."
