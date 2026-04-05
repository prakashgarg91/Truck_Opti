param()

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Get-HandoffFieldValue($body, $label) {
  if ([string]::IsNullOrWhiteSpace($body) -or [string]::IsNullOrWhiteSpace($label)) { return $null }
  $pattern = '(?mi)^-\s*' + [regex]::Escape($label) + '\s*(?<value>.+)$'
  $match = [regex]::Match($body, $pattern)
  if ($match.Success) {
    return $match.Groups['value'].Value.Trim()
  }
  return $null
}

function Get-LatestHandoffEntry($content) {
  if ([string]::IsNullOrWhiteSpace($content)) { return $null }
  $match = [regex]::Match($content, '(?ms)^###\s*(?<date>\d{4}-\d{2}-\d{2})(?<suffix>[^\r\n]*)\r?\n(?<body>.*?)(?=^###\s|\z)')
  if (-not $match.Success) { return $null }
  return @{
    Date = $match.Groups['date'].Value
    Body = $match.Groups['body'].Value.Trim()
  }
}

function Get-ChecklistFieldValue($content, $label) {
  if ([string]::IsNullOrWhiteSpace($content) -or [string]::IsNullOrWhiteSpace($label)) { return $null }
  $pattern = '(?mi)^-\s*' + [regex]::Escape($label) + '\s*(?<value>.+)$'
  $match = [regex]::Match($content, $pattern)
  if ($match.Success) {
    return $match.Groups['value'].Value.Trim()
  }
  return $null
}

function Get-RepoAgeInfo() {
  Push-Location $RepoRoot
  try {
    $firstCommitDate = @(git log --reverse --format=%ad --date=short -- . 2>$null | Select-Object -First 1)
  } finally {
    Pop-Location
  }

  if ([string]::IsNullOrWhiteSpace($firstCommitDate)) { return $null }

  try {
    $startDate = [datetime]::ParseExact($firstCommitDate.Trim(), 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
  } catch {
    return $null
  }

  return [pscustomobject]@{
    StartedAt = $startDate.ToString('yyyy-MM-dd')
    AgeDays = (New-TimeSpan -Start $startDate -End (Get-Date)).Days
  }
}

function Get-LaunchCheckStatus() {
  $statusFile = Join-Path $RepoRoot '0.dev-matrix\test-reports\launch-check-status.json'
  if (-not (Test-Path $statusFile)) { return $null }
  try {
    return Get-Content $statusFile -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Format-LaunchCheckStatus($status) {
  if ($null -eq $status) { return 'not started' }
  if ($status.State -eq 'passed' -or $status.State -eq 'failed') {
    if ($status.FinishedAt) {
      return "$($status.State) at $($status.FinishedAt)"
    }
    return "$($status.State)"
  }
  if ($status.State -eq 'running' -or $status.State -eq 'starting') {
    return "$($status.State) since $($status.StartedAt)"
  }
  return "$($status.State)"
}

Write-Host ''
Write-Host '=== Resume Work ===' -ForegroundColor Cyan
Write-Host "Repo: $(Split-Path $RepoRoot -Leaf)"

$repoAgeInfo = Get-RepoAgeInfo
if ($repoAgeInfo) {
  Write-Host ''
  Write-Host 'Repo age' -ForegroundColor Yellow
  Write-Host "- Started: $($repoAgeInfo.StartedAt)"
  Write-Host "- Recorded effort window: $($repoAgeInfo.AgeDays) day(s) since first commit"
}

$launchStarterFile = Join-Path $RepoRoot '0.dev-matrix\start-launch-check.ps1'
if (Test-Path $launchStarterFile) {
  $launchStartResult = & $launchStarterFile -FreshMinutes 15
  $launchStatus = Get-LaunchCheckStatus

  Write-Host ''
  Write-Host 'Background launch-check' -ForegroundColor Yellow
  Write-Host "- Status: $(Format-LaunchCheckStatus $launchStatus)"
  if ($launchStartResult -and $launchStartResult.Detail) {
    Write-Host "- Action: $($launchStartResult.Detail)"
  }
  if ($launchStatus -and $launchStatus.Log) {
    Write-Host "- Log: $($launchStatus.Log)"
  } elseif ($launchStartResult -and $launchStartResult.Log) {
    Write-Host "- Log: $($launchStartResult.Log)"
  }
  Write-Host '- Let this run while you work so close-day stays short and readiness evidence keeps moving.'
}

$handoffFile = Join-Path $RepoRoot '0.dev-matrix\AI-HANDOFF.md'
if (Test-Path $handoffFile) {
  $latestHandoff = Get-LatestHandoffEntry (Get-Content $handoffFile -Raw)
  if ($latestHandoff) {
    Write-Host ''
    Write-Host 'Latest handoff' -ForegroundColor Yellow
    Write-Host "- Date: $($latestHandoff.Date)"
    Write-Host "- Continue from: $(Get-HandoffFieldValue $latestHandoff.Body 'Continue from:')"
    Write-Host "- Next step: $(Get-HandoffFieldValue $latestHandoff.Body 'Next step:')"
    Write-Host "- Blockers: $(Get-HandoffFieldValue $latestHandoff.Body 'Blockers:')"
    Write-Host "- Operational proof: $(Get-HandoffFieldValue $latestHandoff.Body 'Operational proof:')"
  }
}

$launchChecklistFile = Join-Path $RepoRoot '0.dev-matrix\LAUNCH_CHECKLIST.md'
if (Test-Path $launchChecklistFile) {
  $launchContent = Get-Content $launchChecklistFile -Raw
  Write-Host ''
  Write-Host 'Launch focus' -ForegroundColor Yellow
  Write-Host "- Product outcome: $(Get-ChecklistFieldValue $launchContent 'Product outcome:')"
  Write-Host "- Current launch slice: $(Get-ChecklistFieldValue $launchContent 'Current launch slice:')"
  Write-Host "- Current blocker: $(Get-ChecklistFieldValue $launchContent 'Current blocker:')"
  Write-Host "- Next earning step: $(Get-ChecklistFieldValue $launchContent 'Next earning step:')"
}

Push-Location $RepoRoot
try {
  $gitStatus = @(git status --short 2>$null)
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Working tree' -ForegroundColor Yellow
if ($gitStatus.Count -eq 0) {
  Write-Host '- clean'
} else {
  $gitStatus | Select-Object -First 12 | ForEach-Object { Write-Host "- $_" }
  if ($gitStatus.Count -gt 12) {
    Write-Host "- ... and $($gitStatus.Count - 12) more"
  }
}

Write-Host ''
Write-Host 'Start rule' -ForegroundColor Yellow
Write-Host '- Resume the current launch slice or clear the current blocker before opening new work.'
Write-Host '- Resume-work starts a background launch-check when available; do not wait for close-day to begin verification.'
