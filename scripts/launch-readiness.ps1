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
# ============================================================

param(
    [switch]$VerboseOutput
)

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

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
