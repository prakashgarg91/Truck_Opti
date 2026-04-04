# ============================================================
# TruckOpti — Local Launch-Readiness Verification
# ============================================================
# Repeatable gate-check script for Windows/PowerShell.
# Run from repo root:  .\scripts\launch-readiness.ps1
# Or via npm:          npm run launch-check
#
# Gates checked (all must PASS for a green launch):
#   1. Frontend TypeScript build (tsc + vite build)
#   2. Root npm audit --omit=dev
#   3. Frontend npm audit --omit=dev
#   4. apps/web npm audit
#   5. pip-audit on apps/web/requirements.txt
#   6. Python compileall on apps/web/app and apps/web/run.py
#   7. Git working tree cleanliness (no uncommitted/unignored changes)
#   8. Tree hygiene (required doc, no junk artifacts, no merge markers in active code/config files)
# ============================================================

param(
    [switch]$VerboseOutput
)

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AllowedRuntimeDirtyFiles = @(
    '0.dev-matrix/STATE.md',
    '0.dev-matrix/TASK.md',
    '0.dev-matrix/DISCUSSION.md',
    '0.dev-matrix/AI-HANDOFF.md',
    '0.dev-matrix/LAST-CLOSEOUT.md'
)
$AllowedRuntimeDirtyPrefixes = @(
    '0.dev-matrix/closeout-logs/',
    '0.dev-matrix/test-reports/'
)

# ---------- helpers ----------

$script:PassCount  = 0
$script:FailCount  = 0
$script:SkipCount  = 0

function Write-Gate {
    param(
        [string]$Label,
        [string]$Status,
        [string]$Detail
    )
    $icon  = 'OK'
    $color = 'Green'
    if ($Status -eq 'FAIL') { $icon = 'FAIL'; $color = 'Red' }
    if ($Status -eq 'SKIP') { $icon = 'SKIP'; $color = 'Yellow' }

    $padded = $Label.PadRight(48)
    $line   = "  [$icon] $padded  $Detail"
    Write-Host $line -ForegroundColor $color

    if ($Status -eq 'PASS') { $script:PassCount++ }
    elseif ($Status -eq 'FAIL') { $script:FailCount++ }
    else { $script:SkipCount++ }
}

function ConvertTo-RepoRelativePath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    return ($Path -replace '\\', '/').Trim()
}

function Get-StatusPath {
    param([string]$StatusLine)
    if ([string]::IsNullOrWhiteSpace($StatusLine) -or $StatusLine.Length -lt 4) { return $null }
    $path = $StatusLine.Substring(3).Trim()
    if ($path -match ' -> ') {
        $path = ($path -split ' -> ')[-1].Trim()
    }
    return ConvertTo-RepoRelativePath $path
}

function Test-IsAllowedRuntimeDirtyPath {
    param([string]$RelativePath)
    if ([string]::IsNullOrWhiteSpace($RelativePath)) { return $false }
    if ($AllowedRuntimeDirtyFiles -contains $RelativePath) { return $true }
    foreach ($prefix in $AllowedRuntimeDirtyPrefixes) {
        if ($RelativePath -like "$prefix*") { return $true }
    }
    return $false
}

# ---------- banner ----------

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  TruckOpti Launch-Readiness Check' -ForegroundColor Cyan
$dateStamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Write-Host "  $dateStamp" -ForegroundColor DarkGray
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# ---------- Gate 1: Frontend build ----------

Write-Host '  Gate 1: Frontend build (tsc + vite)' -ForegroundColor Cyan
$frontendDir = Join-Path $RepoRoot 'frontend'
Push-Location $frontendDir
try {
    $buildOutput = npm run build 2>&1
    $buildExit   = $LASTEXITCODE
    if ($buildExit -ne 0) {
        $tail = ($buildOutput | Select-Object -Last 3) -join ' | '
        Write-Gate 'Frontend build (tsc + vite)' 'FAIL' "exit $buildExit - $tail"
    } else {
        $builtLine = ''
        foreach ($line in $buildOutput) {
            if ($line -match 'built in') { $builtLine = $line; break }
        }
        if ($VerboseOutput) {
            foreach ($item in $buildOutput) {
                Write-Host "    $item" -ForegroundColor DarkGray
            }
        }
        Write-Gate 'Frontend build (tsc + vite)' 'PASS' $builtLine
    }
} finally {
    Pop-Location
}

# ---------- Gate 2: Root npm audit ----------

