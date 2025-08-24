# [MODULE]_CLAUDE.md Template - Task-Specific Agent Structure

## 🤖 ADAPTIVE TASK AGENTS (Auto-Created)

### Core Agent Framework
```yaml
AGENT_CREATION_PROTOCOL:
  trigger: "When specific task type or complexity detected"
  action: "Auto-generate specialized agent with domain knowledge"
  persistence: "Save agent config for reuse in similar tasks"
  evolution: "Improve agent based on task success/failure patterns"

AGENT_TEMPLATE:
  agent_id: "unique_identifier_[domain]_[task_type]"
  specialization: "specific expertise area (debug, test, optimize, etc.)"
  capabilities: "list of skills and knowledge domains"
  task_patterns: "types of tasks this agent handles best"
  success_rate: "tracking performance across tasks"
  learned_solutions: "accumulated knowledge from resolved issues"
```

### Standard Base Agents (Always Present)
```yaml
agent_[domain]_orchestrator:
  role: "Coordinates all domain-specific tasks"
  capabilities: ["task prioritization", "agent delegation", "quality control"]
  
agent_[domain]_validator:  
  role: "Quality assurance and validation"
  capabilities: ["testing protocols", "standard compliance", "error detection"]
  
agent_[domain]_learner:
  role: "Knowledge acquisition and pattern recognition" 
  capabilities: ["error pattern analysis", "solution documentation", "prevention strategies"]
```

### Auto-Generated Task Agents (Created on Demand)
```yaml
# Examples of agents that auto-create based on detected needs:

agent_error_detective:
  triggers: ["exception thrown", "unexpected behavior", "system crash"]
  specialization: "root cause analysis and error classification"
  capabilities: ["stack trace analysis", "pattern matching", "solution research"]
  
agent_testing_specialist:
  triggers: ["comprehensive testing needed", "regression validation required"]
  specialization: "systematic testing and validation protocols"
  capabilities: ["screenshot testing", "functionality validation", "edge case detection"]
  
agent_performance_optimizer:
  triggers: ["slow operations detected", "resource usage high", "user complaints"]
  specialization: "performance analysis and optimization"
  capabilities: ["bottleneck identification", "optimization strategies", "monitoring"]
  
agent_ui_designer:
  triggers: ["visual inconsistencies", "poor UX feedback", "design standards needed"]
  specialization: "professional UI/UX implementation"
  capabilities: ["design standards", "user experience", "accessibility"]
  
agent_build_specialist:
  triggers: ["deployment needed", "build failures", "production issues"]
  specialization: "build, test, deploy automation"
  capabilities: ["build optimization", "deployment validation", "production monitoring"]
```

## 🧠 DOMAIN CONTEXT & KNOWLEDGE

### Domain Knowledge Base
```yaml
current_state: "Active domain variables and context"
proven_patterns: "Successful approaches for this domain"  
failure_patterns: "Known issues and prevention strategies"
best_practices: "Domain-specific standards and guidelines"
tool_preferences: "Preferred tools and libraries for domain tasks"
```

### Task History & Learning
```yaml
completed_tasks: "Successfully resolved tasks with solutions"
recurring_patterns: "Common task types and their optimal approaches"
efficiency_metrics: "Time and success rate tracking per task type"
knowledge_gaps: "Areas needing research or external expertise"
```

## 📝 TASK MANAGEMENT SYSTEM

### Task Classification
```yaml
CRITICAL: "System breaking, user blocking, security issues"
HIGH: "Major functionality, performance, user experience"  
MEDIUM: "Enhancements, optimizations, non-critical features"
LOW: "Documentation, cleanup, future considerations"
```

### Agent Assignment Rules
```yaml
error_tasks → agent_error_detective + agent_[domain]_validator
testing_tasks → agent_testing_specialist + agent_[domain]_orchestrator  
performance_tasks → agent_performance_optimizer + agent_[domain]_learner
ui_tasks → agent_ui_designer + agent_[domain]_validator
build_tasks → agent_build_specialist + agent_[domain]_orchestrator
```

## 🔄 STANDARDIZED WORKFLOWS

### Task Execution Protocol
```yaml
1. ANALYZE: Agent assesses task complexity and requirements
2. PLAN: Create step-by-step approach with quality checkpoints  
3. EXECUTE: Implement solution with continuous validation
4. TEST: Comprehensive validation including edge cases
5. DOCUMENT: Record solution, patterns, and lessons learned
6. VALIDATE: Ensure 98-100% quality standard achieved
```

### Quality Gates
```yaml
code_quality: "Follows project patterns, proper error handling"
functionality: "All features work as expected, tested thoroughly"  
performance: "Meets or exceeds performance requirements"
user_experience: "Professional appearance, intuitive interaction"
documentation: "Clear documentation and knowledge capture"
```

## 📊 AGENT PERFORMANCE TRACKING

### Success Metrics
```yaml
task_completion_rate: "Percentage of tasks completed successfully"
quality_score: "Average quality rating of completed work"
efficiency_rating: "Time to completion vs complexity"
knowledge_growth: "New patterns learned and applied"
prevention_success: "Reduction in recurring issues"
```

### Continuous Improvement
```yaml
agent_evolution: "Agents improve based on task outcomes"
pattern_recognition: "Better identification of task types and solutions"
tool_optimization: "Refined approaches and preferred methodologies"  
knowledge_sharing: "Cross-agent learning and capability enhancement"
```

---

## 🎯 DOMAIN-SPECIFIC SECTIONS

### [Domain Rules]
- Domain-specific development laws and standards
- Technology-specific best practices
- Known limitations and workarounds

### [Domain Tools & Commands]  
- Preferred development tools for this domain
- Common commands and shortcuts
- Build, test, and deployment procedures

### [Domain Knowledge Base]
- Historical project learnings
- Proven solutions for common problems
- Performance optimization techniques
- Integration patterns and approaches

### [Domain Quality Standards]
- Acceptance criteria for this domain
- Testing requirements and protocols
- Documentation standards
- Performance benchmarks

---

This template ensures every CLAUDE.md guide has:
1. **Consistent agent structure** for task automation
2. **Self-learning capabilities** that improve over time  
3. **Standardized workflows** for predictable outcomes
4. **Quality tracking** for continuous improvement
5. **Domain flexibility** while maintaining core structure