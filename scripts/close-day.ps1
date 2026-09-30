# ============================================================
# TruckOpti - Canonical Day-Close Verification (TO-121)
# ============================================================
# Run from repo root:  npm run close-day
#
# close-day consumes the canonical control plane (TASKS.md plus
# agent-results/) instead of generating a competing task/handoff
# system. It validates:
#   1. Canonical control plane present (AGENTS.md, ARCHITECTURE.md,
#      TASKS.md, agent-tasks/README.md)
#   2. Task board integrity - every brief/result reference resolves
#      on disk and every DONE/BLOCKED row carries a result record
#   3. Working tree cleanliness
#   4. Documentation placement and naming hygiene
#   5. Latest launch-check evidence (logs/launch-check/launch-check-status.json)
#
# Report: logs/closeout/last-closeout.md (previous report archived
# under logs/closeout/archive/). Exit 1 on any FAIL.
# ============================================================

param()

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $PSScriptRoot 'launch-gates.core.ps1')

$CloseoutDir = Join-Path $RepoRoot 'logs\closeout'
$ArchiveDir = Join-Path $CloseoutDir 'archive'
$ReportPath = Join-Path $CloseoutDir 'last-closeout.md'
$LaunchStatusPath = Join-Path $RepoRoot 'logs\launch-check\launch-check-status.json'
$null = New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
$dateStamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$todayStamp = Get-Date -Format 'yyyy-MM-dd'
$LogFile = Join-Path $CloseoutDir "close-day-$dateStamp.log"

$reportLines = @()
$outputLog = @()
$pass = 0
$fail = 0

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

function Skip($name, $detail) {
    Write-Host "[SKIP] $name - $detail"
    $script:reportLines += "- [SKIP] $name - $detail"
    Log "[SKIP] $name - $detail"
}

Write-Host 'TruckOpti day-close check' -ForegroundColor Cyan
Log "day-close $dateStamp"

# ---------- 1. Canonical control plane ----------
$canonicalGaps = Get-GateCanonicalControlPlaneGaps -RepoRoot $RepoRoot
Gate 'canonical control plane' ($canonicalGaps.Count -eq 0) $(if ($canonicalGaps.Count -eq 0) { 'AGENTS.md, ARCHITECTURE.md, TASKS.md, agent-tasks/README.md present' } else { 'missing: ' + ($canonicalGaps -join ', ') })

# ---------- 2. Task board integrity ----------
$board = Get-GateTaskBoardReport -RepoRoot $RepoRoot
$boardIssues = @()
foreach ($issue in ($board.ParseErrors + $board.MissingBriefs + $board.MissingResults + $board.TerminalRowsWithoutResult)) { $boardIssues += $issue }
Gate 'task board integrity' ($boardIssues.Count -eq 0) $(if ($boardIssues.Count -eq 0) {
    "$($board.RowsFound) task rows resolve; next recommended: $(if ($board.NextRecommended) { "$($board.NextRecommended.Id) [$($board.NextRecommended.Status)]" } else { 'none' })"
  } else {
    ($boardIssues | Select-Object -First 5) -join '; '
  })

$statusSummary = @()
foreach ($statusEntry in $board.StatusCounts.PSObject.Properties) {
    $statusSummary += "$($statusEntry.Name): $($statusEntry.Value)"
}

# ---------- 3. Git state ----------
Push-Location $RepoRoot
try {
    $porcelain = @(& git status --porcelain 2>&1)
    $gitOk = ($LASTEXITCODE -eq 0)
    $gitSummary = 'clean'
    if (-not $gitOk) {
        Gate 'working tree cleanliness' $false "git status exited $LASTEXITCODE"
    }
    else {
        # logs/ is the intentional report path close-day itself writes to;
        # its own output must not block the cleanliness gate.
        $blockingDirty = Get-GateBlockingDirtyPaths -StatusLines $porcelain -AllowedPaths @('logs/')
        $gitSummary = if ($blockingDirty.Count -gt 0) { ($blockingDirty | Select-Object -First 5) -join ', ' } else { 'clean' }
        Gate 'working tree cleanliness' ($blockingDirty.Count -eq 0) $(if ($blockingDirty.Count -eq 0) { 'working tree clean' } else { "$($blockingDirty.Count) uncommitted/untracked path(s): " + (($blockingDirty | Select-Object -First 5) -join ', ') })

        $misplacedDocs = Get-GateMisplacedDocs -StatusLines $porcelain
        Gate 'documentation placement' ($misplacedDocs.Count -eq 0) $(if ($misplacedDocs.Count -eq 0) { 'new docs are in approved zones or canonical root paths' } else { 'new docs in nonstandard locations: ' + (($misplacedDocs | Select-Object -First 5) -join ', ') })

        $suspiciousDocs = Get-GateSuspiciousDocPaths -StatusLines $porcelain
        Gate 'documentation naming hygiene' ($suspiciousDocs.Count -eq 0) $(if ($suspiciousDocs.Count -eq 0) { 'no active docs use unstable duplicate-style names' } else { 'unstable doc names: ' + (($suspiciousDocs | Select-Object -First 5) -join ', ') })
    }
}
finally {
    Pop-Location
}

