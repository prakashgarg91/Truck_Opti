Create a detailed technical implementation plan based on an existing specification.

**Process:**

1. **Find the specification:**
   - List files in `.specify/specifications/`
   - Ask user which feature to plan (or use the most recent one)
   - Read the specification file

2. **Analyze current architecture:**
   - Review relevant existing code
   - Identify components that can be reused
   - Identify components that need modification
   - Check dependencies

3. **Create technical plan:**
   - Create `.specify/plans/[feature-name]-plan.md`
   - Use the template from `.specify/MANUAL-WORKFLOW.md`
   - Include:
     * Architecture Overview
     * Components to Create (with file paths)
     * Components to Modify (with impact analysis)
     * Dependencies (npm packages)
     * Configuration (env vars, config files)
     * Database/Storage Changes
     * API Changes
     * Error Handling Strategy
     * Logging Strategy (using our log levels: AUTH, INIT, PIPELINE, CONTENT, POST, SUCCESS, WARN, ERROR)
     * Testing Strategy
     * Rollout Plan (phases)
     * Rollback Plan
     * Documentation Updates
     * Timeline Estimate

4. **Verify against constitution:**
   - Check code standards (naming conventions, logging format)
   - Verify error handling approach
   - Ensure logging is comprehensive
   - Check cost-effectiveness

5. **Save the plan:**
   - Write to `.specify/plans/[feature-name]-plan.md`
   - Display the plan for review
   - Ask if they want to proceed to task breakdown

**Code Standards to Follow:**
- Classes: PascalCase
- Methods: camelCase
- Files: kebab-case
- Logging: `this.log('message', 'LEVEL')`
- Error handling: try-catch with context
