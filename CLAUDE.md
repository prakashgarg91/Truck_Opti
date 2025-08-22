# CLAUDE.md - Master Orchestrator & Module Router

## 🎯 CORE: Intelligent Module Delegation System

**Main CLAUDE.md = Orchestrator + Router + Universal Rules**  
**Sub-modules = Specialized Workspaces with Agents, Context & Tasks**

## Universal Development Laws (Apply Everywhere)

### Law 1: Understand Before Acting
Read existing code, understand patterns, research best practices

### Law 2: Verify Every Change  
Test changes, check for regressions, validate functionality

### Law 3: Maintain Consistency
Follow existing patterns, maintain architecture coherence

## 🔀 INTELLIGENT MODULE ROUTER

### Context Detection & Delegation:
```yaml
ERROR_DETECTED:
  symptoms: ["exception thrown", "build failed", "tests failing", "runtime crash"]
  delegate_to: "ERROR_CLAUDE.md"
  priority: "IMMEDIATE"

LEARNING_REQUIRED:
  symptoms: ["new technology", "unfamiliar pattern", "research needed"]
  delegate_to: "LEARNING_CLAUDE.md"  
  priority: "HIGH"

ARCHITECTURE_DECISION:
  symptoms: ["design choice", "pattern selection", "scalability concern"]
  delegate_to: "ARCHITECTURE_CLAUDE.md"
  priority: "HIGH"

TESTING_NEEDED:
  symptoms: ["quality assurance", "validation required", "coverage gaps"]
  delegate_to: "TESTING_CLAUDE.md"
  priority: "MEDIUM"

DEBUGGING_SESSION:
  symptoms: ["complex bug", "investigation needed", "behavior analysis"]
  delegate_to: "DEBUG_CLAUDE.md"
  priority: "HIGH"

REFACTORING_OPPORTUNITY:
  symptoms: ["code smell", "performance issue", "maintainability concern"]
  delegate_to: "REFACTOR_CLAUDE.md"
  priority: "MEDIUM"

PROJECT_PLANNING:
  symptoms: ["new feature", "milestone planning", "resource allocation"]
  delegate_to: "PROJECT_CLAUDE.md"
  priority: "HIGH"

SECURITY_CONCERN:
  symptoms: ["vulnerability", "auth issue", "data protection"]
  delegate_to: "SECURITY_CLAUDE.md"
  priority: "CRITICAL"
```

### Module Escalation Protocol:
```yaml
escalation_rules:
  module_stuck: "escalate to MASTER_CLAUDE.md for cross-module coordination"
  conflicting_advice: "escalate to ARCHITECTURE_CLAUDE.md for decision"
  critical_error: "escalate to ERROR_CLAUDE.md + SECURITY_CLAUDE.md"
  resource_conflict: "escalate to PROJECT_CLAUDE.md for prioritization"
```

## 📋 SUB-MODULE ARCHITECTURE TEMPLATE

### Standard Sub-Module Structure:
```markdown
# [MODULE]_CLAUDE.md - [Specialized Domain]

## 🤖 ADAPTIVE AGENT SYSTEM
### Auto-Generated Agents (Created on Demand)
agent_factory: "creates specialized agents based on current needs"
agent_registry.json: "persistent storage of all created agents"
agent_performance.json: "tracks agent effectiveness and specialization"

### Agent Creation Protocol:
```yaml
trigger_conditions:
  new_problem_domain: "auto-create domain specialist agent"
  recurring_task_pattern: "auto-create task automation agent"
  complex_analysis_needed: "auto-create analysis specialist agent"
  integration_required: "auto-create bridge agent for modules"

agent_template:
  agent_id: "unique identifier"
  specialization: "specific domain or task focus"
  capabilities: "list of skills and knowledge areas"
  created_date: "timestamp of creation"
  performance_metrics: "success rate, usage frequency"
  evolution_history: "how agent has improved over time"
```

### Standard Base Agents (Always Present):
agent_[domain]_specialist: "domain expert with deep knowledge"
agent_[domain]_validator: "quality assurance for domain decisions"
agent_[domain]_coordinator: "interfaces with other modules"

## 🧠 MODULE CONTEXT
current_state.json: "active domain state and variables" 
domain_patterns.json: "proven patterns for this domain"
failure_patterns.json: "known failures and prevention"
success_metrics.json: "measurement criteria for domain"

## 📝 TASK_MASTER
active_tasks: "current domain-specific tasks"
task_queue: "prioritized backlog"
completed_tasks: "completed with outcomes"
blocked_tasks: "waiting for dependencies"

## 🗺️ PROJECT_PLAN
domain_objectives: "specific goals for this domain"
milestones: "measurable checkpoints"
dependencies: "requirements from other modules"
success_criteria: "definition of done"

## 🔧 DOMAIN_RULES
[Specialized rules for this domain]

## 🔄 WORKFLOWS
[Domain-specific workflows and procedures]
```

## 📁 COMPLETE MODULE ECOSYSTEM WITH ADAPTIVE AGENTS

### Agent Persistence & Evolution System:
```yaml
agent_lifecycle:
  creation: "auto-generated based on detected need"
  specialization: "refined through usage and feedback"
  performance_tracking: "measure effectiveness over time" 
  evolution: "improve capabilities based on outcomes"
  retirement: "deactivate agents no longer needed"
  revival: "reactivate retired agents when need resurfaces"

agent_storage:
  location: "[MODULE]_agents.json"
  backup: "periodic agent state snapshots"
  sharing: "successful agents shared across modules"
  versioning: "track agent evolution history"
```

