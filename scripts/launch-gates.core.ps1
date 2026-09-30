# ============================================================
# launch-gates.core.ps1 - shared pure helpers for the canonical
# launch-readiness and close-day gates (TO-121).
# ============================================================
# Dot-source only; performs no work on load. Every function is
# parameterized so tests can run it against fixture repositories.
# Status vocabulary used by all gates:
#   PASS    - check ran and succeeded
#   FAIL    - check ran and failed (exit 1)
#   SKIP    - not applicable in this checkout (never blocks)
#   BLOCKED - mandatory gate that could not run (missing tool,
#             missing owner-gated credential). Always prevents a
#             production-ready verdict.
# ============================================================

function ConvertTo-GateRelativePath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    return ($Path -replace '\\', '/').Trim()
}

function Get-GateStatusPath {
    param([string]$StatusLine)
    if ([string]::IsNullOrWhiteSpace($StatusLine) -or $StatusLine.Length -lt 4) { return $null }
    $path = $StatusLine.Substring(3).Trim()
    if ($path -match ' -> ') {
        $path = ($path -split ' -> ')[-1].Trim()
    }
    return ConvertTo-GateRelativePath $path
}

function Get-GateBlockingDirtyPaths {
    param(
        [string[]]$StatusLines,
        [string[]]$AllowedPaths = @()
    )
    $dirty = @()
    foreach ($line in $StatusLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -match '^!!') { continue }  # ignored files never appear without --ignored; keep the guard anyway
        $path = Get-GateStatusPath $line
        if ($path) { $dirty += $path }
    }
    $unique = @($dirty | Select-Object -Unique)
    $blocking = @()
    foreach ($path in $unique) {
        $allowed = $false
        foreach ($allowedPath in $AllowedPaths) {
            if ($allowedPath -notmatch '[^/]$') {
                # prefix allowance (directory form, e.g. 'logs/')
                if ($path -like "$allowedPath*") { $allowed = $true; break }
            }
            elseif ($path -eq $allowedPath) { $allowed = $true; break }
        }
        if (-not $allowed) { $blocking += $path }
    }
    return @($blocking)
}

