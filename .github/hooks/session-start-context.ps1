$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sessionStartMaintenanceScript = Join-Path $repoRoot '0.dev-matrix\session-start-maintenance.ps1'

if (Test-Path $sessionStartMaintenanceScript) {
  try {
    Start-Process -FilePath 'powershell.exe' -WorkingDirectory $repoRoot -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      $sessionStartMaintenanceScript
    ) -WindowStyle Hidden | Out-Null
  }
  catch {
  }
}

$payload = [ordered]@{
  continue = $true
  systemMessage = 'Workspace policy: use AGENTS.md as the single workspace-wide Copilot instruction file. Use .github/instructions for targeted guidance, .github/agents for specialist roles, and .github/hooks for short deterministic automation. Deep repo truth lives in 0.dev-matrix. Start from 0.dev-matrix/AI-HANDOFF.md. SessionStart also queues start-of-day maintenance so resume-work can surface code-review-graph status, Graphify freshness, Graphify refresh when stale, and graph-hook status. Use Roo bridge as the default semantic retrieval layer; direct Qdrant is legacy/system knowledge only. Split broad repo audits across parallel agents only after Roo or Graphify narrows the surface. Reuse repo or shared skills when they exist, and sync durable repo skills plus repo/user memory at close-day when patterns change. Push intended repo changes to GitHub after validation passes and branch strategy is confirmed. For imports, exports, module boundaries, hooks, plugins, skills, or agent registration changes, load the module reconciliation instruction or use the System Reconciler agent and validate with the repo''s strongest structural reconciliation command.'
}

$payload | ConvertTo-Json -Compress