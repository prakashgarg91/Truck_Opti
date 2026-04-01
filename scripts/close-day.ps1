param()

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReportPath = Join-Path $RepoRoot '0.dev-matrix\LAST-CLOSEOUT.md'
$LogDir = Join-Path $RepoRoot '0.dev-matrix\closeout-logs'
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
$outputLog = @()

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$dateStamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$LogFile = Join-Path $LogDir "closeout-$dateStamp.log"

function Log($text) {
  $script:outputLog += $text
  Add-Content -Path $script:LogFile -Value $text -ErrorAction SilentlyContinue
}

function Gate($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $status = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host "[$status] $name - $detail"
  $script:reportLines += "- [$status] $name - $detail"
  Log "[$status] $name - $detail"
}

function Run-InDir($relativeDir, $command) {
  $target = if ($relativeDir -eq '.') { $RepoRoot } else { Join-Path $RepoRoot $relativeDir }
  if (-not (Test-Path $target)) { Log "[SKIP] dir not found: $target"; return $false }
  Push-Location $target
  try {
    $cmdOutput = Invoke-Expression $command 2>&1 | Out-String
    Log "--- output: $command ---"
    Log $cmdOutput.Trim()
    Log "--- exit: $LASTEXITCODE ---"
    return ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
  }
}

# ── 1. Runtime docs ──
$required = @('0.dev-matrix\STATE.md', '0.dev-matrix\TASK.md', '0.dev-matrix\DISCUSSION.md', '0.dev-matrix\CLOSING-DAY-HOOK.md')
$missing = $required | Where-Object { -not (Test-Path (Join-Path $RepoRoot $_)) }
Gate 'runtime close docs' ($missing.Count -eq 0) ($(if ($missing.Count -eq 0) { 'state/task/discussion/hook present' } else { 'missing: ' + ($missing -join ', ') }))

# ── 2. Launch-check ──
Push-Location $RepoRoot
try {
  $lcOut = Invoke-Expression $LaunchCommand 2>&1 | Out-String
  Log "--- launch-check output ---"
  Log $lcOut.Trim()
  Gate 'launch-check' ($LASTEXITCODE -eq 0) $LaunchCommand
} finally {
  Pop-Location
}

# ── 3. Deep verification (empty = FAIL, not PASS) ──
if ($DeepVerificationTasks.Count -eq 0) {
  Gate 'deep verification' $false 'NO deep checks configured - this is a policy violation'
} else {
  foreach ($task in $DeepVerificationTasks) {
    $ok = Run-InDir $task.Dir $task.Command
    Gate $task.Label $ok "$($task.Dir): $($task.Command)"
  }
}

# ── 4. Vulnerability sweep ──
foreach ($dir in $NodeAuditDirs) {
  $pkgPath = if ($dir -eq '.') { Join-Path $RepoRoot 'package.json' } else { Join-Path (Join-Path $RepoRoot $dir) 'package.json' }
  if (Test-Path $pkgPath) {
    $null = Run-InDir $dir 'npm audit fix'
    $auditOk = Run-InDir $dir 'npm audit --omit=dev'
    Gate "node vulnerability sweep ($dir)" $auditOk "npm audit fix && npm audit --omit=dev"
  }
}

$pipAudit = Get-Command 'pip-audit' -ErrorAction SilentlyContinue
if ($PythonRequirementFiles) {
  foreach ($req in $PythonRequirementFiles) {
    $reqPath = Join-Path $RepoRoot $req
    if ((Test-Path $reqPath) -and $pipAudit) {
      Push-Location $RepoRoot
      try {
        $paOut = pip-audit -r $reqPath 2>&1 | Out-String
        Log "--- pip-audit $req ---"; Log $paOut.Trim()
        Gate "python vulnerability sweep ($req)" ($LASTEXITCODE -eq 0) 'pip-audit'
      } finally { Pop-Location }
    }
  }
}

