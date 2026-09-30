# ============================================================
# TruckOpti - Canonical Launch-Readiness Verification (TO-121)
# ============================================================
# Run from repo root:  .\scripts\launch-readiness.ps1
# Or via npm:          npm run launch-check
#
# Gates are reported in four separate categories:
#   1. Environment prerequisites - tool and packaging availability.
#   2. Local engineering         - build, dependency audits, Python
#                                   checks, glue check, runtime error
#                                   loop wiring.
#   3. Workspace hygiene         - canonical control plane (AGENTS.md,
#                                   ARCHITECTURE.md, TASKS.md, assigned
#                                   briefs and result records), npm
#                                   script targets, git cleanliness,
#                                   junk artifacts, merge markers.
#   4. Owner-gated production    - checks that need owner-controlled
#                                   access (Heroku config, live
#                                   credentials). A BLOCKED gate here
#                                   always prevents a production-ready
#                                   verdict.
#
# Status vocabulary: PASS / FAIL / SKIP (not applicable) / BLOCKED
# (mandatory but not runnable). Exit codes: 0 = no FAIL, 1 = any FAIL.
# Machine report: logs/launch-check/launch-check-status.json
# Transcript log: logs/launch-check/launch-check-<stamp>.log
# ============================================================

param(
    [switch]$VerboseOutput
)

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $PSScriptRoot 'launch-gates.core.ps1')

$StatusDir = Join-Path $RepoRoot 'logs\launch-check'
$null = New-Item -ItemType Directory -Path $StatusDir -Force
$dateStamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$LogPath = Join-Path $StatusDir "launch-check-$dateStamp.log"
$transcript = New-Object System.Collections.Generic.List[string]
$gates = New-Object System.Collections.Generic.List[object]
$script:PassCount = 0
$script:FailCount = 0
$script:BlockedCount = 0
$script:SkipCount = 0

function Write-Gate {
    param(
        [string]$Category,
        [string]$Label,
        [string]$Status,
        [string]$Detail
    )
    $padded = $Label.PadRight(44)
    $line = "  [$Status] $padded  $Detail"
    Write-Host $line -ForegroundColor $(
        switch ($Status) {
            'FAIL' { 'Red' }
            'BLOCKED' { 'Yellow' }
            'SKIP' { 'DarkYellow' }
            default { 'Green' }
        }
    )
    $transcript.Add($line)

    $gate = [PSCustomObject]@{
        category = $Category
        name     = $Label
        status   = $Status
        detail   = $Detail
    }
    $gates.Add($gate)

    switch ($Status) {
        'PASS' { $script:PassCount++ }
        'FAIL' { $script:FailCount++ }
        'BLOCKED' { $script:BlockedCount++ }
        default { $script:SkipCount++ }
    }
}

function Write-Section {
    param([string]$Title)
    $line = "  [$Title]"
    Write-Host ''
    Write-Host $line -ForegroundColor Cyan
    $transcript.Add('')
    $transcript.Add($line)
}

# ---------- banner ----------

$banner = @(
    '',
    '============================================================',
    '  TruckOpti Launch-Readiness Check',
    "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    '============================================================',
    ''
)
foreach ($line in $banner) {
    Write-Host $line -ForegroundColor Cyan
    $transcript.Add($line)
}

# ---------- 1. Environment prerequisites ----------

Write-Section 'Environment prerequisites'

$nodeAvailable = Test-GateCommandAvailable 'node'
$npmAvailable = Test-GateCommandAvailable 'npm'
$gitAvailable = Test-GateCommandAvailable 'git'
$pythonAvailable = Test-GateCommandAvailable 'python'

$nodeVersion = ''
if ($nodeAvailable) { $nodeVersion = ((& node --version 2>&1 | Out-String).Trim()) }
$nodeDetail = if ($nodeAvailable -and $npmAvailable) { "node $nodeVersion; npm on PATH" } else { 'node/npm not on PATH; engineering gates will be blocked' }
Write-Gate 'Environment prerequisites' 'Node and npm' $(if ($nodeAvailable -and $npmAvailable) { 'PASS' } else { 'BLOCKED' }) $nodeDetail

Write-Gate 'Environment prerequisites' 'Git' $(if ($gitAvailable) { 'PASS' } else { 'BLOCKED' }) $(if ($gitAvailable) { ((& git --version 2>&1 | Out-String).Trim()) } else { 'git not on PATH; hygiene gates will be blocked' })

