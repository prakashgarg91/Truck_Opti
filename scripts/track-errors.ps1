param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ForwardArgs
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogsDir = Join-Path $RepoRoot 'logs\autonomous'
$null = New-Item -ItemType Directory -Path $LogsDir -Force

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $LogsDir "local-bot-track-errors-$timestamp.log"

Write-Host "[track-errors] Capturing runtime output to $logPath" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    if ($ForwardArgs.Count -gt 0) {
        Write-Host ('[track-errors] Forward args ignored for now: ' + ($ForwardArgs -join ' ')) -ForegroundColor Yellow
    }

    & npm run start 2>&1 | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -is [int]) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}