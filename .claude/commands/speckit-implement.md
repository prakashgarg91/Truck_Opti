Implement tasks according to the plan, following our constitution and code standards.

**Process:**

1. **Load context:**
   - Find and read the task file in `.specify/tasks/`
   - Read the corresponding plan in `.specify/plans/`
   - Read the corresponding specification in `.specify/specifications/`
   - Review the constitution at `.specify/constitution.md`

2. **Check prerequisites:**
   - Verify all dependencies are installed
   - Verify authentication is working
   - Verify existing code is understood

3. **For each task (one at a time):**

   **a. Show task details:**
   - Display task ID, description, time estimate
   - Show which files will be affected
   - Ask user to confirm starting this task

   **b. Implement following constitution:**
   - **Principle #3**: Add comprehensive logging with timestamps
   - **Principle #2**: Include safety mechanisms (drafts, backups)
   - **Principle #9**: Handle errors gracefully
   - Follow code standards from constitution

   **c. Code standards to follow:**
   ```javascript
   // Logging
   this.log('Operation description', 'LEVEL');
   // Levels: AUTH, INIT, PIPELINE, CONTENT, POST, SUCCESS, WARN, ERROR

   // Error handling
   try {
     // operation
     this.log('Success message', 'SUCCESS');
   } catch (error) {
     this.log(`Failed: ${error.message}`, 'ERROR');
     throw new Error(`Context: ${error.message}`);
   }

   // Authentication check
   const credentials = this.oauth2Client.credentials;
   if (!credentials || !credentials.access_token) {
     this.log('No valid credentials', 'ERROR');
     throw new Error('Authentication required');
   }
   ```

   **d. After implementing:**
   - Test the code
   - Verify logging works
   - Check authentication if applicable
   - Update the task status to ✅ Complete
   - Update the progress table in tasks file
   - Commit with clear message

4. **Between tasks:**
   - Ask if user wants to continue to next task
   - Show progress (X/Y tasks complete)
   - Update completion percentage

5. **After all tasks:**
   - Generate summary of what was implemented
   - List all files created/modified
   - Suggest next steps (testing, documentation)
   - Ask if they want to create a git commit

**Constitution Principles to Follow:**

From `.specify/constitution.md`:

1. **Zero Manual Intervention** - Automate everything
2. **Safety First** - Drafts, backups, validation
3. **Comprehensive Logging** - Log every operation
4. **Cost-Effective** - Use free APIs, fallback chains
5. **Quality Over Quantity** - Well-tested, well-documented
6. **Backward Compatibility** - Don't break existing features
7. **Developer-Friendly** - Clear code, good comments
8. **User-First Design** - Simple, clear interfaces
9. **Security & Privacy** - OAuth2, secure credentials
10. **Continuous Improvement** - Learn from each implementation

**After each file is created/modified:**
- Show the code to the user
- Explain how it follows the constitution
- Highlight the logging and error handling
- Ask for approval before continuing
