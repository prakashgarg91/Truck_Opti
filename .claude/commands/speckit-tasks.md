Break down a technical plan into actionable tasks with time estimates.

**Process:**

1. **Find the plan:**
   - List files in `.specify/plans/`
   - Ask user which plan to break down (or use the most recent one)
   - Read the plan file
   - Read the corresponding specification

2. **Break into phases:**
   - Phase 1: Setup (dependencies, configuration)
   - Phase 2: Implementation (core features)
   - Phase 3: Testing (unit, integration, manual)
   - Phase 4: Documentation (guides, README updates)

3. **Create task list:**
   - Create `.specify/tasks/[feature-name]-tasks.md`
   - Use the template from `.specify/MANUAL-WORKFLOW.md`
   - For each task include:
     * Task ID (e.g., 1.1, 1.2)
     * Clear description
     * Time estimate (15-30 min chunks ideal)
     * Files affected
     * Dependencies (which tasks must complete first)

4. **Add progress tracking:**
   - Create a table with columns: Task | Status | Started | Completed | Notes
   - Status options: ⏸️ Not Started | 🔄 In Progress | ✅ Complete | ❌ Blocked
   - Include section for blockers

5. **Calculate totals:**
   - Total number of tasks
   - Total estimated time
   - Completion percentage

6. **Save the tasks:**
   - Write to `.specify/tasks/[feature-name]-tasks.md`
   - Display the task breakdown
   - Ask if they want to start implementing

**Task Sizing Guidelines:**
- Small: 15-30 minutes (ideal)
- Medium: 30-60 minutes
- Large: 1-2 hours (should be broken down further)
- Very Large: > 2 hours (must be split)