$pythonVersion = ''
if ($pythonAvailable) { $pythonVersion = ((& python --version 2>&1 | Out-String).Trim()) }
Write-Gate 'Environment prerequisites' 'Python tooling' $(if ($pythonAvailable) { 'PASS' } else { 'SKIP' }) $(if ($pythonAvailable) { $pythonVersion } else { 'python not on PATH; pip-audit and compileall will be skipped or blocked' })

$playwrightPackaged = $false
if ($nodeAvailable) {
    $playwrightPackaged = (Invoke-GateCommand -Label 'playwright probe' -WorkingDirectory $RepoRoot -Command { node -e "process.exit(require.resolve('playwright/package.json') ? 0 : 1)" }).ExitCode -eq 0
}
Write-Gate 'Environment prerequisites' 'Playwright packaging' $(if ($playwrightPackaged) { 'PASS' } else { 'SKIP' }) $(if ($playwrightPackaged) { 'playwright package resolvable from repo root' } else { 'playwright not installed; browser smokes must be run separately' })

# ---------- 2. Local engineering ----------

Write-Section 'Local engineering'

# Gate: Frontend build (tsc + vite)
$frontendDir = Join-Path $RepoRoot 'frontend'
if (-not (Test-Path (Join-Path $frontendDir 'package.json'))) {
    Write-Gate 'Local engineering' 'Frontend build (tsc + vite)' 'SKIP' 'no frontend/package.json'
}
elseif (-not $npmAvailable) {
    Write-Gate 'Local engineering' 'Frontend build (tsc + vite)' 'BLOCKED' 'npm not available'
}
else {
    $build = Invoke-GateCommand -Label 'Frontend build' -WorkingDirectory $frontendDir -Command { npm run build }
    if ($build.ExitCode -ne 0) {
        Write-Gate 'Local engineering' 'Frontend build (tsc + vite)' 'FAIL' "exit $($build.ExitCode) - $($build.Tail)"
    }
    else {
        $builtLine = 'build completed'
        foreach ($line in ($build.Tail -split ' \| ')) {
            if ($line -match 'built in') { $builtLine = $line.Trim(); break }
        }
        Write-Gate 'Local engineering' 'Frontend build (tsc + vite)' 'PASS' $builtLine
    }
}

# Gate helper: npm audit in a package directory
function Test-NpmAuditGate {
    param([string]$Label, [string]$PackageDir)
    $packageJson = Join-Path $PackageDir 'package.json'
    $packageLock = Join-Path $PackageDir 'package-lock.json'
    if (-not (Test-Path $packageJson)) {
        Write-Gate 'Local engineering' $Label 'SKIP' 'no package.json'
        return
    }
    if (-not (Test-Path $packageLock)) {
        Write-Gate 'Local engineering' $Label 'BLOCKED' 'package-lock.json missing; run npm install --package-lock-only'
        return
    }
    if (-not $npmAvailable) {
        Write-Gate 'Local engineering' $Label 'BLOCKED' 'npm not available'
        return
    }
    $audit = Invoke-GateCommand -Label $Label -WorkingDirectory $PackageDir -Command { npm audit --omit=dev }
    if ($audit.ExitCode -ne 0) {
        $vulnLine = 'vulnerabilities detected'
        foreach ($line in ($audit.Tail -split ' \| ')) {
            if ($line -match 'vulnerabilit') { $vulnLine = $line.Trim(); break }
        }
        Write-Gate 'Local engineering' $Label 'FAIL' $vulnLine
    }
    else {
        Write-Gate 'Local engineering' $Label 'PASS' '0 vulnerabilities'
    }
}

Test-NpmAuditGate -Label 'Root npm audit --omit=dev' -PackageDir $RepoRoot
Test-NpmAuditGate -Label 'Frontend npm audit --omit=dev' -PackageDir $frontendDir
Test-NpmAuditGate -Label 'apps/web npm audit' -PackageDir (Join-Path $RepoRoot 'apps\web')

