param(
    [string]$Prompt = "",
    [switch]$DryRun,
    [switch]$SkipWatch,
    [string]$Model = "gpt-5.4",
    [string]$Effort = "max",
    [int]$MaxTurns = 200,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AdditionalArgs
)

$sharedLauncher = "D:\Github\0.dev-matrix\run-openharness.ps1"
if (-not (Test-Path $sharedLauncher)) {
    throw "Shared OpenHarness launcher not found at $sharedLauncher"
}

if (Test-Path (Join-Path $PSScriptRoot ".git")) {
    $repoRoot = $PSScriptRoot
}
else {
    $repoRoot = Split-Path $PSScriptRoot -Parent
}

& $sharedLauncher -RepoRoot $repoRoot -Prompt $Prompt -DryRun:$DryRun -SkipWatch:$SkipWatch -Model $Model -Effort $Effort -MaxTurns $MaxTurns @AdditionalArgs
exit $LASTEXITCODE
