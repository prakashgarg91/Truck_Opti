param(
  [string]$TargetPath = 'frontend/src'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $pythonPath)) {
  throw "Graphify refresh requires $pythonPath"
}

Push-Location $repoRoot
try {
  & $pythonPath -m graphify update $TargetPath
  if ($LASTEXITCODE -ne 0) {
    throw "graphify update failed with exit code $LASTEXITCODE"
  }

  $sourceDir = Join-Path $repoRoot ($TargetPath -replace '/', '\\')
  $sourceDir = Join-Path $sourceDir 'graphify-out'
  $destinationDir = Join-Path $repoRoot 'graphify-out'

  if (-not (Test-Path $sourceDir)) {
    throw "Graphify output not found at $sourceDir"
  }

  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

  Get-ChildItem -Path $destinationDir -Force -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  Copy-Item -Path (Join-Path $sourceDir '*') -Destination $destinationDir -Recurse -Force

  Write-Host "Graphify refreshed for $TargetPath and synced to graphify-out/"
}
finally {
  Pop-Location
}