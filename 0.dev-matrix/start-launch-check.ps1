param(
  [int]$FreshMinutes = 15
)

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RunnerFile = Join-Path $RepoRoot '0.dev-matrix\launch-check-runner.ps1'
$ReportDir = Join-Path $RepoRoot '0.dev-matrix\test-reports'
$StatusFile = Join-Path $ReportDir 'launch-check-status.json'
$StatusFileRelativePath = '0.dev-matrix/test-reports/launch-check-status.json'

function Get-LaunchCheckStatus() {
  if (-not (Test-Path $StatusFile)) { return $null }
  try {
    return Get-Content $StatusFile -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Write-LaunchCheckStatus($status) {
  $status | ConvertTo-Json -Depth 6 | Set-Content -Path $StatusFile
}

function New-LaunchCheckResponse($action, $state, $detail, $logPath) {
  return [pscustomobject]@{
    Action = $action
    State = $state
    Detail = $detail
    StatusFile = $StatusFileRelativePath
    Log = $logPath
  }
}

if (-not (Test-Path $RunnerFile)) {
  return New-LaunchCheckResponse 'skipped' 'unavailable' 'launch-check runner script missing' $null
}

if (-not (Test-Path (Join-Path $RepoRoot 'package.json'))) {
  return New-LaunchCheckResponse 'skipped' 'unavailable' 'package.json not found; background launch-check not configured' $null
}

if (-not (Test-Path $ReportDir)) {
  New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

$status = Get-LaunchCheckStatus
if ($status -and "$($status.State)" -eq 'running' -and $status.Pid) {
  $runningProcess = Get-Process -Id ([int]$status.Pid) -ErrorAction SilentlyContinue
  if ($runningProcess) {
    return New-LaunchCheckResponse 'existing' 'running' "background launch-check already running (pid $($status.Pid))" $status.Log
  }
}

if ($status -and $status.FinishedAt) {
  try {
    $finishedAt = Get-Date $status.FinishedAt
    $ageMinutes = [math]::Round((New-TimeSpan -Start $finishedAt -End (Get-Date)).TotalMinutes, 1)
    if ($ageMinutes -lt $FreshMinutes) {
      return New-LaunchCheckResponse 'fresh' "$($status.State)" "latest launch-check result is $ageMinutes minute(s) old" $status.Log
    }
  } catch {
  }
}

$startedAt = Get-Date
$runStamp = $startedAt.ToString('yyyyMMdd_HHmmss')
$logRelativePath = "0.dev-matrix/test-reports/launch-check-$runStamp.log"
$initialStatus = [ordered]@{
  State = 'starting'
  StartedAt = $startedAt.ToString('s')
  FinishedAt = $null
  DurationMinutes = $null
  ExitCode = $null
  Pid = $null
  Log = $logRelativePath
  Summary = 'launch-check queued in background'
}
Write-LaunchCheckStatus $initialStatus

$process = Start-Process -FilePath 'powershell.exe' -WorkingDirectory $RepoRoot -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  $RunnerFile,
  '-RunStamp',
  $runStamp,
  '-StartedAt',
  $startedAt.ToString('s')
) -WindowStyle Hidden -PassThru

$initialStatus.State = 'running'
$initialStatus.Pid = $process.Id
$initialStatus.Summary = 'launch-check running in background'
Write-LaunchCheckStatus $initialStatus

return New-LaunchCheckResponse 'started' 'running' "started background launch-check (pid $($process.Id)); let it run while you work" $logRelativePath