### Cross-Module Agent Coordination:
```yaml
agent_communication:
  shared_agent_pool: "agents available to multiple modules"
  specialist_requests: "modules can request specific agent types"
  knowledge_transfer: "agents share learned patterns"
  collaborative_problem_solving: "multi-agent task forces"
```

### ERROR_CLAUDE.md - Error Resolution Workspace
```markdown
# ERROR_CLAUDE.md - Error Resolution Specialist

## 🤖 AUTO-GENERATED ERROR AGENTS
agent_error_detective: "root cause analysis and error classification" [BASE]
agent_solution_researcher: "finds proven solutions for error patterns" [BASE]
agent_fix_validator: "ensures fixes work and don't create new issues" [BASE]

### Adaptive Agent Creation:
```yaml
auto_create_conditions:
  new_error_type: "create agent_[error_type]_specialist"
  complex_debugging: "create agent_deep_debugger" 
  integration_errors: "create agent_integration_fixer"
  performance_issues: "create agent_performance_analyzer"

agent_examples_created:
  agent_database_error_specialist: "auto-created for SQL/DB issues"
  agent_frontend_crash_analyzer: "auto-created for UI errors"
  agent_api_integration_fixer: "auto-created for external API issues"
```

## 🧠 ERROR CONTEXT
current_error_state.json: "active error details, stack traces, environment"
error_patterns_db.json: "known error patterns with solutions"
resolution_history.json: "past errors and successful resolution paths"
prevention_rules.json: "rules to prevent recurring errors"

## 📝 ERROR_TASK_MASTER
active_errors: "currently being resolved"
error_queue: "prioritized by severity (critical, high, medium, low)"
resolved_errors: "completed with solution documentation"
recurring_errors: "patterns that need systematic prevention"

## 🗺️ ERROR_PROJECT_PLAN
objectives: "reduce error frequency, improve resolution time"
milestones: "error rate targets, resolution time goals"
dependencies: "testing module for validation, architecture for prevention"
success_criteria: "zero critical errors, <1hr resolution for high priority"

## 🔧 ERROR_RULES
- Never ignore errors, even minor ones
- Always test fixes in isolation first
- Document every error pattern and solution
- Implement prevention rules after resolution

## 🔄 ERROR_WORKFLOWS
1. DETECT → classify error type and severity
2. ANALYZE → find root cause with agent_error_detective  
3. RESEARCH → find solutions with agent_solution_researcher
4. IMPLEMENT → apply fix with minimal impact
5. VALIDATE → verify fix works with agent_fix_validator
6. DOCUMENT → update patterns and prevention rules
## 🔄 AGENT CREATION EXAMPLES IN PRACTICE

### Scenario 1: New Error Type Encountered
```yaml
trigger: "GraphQL parsing error - no existing agent"
action: "auto-create agent_graphql_error_specialist"
capabilities: ["GraphQL schema validation", "query optimization", "resolver debugging"]
persistence: "saved to ERROR_agents.json for future GraphQL issues"
```

### Scenario 2: Complex Architecture Decision
```yaml
trigger: "microservices vs monolith decision needed"
action: "auto-create agent_architecture_decision_specialist"  
capabilities: ["scalability analysis", "team structure impact", "deployment complexity"]
persistence: "saved to ARCHITECTURE_agents.json for similar decisions"
```

### Scenario 3: Performance Optimization Task
```yaml
trigger: "database query taking >5 seconds"
action: "auto-create agent_database_performance_optimizer"
capabilities: ["query analysis", "index optimization", "caching strategies"]
persistence: "saved to REFACTOR_agents.json for performance tasks"
```

### Scenario 4: Security Vulnerability Found
```yaml
trigger: "SQL injection vulnerability detected"
action: "auto-create agent_sql_security_specialist"
capabilities: ["injection prevention", "parameterization", "security scanning"]
persistence: "saved to SECURITY_agents.json for security reviews"
```

### LEARNING_CLAUDE.md - Knowledge Acquisition Workspace
```markdown
# LEARNING_CLAUDE.md - Learning & Research Specialist

## 🤖 AUTO-GENERATED LEARNING AGENTS
agent_research_scout: "finds authoritative sources and best practices" [BASE]
agent_knowledge_synthesizer: "combines information into actionable insights" [BASE]
agent_pattern_extractor: "identifies reusable patterns from solutions" [BASE]

### Adaptive Agent Creation:
```yaml
auto_create_conditions:
  new_technology_stack: "create agent_[tech]_expert"
  domain_expertise_gap: "create agent_[domain]_researcher"  
  pattern_complexity: "create agent_advanced_pattern_analyzer"
  cross_domain_learning: "create agent_knowledge_bridge"

agent_examples_created:
  agent_react_hooks_expert: "auto-created for React patterns research"
  agent_microservices_researcher: "auto-created for architecture patterns"
  agent_ml_integration_specialist: "auto-created for AI/ML implementation"
```

## 🧠 LEARNING CONTEXT
research_state.json: "current research topics and progress"
knowledge_graph.json: "interconnected knowledge and relationships"
source_credibility.json: "trusted sources ranked by domain and accuracy"
learning_gaps.json: "identified knowledge gaps requiring research"
agent_registry.json: "all created learning agents with specializations"

## 📝 LEARNING_TASK_MASTER
research_tasks: "active