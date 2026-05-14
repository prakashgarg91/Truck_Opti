param(
    [ValidateSet('latest', 'capture', 'resolve')]
    [string]$Mode = 'latest'
)

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalScript = Join-Path $RepoRoot '0.dev-matrix\runtime-error-loop.ps1'

if (-not (Test-Path $LocalScript)) {
    Write-Host 'Repo-local runtime-error-loop wrapper not found at .\0.dev-matrix\runtime-error-loop.ps1' -ForegroundColor Red
    exit 1
}

& $LocalScript -Mode $Mode
if ($LASTEXITCODE -is [int]) {
    exit $LASTEXITCODE
}