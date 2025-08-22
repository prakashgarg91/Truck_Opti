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

### Law 4: Screenshot Analysis & Resolution Protocol
Proactively analyze all screenshots in project for issues and provide solutions

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

## 📸 SCREENSHOT ANALYSIS & RESOLUTION PROTOCOL

### Mandatory Screenshot Review Process:
```yaml
SCREENSHOT_ANALYSIS_TRIGGER:
  when: ["user mentions screenshots", "screenshot directory detected", "visual issues reported"]
  action: "automatically scan and analyze all project screenshots"
  priority: "HIGH"

SCREENSHOT_CATEGORIES:
  unresolved_issues: "screenshots_problems_in_exe/*.png"
  resolved_issues: "screenshots_problems_in_exe/RESOLVED_*.png"
  new_findings: "any new screenshots or issues discovered"
  
ANALYSIS_WORKFLOW:
  1. DISCOVER: "scan project for all screenshot files"
  2. CATEGORIZE: "identify resolved vs unresolved issues"
  3. ANALYZE: "examine each unresolved screenshot for specific problems"
  4. PRIORITIZE: "rank issues by severity and user impact"
  5. RESOLVE: "implement fixes for identified problems"
  6. VALIDATE: "test fixes and capture resolution evidence"
  7. DOCUMENT: "update resolution status and create RESOLVED_ screenshots"
```

### Screenshot Analysis Framework:
```yaml
ANALYSIS_DIMENSIONS:
  ui_ux_issues:
    - "visual layout problems"
    - "styling inconsistencies" 
    - "responsive design failures"
    - "color scheme problems"
    - "font visibility issues"
    
  functional_problems:
    - "broken features or workflows"
    - "loading issues or errors"
    - "data display problems"
    - "form validation failures"
    - "navigation problems"
    
  performance_issues:
    - "slow loading screens"
    - "processing delays"
    - "memory or resource problems"
    - "optimization opportunities"
    
  user_experience_gaps:
    - "missing functionality"
    - "confusing interfaces"
    - "accessibility problems"
    - "mobile compatibility issues"
```

### Resolution Implementation Protocol:
```yaml
RESOLUTION_STEPS:
  immediate_fixes:
    priority: "CRITICAL"
    timeframe: "same session"
    examples: ["critical UI breaks", "non-functional features", "data loss risks"]
    
  high_priority_improvements:
    priority: "HIGH" 
    timeframe: "within current task"
    examples: ["visual inconsistencies", "poor UX", "performance issues"]
    
  enhancement_opportunities:
    priority: "MEDIUM"
    timeframe: "next development cycle"
    examples: ["feature additions", "visual polish", "optimization"]

RESOLUTION_DOCUMENTATION:
  format: "RESOLVED_[number].[brief_description].png"
  location: "screenshots_problems_in_exe/"
  metadata: 
    - "original issue description"
    - "solution implemented"
    - "code changes made"
    - "validation evidence"
```

### Automated Screenshot Actions:
```yaml
ON_SCREENSHOT_DETECTION:
  scan_directories: ["screenshots_problems_in_exe/", "screenshots/", "docs/images/"]
  identify_unresolved: "files without RESOLVED_ prefix"
  analyze_issues: "extract problem descriptions from filenames and content"
  create_resolution_plan: "prioritized action items for each issue"
  implement_fixes: "code changes to address identified problems"
  capture_evidence: "new screenshots showing resolution"
  update_documentation: "mark issues as resolved with evidence"

SCREENSHOT_NAMING_CONVENTION:
  problem_format: "[ISSUE_DESCRIPTION].png"
  resolved_format: "RESOLVED_[number].[ISSUE_DESCRIPTION]_[resolution_type].png"
  examples:
    - "LOADING_SCREEN_NOT_WORKING.png" → "RESOLVED_103.Loading_screen_functionality_implemented.png"
    - "POOR_UI_COLORS.png" → "RESOLVED_104.Professional_color_scheme_applied.png"
```

### Integration with Development Workflow:
```yaml
SCREENSHOT_DRIVEN_DEVELOPMENT:
  code_review: "include screenshot analysis in every code review"
  testing: "validate fixes with before/after screenshot evidence"
  deployment: "ensure all critical UI issues resolved before release"
  monitoring: "continuous screenshot-based quality assurance"

QUALITY_GATES:
  no_critical_ui_issues: "all CRITICAL screenshots must be resolved"
  visual_consistency: "UI/UX standards maintained across application"  
  user_experience: "all user workflow screenshots show proper functionality"
  performance_validation: "loading and processing screenshots show acceptable speeds"
```