Write-Host '  Gate 2: Root npm audit --omit=dev' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    $auditOutput = npm audit --omit=dev 2>&1
    $auditExit   = $LASTEXITCODE
    if ($auditExit -ne 0) {
        $vulnLine = ''
        foreach ($line in $auditOutput) {
            if ($line -match 'vulnerabilit') { $vulnLine = $line; break }
        }
        Write-Gate 'Root npm audit --omit=dev' 'FAIL' $vulnLine
    } else {
        Write-Gate 'Root npm audit --omit=dev' 'PASS' '0 vulnerabilities'
    }
} finally {
    Pop-Location
}

# ---------- Gate 3: Frontend npm audit ----------

Write-Host '  Gate 3: Frontend npm audit --omit=dev' -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot 'frontend')
try {
    $auditOutput = npm audit --omit=dev 2>&1
    $auditExit   = $LASTEXITCODE
    if ($auditExit -ne 0) {
        $vulnLine = ''
        foreach ($line in $auditOutput) {
            if ($line -match 'vulnerabilit') { $vulnLine = $line; break }
        }
        Write-Gate 'Frontend npm audit --omit=dev' 'FAIL' $vulnLine
    } else {
        Write-Gate 'Frontend npm audit --omit=dev' 'PASS' '0 vulnerabilities'
    }
} finally {
    Pop-Location
}

# ---------- Gate 4: apps/web npm audit ----------

Write-Host '  Gate 4: apps/web npm audit' -ForegroundColor Cyan
$webPkg = Join-Path $RepoRoot 'apps\web'
$webPkgJson = Join-Path $webPkg 'package.json'
if (-not (Test-Path $webPkgJson)) {
    Write-Gate 'apps/web npm audit' 'SKIP' 'no package.json'
} else {
    Push-Location $webPkg
    try {
        $auditOutput = npm audit 2>&1
        $auditExit   = $LASTEXITCODE
        if ($auditExit -ne 0) {
            $vulnLine = ''
            foreach ($line in $auditOutput) {
                if ($line -match 'vulnerabilit') { $vulnLine = $line; break }
            }
            Write-Gate 'apps/web npm audit' 'FAIL' $vulnLine
        } else {
            Write-Gate 'apps/web npm audit' 'PASS' '0 vulnerabilities'
        }
    } finally {
        Pop-Location
    }
}

# ---------- Gate 5: pip-audit ----------

Write-Host '  Gate 5: pip-audit (apps/web/requirements.txt)' -ForegroundColor Cyan
$reqFile = Join-Path $RepoRoot 'apps\web\requirements.txt'
if (-not (Test-Path $reqFile)) {
    Write-Gate 'pip-audit (requirements.txt)' 'SKIP' 'requirements.txt not found'
} else {
    $pipOutput = python -m pip_audit -r $reqFile 2>&1
    $pipExit   = $LASTEXITCODE
    if ($pipExit -ne 0) {
        $vulnLine = ''
        foreach ($line in $pipOutput) {
            if ($line -match 'vulnerabilit') { $vulnLine = $line; break }
        }
        if ($VerboseOutput) {
            foreach ($item in $pipOutput) {
                Write-Host "    $item" -ForegroundColor DarkGray
            }
        }
        if ($vulnLine -eq '') { $vulnLine = 'vulnerabilities detected (run with -VerboseOutput for details)' }
        Write-Gate 'pip-audit (requirements.txt)' 'FAIL' $vulnLine
    } else {
        Write-Gate 'pip-audit (requirements.txt)' 'PASS' '0 known vulnerabilities'
    }
}

# ---------- Gate 6: Python compileall ----------

Write-Host '  Gate 6: Python compileall (apps/web)' -ForegroundColor Cyan
$webAppDir = Join-Path $RepoRoot 'apps\web\app'
$runPy     = Join-Path $RepoRoot 'apps\web\run.py'
$compileTargets = @()
if (Test-Path $webAppDir) { $compileTargets += $webAppDir }
if (Test-Path $runPy)     { $compileTargets += $runPy }
if ($compileTargets.Count -eq 0) {
    Write-Gate 'Python compileall (apps/web)' 'SKIP' 'no Python sources'
} else {
    $compOutput = python -m compileall $compileTargets -q 2>&1
    $compExit   = $LASTEXITCODE
    $errors = @()
    foreach ($line in $compOutput) {
        if ($line -match 'SyntaxError|Error') { $errors += $line }
    }
    if ($compExit -ne 0 -or $errors.Count -gt 0) {
        $errDetail = ''
        if ($errors.Count -gt 0) {
            $errDetail = ($errors | Select-Object -First 3) -join '; '
        } else {
            $errDetail = "exit $compExit"
        }
        Write-Gate 'Python compileall (apps/web)' 'FAIL' $errDetail
    } else {
        $targetCount = $compileTargets.Count
        Write-Gate 'Python compileall (apps/web)' 'PASS' "$targetCount target(s) compiled clean"
    }
}

