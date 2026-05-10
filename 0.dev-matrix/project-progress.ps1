param(
  [int]$TopTasks = 3,
  [switch]$AsObject
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$SharedScript = Join-Path $WorkspaceRoot '0.dev-matrix\project-progress.shared.ps1'

if (-not (Test-Path $SharedScript)) {
  $fallback = [pscustomobject]@{
    Date = Get-Date -Format 'yyyy-MM-dd'
    WorkingSince = 'unknown'
    WorkingDays = 0
    CompletionPercent = $null
    CompletedTasks = 0
    TotalTasks = 0
    RemainingTasks = 0
    PendingDays = $null
    NextTasks = @('shared project-progress helper not found')
    Source = 'shared-helper-missing'
  }
  if ($AsObject) { return $fallback }
  Write-Host 'Project progress helper missing.' -ForegroundColor Yellow
  return
}

$progress = & $SharedScript -RepoRoot $RepoRoot -TopTasks $TopTasks
if ($AsObject) { return $progress }

Write-Host ''
Write-Host '=== Project Progress ===' -ForegroundColor Cyan
Write-Host "Date: $($progress.Date)"
Write-Host "Working since: $($progress.WorkingSince)"
Write-Host "Working days: $($progress.WorkingDays)"
if ($null -ne $progress.CompletionPercent) {
  Write-Host "Completion: $($progress.CompletionPercent)% ($($progress.CompletedTasks)/$($progress.TotalTasks) tasks)"
  Write-Host "Projected pending days: $($progress.PendingDays)"
}
else {
  Write-Host 'Completion: unavailable'
}
Write-Host 'Next 3 tasks:'
foreach ($task in @($progress.NextTasks | Select-Object -First $TopTasks)) {
  Write-Host "- $task"
}
