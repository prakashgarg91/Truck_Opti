param()

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReportPath = Join-Path $RepoRoot '0.dev-matrix\LAST-CLOSEOUT.md'
$LaunchCommand = 'npm run launch-check'
$NodeAuditDirs = @('.', 'frontend', 'apps\web')
$PythonRequirementFiles = @('apps\web\requirements.txt')
$DeepVerificationTasks = @(
  @{ Label = 'deep verification: live button audit'; Dir = '.'; Command = 'npm run test:live-buttons' },
  @{ Label = 'deep verification: app coverage'; Dir = 'apps\web'; Command = 'npm run test:coverage' }
)
$pass = 0
$fail = 0
$reportLines = @()

function Gate($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $status = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host "[$status] $name - $detail"
  $script:reportLines += "- [$status] $name - $detail"
}

function Run-InDir($relativeDir, $command) {
  $target = if ($relativeDir -eq '.') { $RepoRoot } else { Join-Path $RepoRoot $relativeDir }
  if (-not (Test-Path $target)) { return $false }
  Push-Location $target
  try {
    Invoke-Expression $command *> $null
    return ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
  }
}

$required = @('0.dev-matrix\STATE.md', '0.dev-matrix\TASK.md', '0.dev-matrix\DISCUSSION.md', '0.dev-matrix\CLOSING-DAY-HOOK.md')
$missing = $required | Where-Object { -not (Test-Path (Join-Path $RepoRoot $_)) }
Gate 'runtime close docs' ($missing.Count -eq 0) ($(if ($missing.Count -eq 0) { 'state/task/discussion/hook present' } else { 'missing: ' + ($missing -join ', ') }))

Push-Location $RepoRoot
try {
  Invoke-Expression $LaunchCommand *> $null
  Gate 'launch-check' ($LASTEXITCODE -eq 0) $LaunchCommand
} finally {
  Pop-Location
}

foreach ($task in $DeepVerificationTasks) {
  $ok = Run-InDir $task.Dir $task.Command
  Gate $task.Label $ok "$($task.Dir): $($task.Command)"
}

foreach ($dir in $NodeAuditDirs) {
  $pkgPath = if ($dir -eq '.') { Join-Path $RepoRoot 'package.json' } else { Join-Path (Join-Path $RepoRoot $dir) 'package.json' }
  if (Test-Path $pkgPath) {
    $null = Run-InDir $dir 'npm audit fix'
    $auditOk = Run-InDir $dir 'npm audit --omit=dev'
    Gate "node vulnerability sweep ($dir)" $auditOk "npm audit fix && npm audit --omit=dev"
  }
}

$pipAudit = Get-Command 'pip-audit' -ErrorAction SilentlyContinue
foreach ($req in $PythonRequirementFiles) {
  $reqPath = Join-Path $RepoRoot $req
  if ((Test-Path $reqPath) -and $pipAudit) {
    Push-Location $RepoRoot
    try {
      pip-audit -r $reqPath *> $null
      Gate "python vulnerability sweep ($req)" ($LASTEXITCODE -eq 0) 'pip-audit'
    } finally {
      Pop-Location
    }
  }
}

Push-Location $RepoRoot
try {
  $gitStatus = @(git status --porcelain 2>$null)
  $statusTouch = @(git status --porcelain -- '0.dev-matrix/STATE.md' '0.dev-matrix/TASK.md' '0.dev-matrix/DISCUSSION.md' 2>$null)
  $statusOk = ($gitStatus.Count -eq 0) -or ($statusTouch.Count -gt 0)
  $statusDetail = if ($statusOk) { if ($gitStatus.Count -eq 0) { 'repo clean' } else { 'runtime status files touched' } } else { 'repo changed without state/task/discussion update' }
  Gate 'status update discipline' $statusOk $statusDetail
  $gitSummary = if ($gitStatus.Count -gt 0) { ($gitStatus | Select-Object -First 10) -join ' | ' } else { 'clean' }
} finally {
  Pop-Location
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$report = @(
  "# Last Closeout",
  "",
  "- Time: $timestamp",
  "- Launch command: $LaunchCommand",
  "- Git status: $gitSummary",
  "",
  "## Results",
  $reportLines,
  "",
  "## Summary",
  "- Pass: $pass",
  "- Fail: $fail"
)
Set-Content -Path $ReportPath -Value $report

Write-Host ""
Write-Host "Summary: $pass pass, $fail fail"
if ($fail -gt 0) { exit 1 }
