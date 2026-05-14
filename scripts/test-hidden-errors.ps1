$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReportDir = Join-Path $RepoRoot '0.dev-matrix\test-reports'
$ReportPath = Join-Path $ReportDir 'hidden-error-latest.json'
$null = New-Item -ItemType Directory -Path $ReportDir -Force

$results = New-Object System.Collections.Generic.List[object]
$hasFailure = $false

function Invoke-HiddenErrorStep {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [scriptblock]$Command
    )

    Write-Host "[hidden-errors] $Name" -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
        $output = & $Command 2>&1
        $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }

        foreach ($line in $output) {
            Write-Host "  $line"
        }

        $results.Add([PSCustomObject]@{
                name     = $Name
                status   = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
                exitCode = $exitCode
                summary  = if ($output.Count -gt 0) { (($output | Select-Object -Last 3) -join ' | ') } else { '' }
            }) | Out-Null

        if ($exitCode -ne 0) {
            $script:hasFailure = $true
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-HiddenErrorStep -Name 'Deep error scan' -WorkingDirectory $RepoRoot -Command { node 0.dev-matrix/deep-error-scanner.mjs }
Invoke-HiddenErrorStep -Name 'Glue check' -WorkingDirectory $RepoRoot -Command { node tools/glue-check.mjs }
Invoke-HiddenErrorStep -Name 'Frontend unit tests' -WorkingDirectory (Join-Path $RepoRoot 'frontend') -Command { npm run test:unit }

$report = [PSCustomObject]@{
    generatedAt = (Get-Date).ToString('o')
    repo        = 'Truck_Opti'
    status      = if ($hasFailure) { 'FAIL' } else { 'PASS' }
    steps       = $results
}

$report | ConvertTo-Json -Depth 5 | Set-Content -Path $ReportPath -Encoding UTF8
Write-Host "[hidden-errors] Wrote $ReportPath" -ForegroundColor DarkGray

if ($hasFailure) {
    exit 1
}