# Gate: pip-audit
$requirementsFile = Join-Path $RepoRoot 'apps\web\requirements.txt'
if (-not (Test-Path $requirementsFile)) {
    Write-Gate 'Local engineering' 'pip-audit (requirements.txt)' 'SKIP' 'no apps/web/requirements.txt'
}
elseif (-not $pythonAvailable) {
    Write-Gate 'Local engineering' 'pip-audit (requirements.txt)' 'BLOCKED' 'python not available'
}
else {
    $pipAudit = Invoke-GateCommand -Label 'pip-audit' -WorkingDirectory $RepoRoot -Command { python -m pip_audit -r apps\web\requirements.txt }
    if ($pipAudit.ExitCode -ne 0) {
        if ($pipAudit.Tail -match 'No module named') {
            Write-Gate 'Local engineering' 'pip-audit (requirements.txt)' 'BLOCKED' 'pip-audit module not installed (python -m pip install pip-audit)'
        }
        else {
            $vulnLine = 'vulnerabilities detected (run with -VerboseOutput for details)'
            foreach ($line in ($pipAudit.Tail -split ' \| ')) {
                if ($line -match 'vulnerabilit') { $vulnLine = $line.Trim(); break }
            }
            Write-Gate 'Local engineering' 'pip-audit (requirements.txt)' 'FAIL' $vulnLine
        }
    }
    else {
        Write-Gate 'Local engineering' 'pip-audit (requirements.txt)' 'PASS' '0 known vulnerabilities'
    }
}

# Gate: Python compileall
$webAppDir = Join-Path $RepoRoot 'apps\web\app'
$runPy = Join-Path $RepoRoot 'apps\web\run.py'
$compileTargets = @()
if (Test-Path $webAppDir) { $compileTargets += $webAppDir }
if (Test-Path $runPy) { $compileTargets += $runPy }
if ($compileTargets.Count -eq 0) {
    Write-Gate 'Local engineering' 'Python compileall (apps/web)' 'SKIP' 'no Python sources'
}
elseif (-not $pythonAvailable) {
    Write-Gate 'Local engineering' 'Python compileall (apps/web)' 'BLOCKED' 'python not available'
}
else {
    $compile = Invoke-GateCommand -Label 'compileall' -WorkingDirectory $RepoRoot -Command { python -m compileall apps\web\app apps\web\run.py -q }
    if ($compile.ExitCode -ne 0) {
        Write-Gate 'Local engineering' 'Python compileall (apps/web)' 'FAIL' "exit $($compile.ExitCode) - $($compile.Tail)"
    }
    else {
        Write-Gate 'Local engineering' 'Python compileall (apps/web)' 'PASS' "$($compileTargets.Count) target(s) compiled clean"
    }
}

# Gate: Glue check
$glueScript = Join-Path $RepoRoot 'tools\glue-check.mjs'
if (-not (Test-Path $glueScript)) {
    Write-Gate 'Local engineering' 'Glue check' 'FAIL' 'tools/glue-check.mjs missing'
}
elseif (-not $nodeAvailable) {
    Write-Gate 'Local engineering' 'Glue check' 'BLOCKED' 'node not available'
}
else {
    $glue = Invoke-GateCommand -Label 'Glue check' -WorkingDirectory $RepoRoot -Command { node tools/glue-check.mjs }
    if ($glue.ExitCode -ne 0) {
        Write-Gate 'Local engineering' 'Glue check' 'FAIL' "exit $($glue.ExitCode) - $($glue.Tail)"
    }
    else {
        Write-Gate 'Local engineering' 'Glue check' 'PASS' '0 integration gaps'
    }
}

# Gate: Runtime error loop wiring
$rootScripts = Get-GateRootPackageScripts -RepoRoot $RepoRoot
$runtimeLoopMissing = @()
foreach ($scriptName in @('track-errors', 'test:hidden-errors')) {
    if (-not $rootScripts.ContainsKey($scriptName)) {
        $runtimeLoopMissing += "npm script $scriptName"
        continue
    }
    foreach ($target in (Get-GateNpmScriptPathTargets -ScriptValue $rootScripts[$scriptName])) {
        if (-not (Test-Path (Join-Path $RepoRoot $target))) { $runtimeLoopMissing += "$scriptName target $target" }
    }
}
Write-Gate 'Local engineering' 'Runtime error loop wiring' $(if ($runtimeLoopMissing.Count -eq 0) { 'PASS' } else { 'FAIL' }) $(if ($runtimeLoopMissing.Count -eq 0) { 'capture: npm run track-errors | resolve: npm run test:hidden-errors' } else { 'missing: ' + ($runtimeLoopMissing -join ', ') })

# ---------- 3. Workspace hygiene ----------

Write-Section 'Workspace hygiene'