# ---------- Gate 7a: Deep-scan ----------

Write-Host '  Gate 7a: Deep error scan' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    node 0.dev-matrix/deep-error-scanner.mjs *> $null
    $scanExit = $LASTEXITCODE
    if ($scanExit -ne 0) {
        Write-Gate 'Deep error scan' 'FAIL' "deep-error-scanner exited $scanExit"
    } else {
        Write-Gate 'Deep error scan' 'PASS' '0 errors found'
    }
} finally {
    Pop-Location
}

# ---------- Gate 7b: Glue check ----------

Write-Host '  Gate 7b: Glue check' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    node tools/glue-check.mjs *> $null
    $glueExit = $LASTEXITCODE
    if ($glueExit -ne 0) {
        Write-Gate 'Glue check' 'FAIL' "glue-check exited $glueExit"
    } else {
        Write-Gate 'Glue check' 'PASS' '0 integration gaps'
    }
} finally {
    Pop-Location
}

# ---------- Gate 7: Git cleanliness ----------

Write-Host '  Gate 7: Git working tree cleanliness' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    # Refresh the git index so .gitignore changes take effect for status
    $null = git update-index --refresh 2>&1

    # Collect porcelain status (short format)
    $gitStatusOutput = git status --porcelain 2>&1
    $gitStatusExit   = $LASTEXITCODE

    if ($gitStatusExit -ne 0) {
        Write-Gate 'Git working tree cleanliness' 'FAIL' "git status exited $gitStatusExit"
    } else {
        $dirtyPaths = @()
        foreach ($line in $gitStatusOutput) {
            if ($line -match '^\s*$') { continue }
            if ($line -match '^!!') { continue }
            $path = Get-StatusPath $line
            if ($path) { $dirtyPaths += $path }
        }

        $blockingDirty = @($dirtyPaths | Where-Object { -not (Test-IsAllowedRuntimeDirtyPath $_) } | Select-Object -Unique)
        if ($blockingDirty.Count -gt 0) {
            $sample = ($blockingDirty | Select-Object -First 5) -join ' | '
            $count  = $blockingDirty.Count
            Write-Gate 'Git working tree cleanliness' 'FAIL' "$count dirty path(s): $sample"
        } elseif ($dirtyPaths.Count -gt 0) {
            Write-Gate 'Git working tree cleanliness' 'PASS' 'only runtime handoff/evidence files are dirty'
        } else {
            Write-Gate 'Git working tree cleanliness' 'PASS' 'working tree clean'
        }
    }
} finally {
    Pop-Location
}

# ---------- Gate 8: Tree hygiene ----------

