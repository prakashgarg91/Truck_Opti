Analyze specifications, plans, and tasks for consistency, completeness, and constitution alignment.

**Process:**

1. **Select analysis scope:**
   - Ask user: Single feature or entire project?
   - If single: Which feature?
   - If entire: Analyze all in `.specify/` directory

2. **Cross-document consistency check:**
   - **Spec → Plan:** Does plan address all requirements?
   - **Plan → Tasks:** Do tasks cover all components in plan?
   - **Tasks → Estimate:** Is timeline realistic?

3. **Constitution alignment check:**

   Check each document against 10 principles:

   ✅/❌ **Zero Manual Intervention**
   - Is automation mentioned?
   - Are manual steps minimized?

   ✅/❌ **Safety First**
   - Draft mode mentioned?
   - Backup/recovery procedures?
   - Validation checks?

   ✅/❌ **Comprehensive Logging**
   - Logging strategy defined?
   - Log levels specified?
   - Error logging included?

   ✅/❌ **Cost-Effective**
   - Free APIs preferred?
   - Fallback options?
   - Resource usage considered?

   ✅/❌ **Quality Over Quantity**
   - Quality metrics defined?
   - Testing strategy?
   - Review process?

   ✅/❌ **Backward Compatibility**
   - Breaking changes identified?
   - Migration path defined?
   - Deprecation warnings?

   ✅/❌ **Developer-Friendly**
   - Code standards mentioned?
   - Documentation planned?
   - Examples included?

   ✅/❌ **User-First Design**
   - User experience considered?
   - Error messages clear?
   - Help available?

   ✅/❌ **Security & Privacy**
   - Authentication handled?
   - Credentials secure?
   - API keys protected?

   ✅/❌ **Continuous Improvement**
   - Monitoring included?
   - Metrics to track?
   - Feedback mechanism?

4. **Code quality checks (if code exists):**
   - Naming conventions followed?
   - Logging format consistent?
   - Error handling comprehensive?
   - Comments clear and helpful?

5. **Generate analysis report:**
   - **Consistency Score:** X/100
   - **Constitution Alignment:** Y/10 principles
   - **Issues Found:** List with severity (Critical/High/Medium/Low)
   - **Recommendations:** Specific improvements

6. **Present findings:**
   - Show analysis report
   - Highlight critical issues
   - Suggest fixes for each issue
   - Ask if user wants to fix now or later

**Analysis Scoring:**

- **100-90:** Excellent - ready to implement
- **89-75:** Good - minor improvements needed
- **74-60:** Fair - several issues to address
- **59-0:** Poor - significant rework required

**Common Issues to Find:**

- Missing error handling
- Incomplete logging
- Vague requirements
- Missing test coverage
- Undefined edge cases
- Unclear success criteria
- Missing documentation plans
- No rollback procedure
- Unrealistic time estimates
- Constitution principles ignored