# ── 5. Status update discipline (content check, not just touch) ──
Push-Location $RepoRoot
try {
  $gitStatus = @(git status --porcelain 2>$null)
  $statusTouch = @(git status --porcelain -- '0.dev-matrix/STATE.md' '0.dev-matrix/TASK.md' '0.dev-matrix/DISCUSSION.md' 2>$null)

  if ($gitStatus.Count -eq 0) {
    $statusOk = $true
    $statusDetail = 'repo clean'
  } elseif ($statusTouch.Count -gt 0) {
    # verify the touch is real content, not just whitespace
    $diffBytes = git diff --stat -- '0.dev-matrix/STATE.md' '0.dev-matrix/TASK.md' '0.dev-matrix/DISCUSSION.md' 2>$null | Out-String
    if ($diffBytes.Trim().Length -gt 0) {
      $statusOk = $true
      $statusDetail = 'runtime status files have real content changes'
      Log "--- status diff ---"; Log $diffBytes.Trim()
    } else {
      $statusOk = $false
      $statusDetail = 'status files touched but no real content change detected (whitespace-only edits do not count)'
    }
  } else {
    $statusOk = $false
    $statusDetail = 'repo changed without state/task/discussion update'
  }
  Gate 'status update discipline' $statusOk $statusDetail
  $gitSummary = if ($gitStatus.Count -gt 0) { ($gitStatus | Select-Object -First 10) -join ' | ' } else { 'clean' }
} finally {
  Pop-Location
}

# ── 6. Regression detection ──
$prevReport = if (Test-Path $ReportPath) { Get-Content $ReportPath -Raw } else { $null }
$prevPassMatch = if ($prevReport) { [regex]::Match($prevReport, 'Pass:\s*(\d+)') } else { $null }
$prevFailMatch = if ($prevReport) { [regex]::Match($prevReport, 'Fail:\s*(\d+)') } else { $null }
$prevPass = if ($prevPassMatch -and $prevPassMatch.Success) { [int]$prevPassMatch.Groups[1].Value } else { -1 }
$prevFail = if ($prevFailMatch -and $prevFailMatch.Success) { [int]$prevFailMatch.Groups[1].Value } else { -1 }

$regressionNote = ''
if ($prevPass -ge 0) {
  if ($pass -lt $prevPass) {
    $regressionNote = "REGRESSION: pass count dropped from $prevPass to $pass"
    Write-Host "[WARN] $regressionNote" -ForegroundColor Yellow
  }
  if ($fail -gt $prevFail -and $prevFail -ge 0) {
    $regressionNote += "; fail count rose from $prevFail to $fail"
    Write-Host "[WARN] fail count rose from $prevFail to $fail" -ForegroundColor Yellow
  }
}

# ── 7. Archive previous closeout before overwriting ──
if (Test-Path $ReportPath) {
  $archiveDir = Join-Path $RepoRoot '0.dev-matrix\closeout-logs'
  if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null }
  $archiveName = "closeout-prev-$dateStamp.md"
  Copy-Item $ReportPath (Join-Path $archiveDir $archiveName) -Force
}

# ── 8. Write report ──
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$report = @(
  "# Last Closeout",
  "",
  "- Time: $timestamp",
  "- Launch command: $LaunchCommand",
  "- Git status: $gitSummary",
  "- Log: 0.dev-matrix/closeout-logs/closeout-$dateStamp.log",
  ""
)
if ($regressionNote) { $report += "## Regression Warning"; $report += ""; $report += "- $regressionNote"; $report += "" }
$report += "## Results"
$report += $reportLines
$report += ""
$report += "## Summary"
$report += "- Pass: $pass"
$report += "- Fail: $fail"
Set-Content -Path $ReportPath -Value $report

Write-Host ""
Write-Host "Summary: $pass pass, $fail fail"
if ($regressionNote) { Write-Host "WARNING: $regressionNote" -ForegroundColor Yellow }
if ($fail -gt 0) { exit 1 }