# Gate: Canonical control plane
$canonicalGaps = Get-GateCanonicalControlPlaneGaps -RepoRoot $RepoRoot
Write-Gate 'Workspace hygiene' 'Canonical control plane' $(if ($canonicalGaps.Count -eq 0) { 'PASS' } else { 'FAIL' }) $(if ($canonicalGaps.Count -eq 0) { 'AGENTS.md, ARCHITECTURE.md, TASKS.md, agent-tasks/README.md present' } else { 'missing: ' + ($canonicalGaps -join ', ') })

# Gate: Task board integrity
$board = Get-GateTaskBoardReport -RepoRoot $RepoRoot
$boardIssues = @()
foreach ($issue in ($board.ParseErrors + $board.MissingBriefs + $board.MissingResults + $board.TerminalRowsWithoutResult)) { $boardIssues += $issue }
$boardDetail = if ($boardIssues.Count -eq 0) {
    "$($board.RowsFound) task rows; next recommended: $(if ($board.NextRecommended) { "$($board.NextRecommended.Id) [$($board.NextRecommended.Status)]" } else { 'none' })"
} else {
    ($boardIssues | Select-Object -First 5) -join '; '
}
Write-Gate 'Workspace hygiene' 'Task board integrity' $(if ($boardIssues.Count -eq 0) { 'PASS' } else { 'FAIL' }) $boardDetail
if ($VerboseOutput) {
    foreach ($statusEntry in $board.StatusCounts.PSObject.Properties) {
        $line = "    $($statusEntry.Name): $($statusEntry.Value)"
        Write-Host $line -ForegroundColor DarkGray
        $transcript.Add($line)
    }
}

# Gate: npm script file targets
$npmTargetGaps = Get-GateNpmScriptTargetGaps -RepoRoot $RepoRoot
Write-Gate 'Workspace hygiene' 'npm script file targets' $(if ($npmTargetGaps.Count -eq 0) { 'PASS' } else { 'FAIL' }) $(if ($npmTargetGaps.Count -eq 0) { 'every root npm script file target exists' } else { 'broken: ' + (($npmTargetGaps | Select-Object -First 5) -join '; ') })

# Gate: Git working tree cleanliness
$gitCleanDetail = 'git not available'
$gitCleanStatus = 'BLOCKED'
if ($gitAvailable) {
    $null = & git update-index --refresh 2>&1
    $porcelain = @(& git status --porcelain 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $gitCleanStatus = 'FAIL'
        $gitCleanDetail = "git status exited $LASTEXITCODE"
    }
    else {
        $blockingDirty = Get-GateBlockingDirtyPaths -StatusLines $porcelain
        if ($blockingDirty.Count -gt 0) {
            $gitCleanStatus = 'FAIL'
            $gitCleanDetail = "$($blockingDirty.Count) uncommitted/untracked path(s): " + (($blockingDirty | Select-Object -First 5) -join ' | ')
        }
        else {
            $gitCleanStatus = 'PASS'
            $gitCleanDetail = 'working tree clean'
        }
    }
}
Write-Gate 'Workspace hygiene' 'Git working tree cleanliness' $gitCleanStatus $gitCleanDetail

# Gate: Junk artifacts and merge markers
$hygieneFindings = Get-GateHygieneFindings -RepoRoot $RepoRoot
if ($hygieneFindings.Junk.Count -gt 0) {
    Write-Gate 'Workspace hygiene' 'Junk artifacts' 'FAIL' ("junk artifact: " + (($hygieneFindings.Junk | Select-Object -First 3) -join ' | '))
}
else {
    Write-Gate 'Workspace hygiene' 'Junk artifacts' 'PASS' 'no junk artifacts'
}
if ($hygieneFindings.MergeMarkers.Count -gt 0) {
    Write-Gate 'Workspace hygiene' 'Merge conflict markers' 'FAIL' ("marker: " + (($hygieneFindings.MergeMarkers | Select-Object -First 3) -join ' | '))
}
else {
    Write-Gate 'Workspace hygiene' 'Merge conflict markers' 'PASS' 'no merge markers in active code'
}

# ---------- 4. Owner-gated production ----------

Write-Section 'Owner-gated production'

$herokuAvailable = Test-GateCommandAvailable 'heroku'
$herokuAuthed = $false
if ($herokuAvailable) {
    $whoami = Invoke-GateCommand -Label 'heroku whoami' -WorkingDirectory $RepoRoot -Command { heroku whoami }
    $herokuAuthed = ($whoami.ExitCode -eq 0)
}
if (-not $herokuAvailable) {
    Write-Gate 'Owner-gated production' 'Heroku CLI authentication' 'BLOCKED' 'heroku CLI not installed (owner-gated)'
}
elseif (-not $herokuAuthed) {
    Write-Gate 'Owner-gated production' 'Heroku CLI authentication' 'BLOCKED' 'heroku CLI not authenticated (owner-gated)'
}
else {
    Write-Gate 'Owner-gated production' 'Heroku CLI authentication' 'PASS' 'authenticated'
}

