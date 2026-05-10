param()

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$SharedScript = Join-Path $WorkspaceRoot '0.dev-matrix\resume-work.shared.ps1'

if (-not (Test-Path $SharedScript)) {
  Write-Host 'Shared resume-work helper not found.' -ForegroundColor Yellow
  return
}

& $SharedScript -RepoRoot $RepoRoot
