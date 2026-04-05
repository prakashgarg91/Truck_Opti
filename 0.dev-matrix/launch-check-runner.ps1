param(
  [string]$RunStamp,
  [string]$StartedAt
)

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReportDir = Join-Path $RepoRoot '0.dev-matrix\test-reports'
$StatusFile = Join-Path $ReportDir 'launch-check-status.json'

if (-not (Test-Path $ReportDir)) {
  New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

if ([string]::IsNullOrWhiteSpace($RunStamp)) {
  $RunStamp = Get-Date -Format 'yyyyMMdd_HHmmss'
}

$startedAtValue = if ([string]::IsNullOrWhiteSpace($StartedAt)) { Get-Date } else { Get-Date $StartedAt }
$logFileName = "launch-check-$RunStamp.log"
$logPath = Join-Path $ReportDir $logFileName
$logRelativePath = "0.dev-matrix/test-reports/$logFileName"

Push-Location $RepoRoot
try {
  $output = npm run launch-check 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

Set-Content -Path $logPath -Value $output

$finishedAtValue = Get-Date
$summaryText = if ($exitCode -eq 0) { 'launch-check passed' } else { 'launch-check failed; see log' }
$passCount = $null
$failCount = $null
$summaryMatch = [regex]::Match($output, 'Summary:\s*(?<pass>\d+)\s+pass,\s*(?<fail>\d+)\s+fail')
if ($summaryMatch.Success) {
  $passCount = [int]$summaryMatch.Groups['pass'].Value
  $failCount = [int]$summaryMatch.Groups['fail'].Value
  $summaryText = "Summary: $passCount pass, $failCount fail"
}

$status = [ordered]@{
  State = if ($exitCode -eq 0) { 'passed' } else { 'failed' }
  StartedAt = $startedAtValue.ToString('s')
  FinishedAt = $finishedAtValue.ToString('s')
  DurationMinutes = [math]::Round((New-TimeSpan -Start $startedAtValue -End $finishedAtValue).TotalMinutes, 1)
  ExitCode = $exitCode
  Pid = $PID
  Log = $logRelativePath
  Summary = $summaryText
  PassCount = $passCount
  FailCount = $failCount
}

$status | ConvertTo-Json -Depth 6 | Set-Content -Path $StatusFile
exit $exitCode