function Test-GateCommandAvailable {
    param([string]$CommandName)
    if ([string]::IsNullOrWhiteSpace($CommandName)) { return $false }
    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Test-GatePlaceholderValue {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
    $trimmed = $Value.Trim()
    if ($trimmed -match '(?i)replace[_-]?me|placeholder|changeme|change[-_]me|your[-_]|fixme|todo|tbd|xxx+') { return $true }
    return $false
}

function Get-GateCanonicalControlPlaneGaps {
    param([string]$RepoRoot)
    $required = @('AGENTS.md', 'ARCHITECTURE.md', 'TASKS.md', 'agent-tasks/README.md')
    return @($required | Where-Object { -not (Test-Path (Join-Path $RepoRoot $_)) })
}

function Get-GateMarkdownRefs {
    param([string]$Cell)
    if ([string]::IsNullOrWhiteSpace($Cell)) { return @() }
    $refs = @()
    foreach ($match in [regex]::Matches($Cell, '`([^`]+)`')) {
        $token = $match.Groups[1].Value.Trim()
        if ($token -match '^[\w][\w./\\ -]*\.(md|mjs|cjs|js|ps1|py|sh|txt|json)$') {
            $refs += ($token -replace '\\', '/')
        }
    }
    return @($refs | Select-Object -Unique)
}

function Get-GateTaskBoardReport {
    # Parses the canonical TASKS.md board: verifies brief/result references
    # exist on disk, counts statuses, and names the next recommended task.
    param([string]$RepoRoot)

    $report = [PSCustomObject]@{
        RowsFound                 = 0
        StatusCounts              = [PSCustomObject]@{}
        MissingBriefs             = @()
        MissingResults            = @()
        TerminalRowsWithoutResult = @()
        NextRecommended           = $null
        ParseErrors               = @()
    }

    $tasksPath = Join-Path $RepoRoot 'TASKS.md'
    if (-not (Test-Path $tasksPath)) {
        $report.ParseErrors = @('TASKS.md not found')
        return $report
    }

    $statusCounts = @{}
    $readyCandidate = $null
    $progressCandidate = $null

    foreach ($line in (Get-Content $tasksPath)) {
        if ($line -notmatch '^\s*\|\s*([A-Za-z][A-Za-z0-9-]*)\s*\|') { continue }
        $cells = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
        if ($cells.Count -lt 6) { continue }
        $id = $cells[0]
        if ($id -eq 'ID') { continue }

        $status = $cells[2]
        $briefCell = $cells[4]
        $resultCell = $cells[5]

        $report.RowsFound++
        if (-not $statusCounts.ContainsKey($status)) { $statusCounts[$status] = 0 }
        $statusCounts[$status]++

        $briefRefs = @(Get-GateMarkdownRefs $briefCell)
        $resultRefs = @(Get-GateMarkdownRefs $resultCell)

        foreach ($ref in $briefRefs) {
            if (-not (Test-Path (Join-Path $RepoRoot $ref))) { $report.MissingBriefs += "$id`: $ref" }
        }
        foreach ($ref in $resultRefs) {
            if (-not (Test-Path (Join-Path $RepoRoot $ref))) { $report.MissingResults += "$id`: $ref" }
        }
        if ($status -match '^(DONE|BLOCKED)' -and $resultRefs.Count -eq 0) {
            $report.TerminalRowsWithoutResult += $id
        }

        if ($null -eq $readyCandidate -and $status -like 'READY*' -and $status -notmatch 'OWNER_BLOCKED') {
            $readyCandidate = [PSCustomObject]@{
                Id     = $id
                Status = $status
                Brief  = $(if ($briefRefs.Count -gt 0) { $briefRefs[0] } else { $null })
            }
        }
        if ($null -eq $progressCandidate -and $status -like 'IN_PROGRESS*') {
            $progressCandidate = [PSCustomObject]@{
                Id     = $id
                Status = $status
                Brief  = $(if ($briefRefs.Count -gt 0) { $briefRefs[0] } else { $null })
            }
        }
    }

    $orderedCounts = [ordered]@{}
    foreach ($entry in ($statusCounts.GetEnumerator() | Sort-Object -Property Name)) {
        $orderedCounts[$entry.Key] = $entry.Value
    }
    $report.StatusCounts = [PSCustomObject]$orderedCounts

    if ($null -ne $readyCandidate) { $report.NextRecommended = $readyCandidate }
    elseif ($null -ne $progressCandidate) { $report.NextRecommended = $progressCandidate }

    return $report
}

function Get-GateNpmScriptPathTargets {
    # Extracts repo file references (path-like tokens) from one npm script value.
    param([string]$ScriptValue)
    if ([string]::IsNullOrWhiteSpace($ScriptValue)) { return @() }
    $targets = @()
    foreach ($match in [regex]::Matches($ScriptValue, '[A-Za-z0-9._-]+[/\\][A-Za-z0-9._-]+\.(mjs|cjs|js|ps1|py|sh|md)')) {
        $targets += ($match.Value -replace '\\', '/')
    }
    foreach ($match in [regex]::Matches($ScriptValue, '(?<![\w./-])[A-Za-z0-9._-]+\.(mjs|cjs|js|ps1|py|sh)(?![\w.-])')) {
        $targets += ($match.Value -replace '\\', '/')
    }
    return @($targets | Select-Object -Unique)
}

function Get-GateRootPackageScripts {
    # Returns a hashtable of the root package.json scripts (name -> command).
    param([string]$RepoRoot)
    $scripts = @{}
    $packageJsonPath = Join-Path $RepoRoot 'package.json'
    if (-not (Test-Path $packageJsonPath)) { return $scripts }
    try {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    }
    catch {
        return $scripts
    }
    if ($packageJson.scripts) {
        foreach ($property in $packageJson.scripts.PSObject.Properties) {
            $scripts[$property.Name] = [string]$property.Value
        }
    }
    return $scripts
}

function Get-GateNpmScriptTargetGaps {
    # Verifies every root package.json script's file target exists on disk.
    # Guards against resurrecting broken references (e.g. the retired
    # 0.dev-matrix/deep-error-scanner.mjs deep-scan command).
    param([string]$RepoRoot)

    $packageJsonPath = Join-Path $RepoRoot 'package.json'
    if (-not (Test-Path $packageJsonPath)) { return @('package.json not found') }

    try {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    }
    catch {
        return @('package.json is not valid JSON')
    }
    if (-not $packageJson.scripts) { return @() }

    $gaps = @()
    foreach ($property in $packageJson.scripts.PSObject.Properties) {
        foreach ($target in (Get-GateNpmScriptPathTargets -ScriptValue ([string]$property.Value))) {
            if (-not (Test-Path (Join-Path $RepoRoot $target))) {
                $gaps += "$($property.Name): $target"
            }
        }
    }
    return @($gaps | Select-Object -Unique)
}

function Get-GateHygieneFindings {
    # Junk artifacts and merge-conflict markers in active code/config/doc
    # files. Walks the tree manually, pruning build/dependency/log/retired
    # directories so the scan stays fast and free of false positives from
    # ignored evidence folders.
    param([string]$RepoRoot)

    $prunePattern = '\\(node_modules|\.git|dist|coverage|release|venv|\.venv|logs|closeout-logs|test-reports|test-results|playwright-report|graphify-out|\.codegraph|\.playwright-mcp|\.stitch-mcp|__pycache__|0\.dev-matrix|archive)\\'
    $junkNames = @('nul', '.DS_Store', 'Thumbs.db', 'Desktop.ini')
    $scanExtensions = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.json', '.yml', '.yaml', '.toml', '.ini', '.env', '.ps1', '.sh', '.bat', '.md', '.html', '.css', '.sql')

    $junk = @()
    $markers = @()

    $stack = New-Object System.Collections.Stack
    $stack.Push((Get-Item $RepoRoot).FullName)
    while ($stack.Count -gt 0) {
        $dir = $stack.Pop()
        $children = Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue
        foreach ($item in $children) {
            $full = $item.FullName
            if ($item.PSIsContainer) {
                if ($full -notmatch $prunePattern) { $stack.Push($full) }
                continue
            }
            if ($junkNames -contains $item.Name) { $junk += $full; continue }
            if ($scanExtensions -notcontains $item.Extension) { continue }
            if ($full -match $prunePattern) { continue }
            try {
                $content = [System.IO.File]::ReadAllText($full)
                if ($content -match '(?m)^(<{7}|={7}|>{7})( .*)?$') { $markers += $full }
            }
            catch { continue }
        }
    }

    return [PSCustomObject]@{
        Junk         = @($junk)
        MergeMarkers = @($markers)
    }
}

function Get-GateSupabaseCredentialState {
    # Presence-only probe for a non-placeholder production Supabase URL in
    # local env files. Never returns the value itself.
    param([string]$RepoRoot)

    $candidates = @(
        'frontend/.env.production',
        'frontend/.env.local',
        'frontend/.env',
        '.env.production',
        '.env.local',
        '.env',
        'apps/web/.env'
    )
    foreach ($relative in $candidates) {
        $path = Join-Path $RepoRoot $relative
        if (-not (Test-Path $path)) { continue }
        foreach ($line in (Get-Content $path)) {
            if ($line -match '^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$') {
                $value = $Matches[1].Trim().Trim('"').Trim("'")
                if (-not (Test-GatePlaceholderValue -Value $value)) { return 'present' }
            }
        }
    }
    return 'absent'
}

function Get-GateMisplacedDocs {
    # Newly added or untracked markdown/text documents must live in approved
    # zones or be canonical root documents.
    param([string[]]$StatusLines)
    $approvedPrefixes = @('docs/', 'adr/', 'design/', 'specs/', 'agent-tasks/', 'agent-results/', 'scripts/', 'closeout-logs/')
    $canonicalRootPatterns = @(
        'README*.md', 'AGENTS*.md', 'ARCHITECTURE*.md', 'TASKS*.md', 'CHANGELOG*.md',
        'CONTRIBUTING*.md', 'SECURITY*.md', 'LICENSE*', 'API*.md', 'DEPLOYMENT*.md', 'OPERATIONS*.md'
    )
    $newDocPaths = @(
        $StatusLines |
            Where-Object { $_ -match '^(A.|.A|\?\?)\s' } |
            ForEach-Object { Get-GateStatusPath $_ } |
            Where-Object { $_ -and $_ -match '\.(md|txt|rst)$' } |
            Select-Object -Unique
    )
    $misplaced = @()
    foreach ($path in $newDocPaths) {
        $fileName = ($path -split '/')[-1]
        $isCanonicalRoot = ($path -notmatch '/') -and (($canonicalRootPatterns | Where-Object { $fileName -like $_ }).Count -gt 0)
        $isApproved = $isCanonicalRoot
        if (-not $isApproved) {
            foreach ($prefix in $approvedPrefixes) {
                if ($path -like "$prefix*") { $isApproved = $true; break }
            }
        }
        if (-not $isApproved) { $misplaced += $path }
    }
    return @($misplaced)
}

function Get-GateSuspiciousDocPaths {
    # Active document changes must not use unstable duplicate-style names.
    param([string[]]$StatusLines)
    $suspiciousPattern = '(?i)(^|[-_. ])(copy|backup|old|new|tmp|temp|draft|final|v[2-9]\d*)([-_. ]|$)'
    $docPaths = @($StatusLines |
        ForEach-Object { Get-GateStatusPath $_ } |
        Where-Object { $_ -and $_ -match '\.(md|txt|rst)$' -and $_ -notlike 'closeout-logs/*' } |
        Select-Object -Unique)
    $suspicious = @()
    foreach ($path in $docPaths) {
        $fileName = ($path -split '/')[-1]
        $baseName = $fileName -replace '\.[^.]+$', ''
        if ($baseName -match $suspiciousPattern) { $suspicious += $path }
    }
    return @($suspicious)
}

function Invoke-GateCommand {
    # Runs one gate command, capturing exit code and the output tail.
    param(
        [string]$Label,
        [string]$WorkingDirectory,
        [scriptblock]$Command
    )
    if ($WorkingDirectory) { Push-Location $WorkingDirectory }
    try {
        $output = & $Command 2>&1
        $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
        $tail = ''
        if ($output) {
            $tail = (($output | Select-Object -Last 3 | ForEach-Object { "$_" }) -join ' | ')
        }
        return [PSCustomObject]@{
            Label    = $Label
            ExitCode = $exitCode
            Tail     = $tail
        }
    }
    finally {
        if ($WorkingDirectory) { Pop-Location }
    }
}

function Get-GateVerdict {
    # Verdict rules:
    #   any FAIL                        -> FAILED, exit 1
    #   no FAIL and no BLOCKED/SKIP     -> PRODUCTION_READY, exit 0
    #   no FAIL but BLOCKED/SKIP remain -> local gates passed, production NOT proven, exit 0
    param(
        [int]$PassCount,
        [int]$FailCount,
        [int]$BlockedCount,
        [int]$SkipCount
    )
    if ($FailCount -gt 0) {
        return [PSCustomObject]@{ Label = 'FAILED'; ProductionReady = $false; ExitCode = 1 }
    }
    if ($BlockedCount -eq 0 -and $SkipCount -eq 0) {
        return [PSCustomObject]@{ Label = 'PRODUCTION_READY'; ProductionReady = $true; ExitCode = 0 }
    }
    return [PSCustomObject]@{ Label = 'LOCAL_READY_PRODUCTION_NOT_PROVEN'; ProductionReady = $false; ExitCode = 0 }
}
