param(
  [string]$OutputDir = 'graphify-out',
  [int]$MaxRenderNodes = 90
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$SharedScript = Join-Path $WorkspaceRoot '0.dev-matrix\repo-layout-index.py'

if (-not (Test-Path $SharedScript)) {
  Write-Host 'Shared repo-layout-index.py not found.' -ForegroundColor Yellow
  return
}

$pythonCommand = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { $null }
if ($null -eq $pythonCommand) {
  Write-Host 'Python is required to run repo-layout-index.py.' -ForegroundColor Yellow
  return
}

if ($pythonCommand -eq 'py') {
  & py -3 $SharedScript $RepoRoot --output-dir $OutputDir --max-render-nodes $MaxRenderNodes
}
else {
  & python $SharedScript $RepoRoot --output-dir $OutputDir --max-render-nodes $MaxRenderNodes
}
