param(
  [ValidateSet('latest', 'capture', 'resolve')]
  [string]$Mode = 'latest'
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$SharedScript = Join-Path $WorkspaceRoot '0.dev-matrix\runtime-error-loop.shared.ps1'

if (-not (Test-Path $SharedScript)) {
  Write-Host 'Shared runtime-error-loop helper not found.' -ForegroundColor Yellow
  return
}

& $SharedScript -RepoRoot $RepoRoot -Mode $Mode