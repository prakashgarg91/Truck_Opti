param(
  [string]$Mode = 'manual',
  [switch]$AsObject
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$SharedScript = Join-Path $WorkspaceRoot '0.dev-matrix\sync-two-task-loop.shared.ps1'

if (-not (Test-Path $SharedScript)) {
  Write-Host 'Shared two-task loop helper not found.' -ForegroundColor Yellow
  return
}

& $SharedScript -RepoRoot $RepoRoot -Mode $Mode -AsObject:$AsObject
