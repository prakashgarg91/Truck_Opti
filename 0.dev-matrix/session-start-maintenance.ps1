param(
  [int]$FreshHours = 12,
  [int]$GraphifyStaleHours = 12
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$SharedScript = Join-Path $WorkspaceRoot '0.dev-matrix\session-start-maintenance.shared.ps1'

if (-not (Test-Path $SharedScript)) {
  return [pscustomobject]@{
    Action = 'skipped'
    State = 'skipped'
    Detail = 'shared session-start maintenance helper not found'
    StatusFile = $null
    Log = $null
    Steps = @()
  }
}

return & $SharedScript -RepoRoot $RepoRoot -FreshHours $FreshHours -GraphifyStaleHours $GraphifyStaleHours
