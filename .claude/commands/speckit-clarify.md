Identify and resolve underspecified or ambiguous areas in specifications or plans.

**Process:**

1. **Find the document:**
   - Ask user which document to clarify (spec, plan, or tasks)
   - Read the document from `.specify/` directory

2. **Analyze for clarity issues:**
   - **In Specifications:**
     * Missing acceptance criteria
     * Vague requirements
     * Undefined success metrics
     * Unspecified edge cases
     * Missing constitution alignment

   - **In Plans:**
     * Unclear component responsibilities
     * Missing dependencies
     * Vague error handling
     * Incomplete logging strategy
     * Undefined rollback procedures

   - **In Tasks:**
     * Tasks too large (>2 hours)
     * Missing time estimates
     * Unclear dependencies
     * Ambiguous completion criteria

3. **Ask clarifying questions:**
   - Present issues found
   - Ask user for clarification on each
   - Suggest concrete options when possible

4. **Update the document:**
   - Add clarified information
   - Fill in missing details
   - Make vague parts specific
   - Add examples where helpful

5. **Verify completeness:**
   - Check against constitution principles
   - Ensure all required sections are filled
   - Verify measurable criteria exist
   - Confirm actionable tasks

6. **Save updates:**
   - Update the document
   - Show what was clarified
   - Ask if more clarification needed

**Common Ambiguities to Check:**

- "Fast" → How fast? (< 1s, < 5s, < 30s?)
- "Reliable" → What % uptime? What error rate?
- "User-friendly" → What specific UI elements?
- "Scalable" → How many items/users?
- "Secure" → What security measures specifically?
- "Test thoroughly" → What tests exactly?