$prodConfigScript = Join-Path $RepoRoot 'scripts\production_config_audit.mjs'
if (-not $herokuAuthed) {
    Write-Gate 'Owner-gated production' 'Production config audit' 'BLOCKED' 'requires authenticated heroku CLI (owner-gated)'
}
elseif (-not (Test-Path $prodConfigScript)) {
    Write-Gate 'Owner-gated production' 'Production config audit' 'BLOCKED' 'scripts/production_config_audit.mjs not present in this checkout'
}
else {
    $audit = Invoke-GateCommand -Label 'Production config audit' -WorkingDirectory $RepoRoot -Command { node scripts/production_config_audit.mjs }
    if ($audit.ExitCode -ne 0) {
        Write-Gate 'Owner-gated production' 'Production config audit' 'FAIL' "exit $($audit.ExitCode) - $($audit.Tail)"
    }
    else {
        Write-Gate 'Owner-gated production' 'Production config audit' 'PASS' 'report at logs/production_config_audit.json'
    }
}

$credentialState = Get-GateSupabaseCredentialState -RepoRoot $RepoRoot
if ($credentialState -eq 'present') {
    Write-Gate 'Owner-gated production' 'Live Supabase credentials' 'PASS' 'non-placeholder VITE_SUPABASE_URL present (presence-only; live proof remains owner-executed)'
}
else {
    Write-Gate 'Owner-gated production' 'Live Supabase credentials' 'BLOCKED' 'no non-placeholder VITE_SUPABASE_URL in local env files (owner-gated)'
}

# ---------- summary ----------

$verdict = Get-GateVerdict -PassCount $script:PassCount -FailCount $script:FailCount -BlockedCount $script:BlockedCount -SkipCount $script:SkipCount
$total = $script:PassCount + $script:FailCount + $script:BlockedCount + $script:SkipCount

$summaryLines = @(
    '',
    '============================================================',
    "  Categories: environment | local engineering | workspace hygiene | owner-gated production",
    "  RESULT: $total GATE(S) EVALUATED - $($script:PassCount) passed, $($script:FailCount) failed, $($script:BlockedCount) blocked, $($script:SkipCount) skipped"
)

switch ($verdict.Label) {
    'FAILED' {
        $summaryLines += "  VERDICT: $($script:FailCount) GATE(S) FAILED - resolve the failed gates above"
        $verdictColor = 'Red'
    }
    'PRODUCTION_READY' {
        $summaryLines += '  VERDICT: ALL GATES PASSED - PRODUCTION-READY'
        $verdictColor = 'Green'
    }
    default {
        $summaryLines += '  VERDICT: LOCAL GATES PASSED - PRODUCTION NOT PROVEN (blocked/skipped gates above are environment or owner-gated)'
        $verdictColor = 'Yellow'
    }
}
$summaryLines += '============================================================'
$summaryLines += ''
foreach ($line in $summaryLines) {
    $color = if ($line -like '  VERDICT*') { $verdictColor } else { 'Cyan' }
    Write-Host $line -ForegroundColor $color
    $transcript.Add($line)
}

# Flush the transcript before recording the status that points at it, so the
# status JSON's log reference always resolves.
[System.IO.File]::WriteAllLines($LogPath, $transcript)

# Retain only the newest 10 transcript logs.
Get-ChildItem -Path $StatusDir -Filter 'launch-check-*.log' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 10 |
    ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

$statusReport = [PSCustomObject]@{
    generatedAt     = (Get-Date).ToString('o')
    state           = $(if ($script:FailCount -gt 0) { 'failed' } else { 'passed' })
    verdict         = $verdict.Label
    productionReady = $verdict.ProductionReady
    pass            = $script:PassCount
    fail            = $script:FailCount
    blocked         = $script:BlockedCount
    skip            = $script:SkipCount
    log             = ('logs/launch-check/launch-check-' + $dateStamp + '.log')
    gates           = $gates
}
$statusPath = Join-Path $StatusDir 'launch-check-status.json'
[System.IO.File]::WriteAllText($statusPath, ($statusReport | ConvertTo-Json -Depth 5))

exit $verdict.ExitCode
