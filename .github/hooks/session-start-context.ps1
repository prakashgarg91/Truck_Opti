$payload = [ordered]@{
  continue = $true
  systemMessage = 'Workspace policy: use AGENTS.md as the single workspace-wide Copilot instruction file. Use .github/instructions for targeted guidance, .github/agents for specialist roles, and .github/hooks for short deterministic automation. Deep repo truth lives in 0.dev-matrix. Start from 0.dev-matrix/AI-HANDOFF.md. For imports, exports, module boundaries, hooks, plugins, skills, or agent registration changes, load the module reconciliation instruction or use the System Reconciler agent and validate with the repo''s strongest structural reconciliation command.'
}

$payload | ConvertTo-Json -Compress