Write-Host '  Gate 8: Tree hygiene' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    $requiredDocs = @('0.dev-matrix\TREE-HYGIENE.md', '0.dev-matrix\DOCUMENTATION-GOVERNANCE.md', '0.dev-matrix\LAUNCH_CHECKLIST.md', '0.dev-matrix\CLOSING-DAY-HOOK.md', '0.dev-matrix\AI-HANDOFF.md')
    $missingDocs = $requiredDocs | Where-Object { -not (Test-Path (Join-Path $RepoRoot $_)) }
    $requiredStandards = @(
        '0.dev-matrix\standards\CLOSING-DAY-STANDARD.md',
        '0.dev-matrix\standards\DEFINITION-OF-DONE.md',
        '0.dev-matrix\standards\DOCUMENTATION-GOVERNANCE-STANDARD.md',
        '0.dev-matrix\standards\DEEP-VERIFICATION-STANDARD.md',
        '0.dev-matrix\standards\OPERATIONAL-PROOF-STANDARD.md',
        '0.dev-matrix\standards\ROLLOUT-RULES.md',
        '0.dev-matrix\standards\TREE-HYGIENE-STANDARD.md',
        '0.dev-matrix\standards\VULNERABILITY-RESPONSE-STANDARD.md'
    )
    $missingStandards = $requiredStandards | Where-Object { -not (Test-Path (Join-Path $RepoRoot $_)) }
    $junkNames = @('nul', '.DS_Store', 'Thumbs.db', 'Desktop.ini')
    $junkPaths = @(
        Get-ChildItem -Path $RepoRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
            Where-Object { $junkNames -contains $_.Name } |
            Select-Object -ExpandProperty FullName
    )
    $scanFiles = Get-ChildItem -Path $RepoRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch '\\(node_modules|dist|coverage|logs|playwright-report|test-results|venv|\.venv|docs\\archive|0\.dev-matrix\\(test-reports|archive|backup|closeout-logs|error-logs)|\.git)\\' -and
            $_.Extension -in @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.json', '.yml', '.yaml', '.toml', '.ini', '.env', '.ps1', '.sh', '.bat', '.md', '.html', '.css', '.sql', '.dockerfile')
        }
    $conflictHit = $scanFiles | Select-String -Pattern '^(<{7}|={7}|>{7})( .*)?$' | Select-Object -First 1
    $treeClean = ($junkPaths.Count -eq 0) -and ($null -eq $conflictHit)

    if ($missingStandards.Count -eq 0) {
        Write-Gate 'Standards presence' 'PASS' 'required standards present'
    } else {
        Write-Gate 'Standards presence' 'FAIL' ('missing: ' + ($missingStandards -join ', '))
    }

    if ($missingDocs.Count -eq 0) {
        Write-Gate 'Runtime docs' 'PASS' 'tree hygiene, launch checklist, closing-day hook, documentation governance, and handoff present'
    } else {
        Write-Gate 'Runtime docs' 'FAIL' ('missing: ' + ($missingDocs -join ', '))
    }

    $handoffFile = Join-Path $RepoRoot '0.dev-matrix\AI-HANDOFF.md'
    if (Test-Path $handoffFile) {
        $handoffContent = Get-Content $handoffFile -Raw
        if ($handoffContent -match 'Operational proof:') {
            Write-Gate 'Operational proof contract' 'PASS' 'AI-HANDOFF includes the Operational proof handoff label'
        } else {
            Write-Gate 'Operational proof contract' 'FAIL' 'AI-HANDOFF missing Operational proof label in the handoff contract'
        }
    } else {
        Write-Gate 'Operational proof contract' 'FAIL' 'AI-HANDOFF.md not found'
    }

    $docGovFile = Join-Path $RepoRoot '0.dev-matrix\DOCUMENTATION-GOVERNANCE.md'
    if (Test-Path $docGovFile) {
        $docGovContent = Get-Content $docGovFile -Raw
        $docGovOk = ($docGovContent -match 'Approved Documentation Zones') -and ($docGovContent -match 'AI Rules')
        $docGovDetail = if ($docGovOk) { 'approved zones and AI rules recorded' } else { 'missing required sections in DOCUMENTATION-GOVERNANCE.md' }
        Write-Gate 'Documentation governance' ($(if ($docGovOk) { 'PASS' } else { 'FAIL' })) $docGovDetail
    } else {
        Write-Gate 'Documentation governance' 'FAIL' 'DOCUMENTATION-GOVERNANCE.md not found'
    }

    if ($treeClean) {
        Write-Gate 'Tree hygiene' 'PASS' 'active code tree is clean'
    } elseif ($junkPaths.Count -gt 0) {
        Write-Gate 'Tree hygiene' 'FAIL' ("junk artifact: " + $junkPaths[0])
    } else {
        Write-Gate 'Tree hygiene' 'FAIL' ("merge marker: " + $conflictHit.Path + ':' + $conflictHit.LineNumber)
    }

    # Anti-hallucination: STATE.md freshness
    $stateFile = Join-Path $RepoRoot '0.dev-matrix\STATE.md'
    if (Test-Path $stateFile) {
        $stateLastWrite = (Get-Item $stateFile).LastWriteTime
        $staleDays = ((Get-Date) - $stateLastWrite).Days
        if ($staleDays -gt 7) {
            Write-Gate 'State freshness' 'FAIL' "STATE.md last modified $staleDays days ago (stale >7 days)"
        } else {
            Write-Gate 'State freshness' 'PASS' "STATE.md modified $staleDays day(s) ago"
        }
    } else {
        Write-Gate 'State freshness' 'FAIL' 'STATE.md not found'
    }
} finally {
    Pop-Location
}

# ---------- summary ----------

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
$total = $script:PassCount + $script:FailCount + $script:SkipCount
if ($script:FailCount -eq 0) {
    $p = $script:PassCount
    Write-Host "  RESULT: ALL GATES PASSED ($p/$total)" -ForegroundColor Green
} else {
    $f = $script:FailCount
    $p = $script:PassCount
    $s = $script:SkipCount
    Write-Host "  RESULT: $f GATE(S) FAILED ($p passed, $s skipped)" -ForegroundColor Red
}
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# Exit code for CI/CD consumption
exit $script:FailCount
