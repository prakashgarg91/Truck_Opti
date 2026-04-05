param()

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$todayStamp = Get-Date -Format 'yyyy-MM-dd'

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

Write-Host ''
Write-Host '=== Pause Work ===' -ForegroundColor Cyan
Write-Host "Repo: $(Split-Path $RepoRoot -Leaf)"
Write-Host "Date: $todayStamp"

$handoffFile = Join-Path $RepoRoot '0.dev-matrix\AI-HANDOFF.md'
if (Test-Path $handoffFile) {
  $latestHandoff = Get-LatestHandoffEntry (Get-Content $handoffFile -Raw)
  if ($latestHandoff) {
    Write-Host ''
    Write-Host 'Current handoff checkpoint' -ForegroundColor Yellow
    Write-Host "- Continue from: $(Get-HandoffFieldValue $latestHandoff.Body 'Continue from:')"
    Write-Host "- Next step: $(Get-HandoffFieldValue $latestHandoff.Body 'Next step:')"
    Write-Host "- Blockers: $(Get-HandoffFieldValue $latestHandoff.Body 'Blockers:')"
  }
}

$launchChecklistFile = Join-Path $RepoRoot '0.dev-matrix\LAUNCH_CHECKLIST.md'
if (Test-Path $launchChecklistFile) {
  $launchContent = Get-Content $launchChecklistFile -Raw
  Write-Host ''
  Write-Host 'Current launch focus' -ForegroundColor Yellow
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
Write-Host 'Quick handoff template' -ForegroundColor Yellow
Write-Host "### $todayStamp"
Write-Host '- Changed: '
Write-Host '- Verified: '
Write-Host '- Operational proof: '
Write-Host '- Continue from: '
Write-Host '- Next step: '
Write-Host '- Blockers: '

Write-Host ''
Write-Host 'Pause rule' -ForegroundColor Yellow
Write-Host '- Keep the handoff brief: one truthful line per field.'
Write-Host '- Update LAUNCH_CHECKLIST only if the launch slice, blocker, or earning step changed.'
Write-Host '- Run close-day before push, before readiness claims, or at a true day close.'
