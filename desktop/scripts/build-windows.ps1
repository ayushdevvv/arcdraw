$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "Building ArcDraw's bundled web application..." -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot "frontend")
try {
    npm ci --no-audit --no-fund
    npm run build:desktop
}
finally {
    Pop-Location
}

Write-Host "Packaging ArcDraw Desktop for Windows x64..." -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot "desktop")
try {
    npm install --no-audit --no-fund
    npm run dist:win
}
finally {
    Pop-Location
}

$installer = Join-Path $repoRoot "desktop\dist\ArcDraw-Setup.exe"
if (-not (Test-Path $installer)) {
    throw "Build finished without producing ArcDraw-Setup.exe. Check the electron-builder output above."
}
Write-Host "Installer created: $installer" -ForegroundColor Green