This protocol ensures systematic identification, analysis, and resolution of all visual and functional issues captured in project screenshots, maintaining high quality standards throughout development.

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

## 📚 PROJECT LEARNING REGISTRY

### TruckOptimum Enhancement Project (August 2025)

#### Key Technical Learnings:
```yaml
CRITICAL_BUG_PATTERNS:
  - "Hard-coded array references break dynamic systems"
  - "Duplicate Flask routes cause AssertionError at startup"
  - "Missing type imports cause NameError in Python 3.13"
  - "API endpoint mismatches prevent form submissions"

PERFORMANCE_OPTIMIZATIONS:
  - "Lazy loading with dynamic imports reduces startup from 20s to 0.01s"
  - "Background processing prevents UI blocking during operations"
  - "Progressive loading shows immediate feedback to users"
  - "CSV batch processing with error handling for bulk operations"

UI_UX_BEST_PRACTICES:
  - "Loading spinners essential for operations >1 second"
  - "Progress indicators reduce perceived wait time"
  - "Modal forms provide professional interaction patterns"
  - "Bootstrap button groups create professional tool clustering"

ALGORITHM_INTEGRATION:
  - "Research-backed algorithms: Skyline, Physics-based stability, MCDA"
  - "Multi-criteria optimization balances space + weight + stability"
  - "Center of gravity tracking improves load safety"
  - "Extreme points placement reduces empty spaces"
```

#### Screenshot Resolution Methodology:
```yaml
SYSTEMATIC_APPROACH:
  1. "Scan all unresolved screenshots for issue identification"
  2. "Categorize by UI/UX, Functional, Performance, Experience gaps"
  3. "Prioritize by user impact and implementation complexity"
  4. "Implement fixes with before/after validation"
  5. "Document resolution with RESOLVED_xxx.png naming"

PROVEN_SOLUTIONS:
  form_submission_errors: "Fix API endpoint mismatches and dynamic ID generation"
  bulk_upload_missing: "Implement CSV processing with FormData and progress indicators"
  loading_issues: "Add comprehensive loading states with spinners and messages"
  ui_inconsistencies: "Bootstrap 5 professional styling with consistent patterns"
```

#### Advanced 3D Packing Learnings:
```yaml
RESEARCH_VALIDATED_ALGORITHMS:
  - "Skyline Algorithm: 20-30% faster placement decisions"
  - "Physics-based stability: Real-time center of gravity optimization"
  - "BRKGA optimization: 10-15% better space utilization"
  - "Multi-objective fitness scoring improves recommendation quality"

IMPLEMENTATION_INSIGHTS:
  - "Supporting classes (SkylineProfile, ExtremePointsManager) essential"
  - "Collision detection requires 3D space overlap calculations" 
  - "Rotation optimization with 6 orientations maximizes space usage"
  - "Weighted stability scoring balances multiple safety factors"
```

#### Analytics & Comparison System:
```yaml
DATA_DRIVEN_INSIGHTS:
  - "Recommendation comparison reveals algorithm performance gaps"
  - "Filtering and pagination essential for large data sets"
  - "Real-time analytics provide immediate optimization feedback"
  - "Trend analysis identifies long-term performance patterns"

OPTIMIZATION_SUGGESTIONS:
  - "Automatic algorithm selection based on performance history"
  - "Fleet optimization through usage pattern analysis"
  - "Performance gap identification drives continuous improvement"
  - "Multi-recommendation comparison enables data-driven decisions"
```

#### Deployment & Production Readiness:
```yaml
EXECUTABLE_OPTIMIZATION:
  - "PyInstaller spec files enable 10.8MB optimized builds"
  - "Template inclusion critical for Flask app functionality"
  - "Lazy loading maintains startup performance in compiled form"
  - "Comprehensive error handling prevents runtime crashes"

QUALITY_ASSURANCE:
  - "Screenshot-driven development ensures visual quality"
  - "CLAUDE.md protocol provides systematic issue resolution"
  - "Todo tracking maintains development momentum"
  - "Git commit documentation enables project continuity"
```

This project successfully demonstrated systematic screenshot analysis, research-backed algorithm implementation, and enterprise-level feature development while maintaining performance and usability standards.

research_tasks: "active