# ---------- 4. Launch verification evidence ----------
$launchVerdict = 'no launch-check evidence recorded'
$launchState = 'missing'
$launchProductionReady = $false
if (Test-Path $LaunchStatusPath) {
    try {
        $launchStatus = Get-Content $LaunchStatusPath -Raw | ConvertFrom-Json
        $launchState = "$($launchStatus.state)"
        $launchVerdict = "$($launchStatus.verdict)"
        $launchProductionReady = [bool]$launchStatus.productionReady
        if ($launchState -eq 'failed') {
            Gate 'launch verification evidence' $false "latest npm run launch-check failed - $launchVerdict"
        }
        else {
            Gate 'launch verification evidence' $true "latest npm run launch-check: $launchVerdict"
        }
    }
    catch {
        Skip 'launch verification evidence' 'launch-check status unreadable; run npm run launch-check'
    }
}
else {
    Skip 'launch verification evidence' 'launch-check has not been run; run npm run launch-check for gate evidence'
}

# ---------- 5. Regression note ----------
$previousReport = if (Test-Path $ReportPath) { Get-Content $ReportPath -Raw } else { $null }
$regressionNote = ''
if ($previousReport) {
    $prevPass = [regex]::Match($previousReport, 'Pass:\s*(\d+)')
    $prevFail = [regex]::Match($previousReport, 'Fail:\s*(\d+)')
    if ($prevPass.Success -and ([int]$prevPass.Groups[1].Value) -gt $pass) {
        $regressionNote = "pass count dropped from $($prevPass.Groups[1].Value) to $pass"
    }
    if ($prevFail.Success -and ([int]$prevFail.Groups[1].Value) -lt $fail) {
        if ($regressionNote) { $regressionNote += '; ' }
        $regressionNote += "fail count rose from $($prevFail.Groups[1].Value) to $fail"
    }
}

# ---------- 6. Write report (previous archived first) ----------
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
if (Test-Path $ReportPath) {
    Copy-Item $ReportPath (Join-Path $ArchiveDir "closeout-prev-$dateStamp.md") -Force
}

$nextRecommendedLine = 'none identified'
if ($board.NextRecommended) {
    $nextRecommendedLine = "$($board.NextRecommended.Id) [$($board.NextRecommended.Status)] $(if ($board.NextRecommended.Brief) { "brief: $($board.NextRecommended.Brief)" })"
}

$productionReadyLine = '- Production-ready: ' + $(if ($launchProductionReady) { 'yes' } else { 'no (blocked/skipped owner-gated gates or failed run)' })
$terminalWithoutResultLine = if ($board.TerminalRowsWithoutResult.Count -gt 0) { $board.TerminalRowsWithoutResult -join ', ' } else { 'none' }
$report = @(
    '# Day Closeout',
    '',
    "- Time: $timestamp",
    "- Git status: $gitSummary",
    "- Log: logs/closeout/close-day-$dateStamp.log",
    '',
    '## Task Board',
    "- Rows: $($board.RowsFound)",
    "- Statuses: $($statusSummary -join '; ')",
    "- Next recommended task: $nextRecommendedLine",
    "- Terminal rows without result records: $terminalWithoutResultLine",
    '',
    '## Launch Verification',
    "- State: $launchState",
    "- Verdict: $launchVerdict",
    $productionReadyLine,
    '',
    '## Results'
)
$report += $reportLines
$report += @(
    '',
    '## Summary',
    "- Pass: $pass",
    "- Fail: $fail",
    "- Evidence date: $todayStamp"
)
if ($regressionNote) {
    $report += "- Regression warning: $regressionNote"
}
Set-Content -Path $ReportPath -Value $report

Write-Host ''
Write-Host "Summary: $pass pass, $fail fail"
Write-Host "Report: logs/closeout/last-closeout.md"
if ($regressionNote) { Write-Host "WARNING: $regressionNote" -ForegroundColor Yellow }
if ($fail -gt 0) { exit 1 }
exit 0
