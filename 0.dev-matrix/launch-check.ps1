param(
    [switch]$VerboseOutput
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LaunchCheckScript = Join-Path $RepoRoot 'scripts\launch-readiness.ps1'

if (-not (Test-Path $LaunchCheckScript)) {
    Write-Host 'Repo-local launch readiness script not found at .\scripts\launch-readiness.ps1' -ForegroundColor Red
    exit 1
}

& $LaunchCheckScript @PSBoundParameters
if ($LASTEXITCODE -is [int]) {
    exit $LASTEXITCODE
}