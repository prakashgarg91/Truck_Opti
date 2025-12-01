# 📋 Manual Spec-Kit Workflow

Since `/speckit.*` commands aren't available in Claude Code, use this manual workflow to follow spec-driven development principles.

---

## 🎯 Workflow Templates

### Template 1: SPECIFY (Define Requirements)

**File:** `.specify/specifications/[feature-name].md`

```markdown
# Feature: [Feature Name]

**Date:** [Date]
**Status:** Draft | Planned | In Progress | Complete

## User Story

As a [user type],
I want [goal/desire],
So that [benefit/value].

## Requirements

### Must Have
1. [Requirement 1]
2. [Requirement 2]
3. [Requirement 3]

### Should Have
1. [Optional requirement 1]
2. [Optional requirement 2]

### Could Have
1. [Nice to have 1]
2. [Nice to have 2]

## Acceptance Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Success Metrics

- [Metric 1]: [Target value]
- [Metric 2]: [Target value]

## Constitution Alignment

- ✅ Principle 1: [How it aligns]
- ✅ Principle 2: [How it aligns]
- ...

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [How to mitigate] |
```

---

### Template 2: PLAN (Technical Design)

**File:** `.specify/plans/[feature-name]-plan.md`

```markdown
# Technical Plan: [Feature Name]

**Date:** [Date]
**Specification:** Link to .specify/specifications/[feature-name].md

## Architecture Overview

[Diagram or description of how this fits into system]

## Technical Approach

### Components to Create
1. **[Component 1]** - [Description]
   - File: `path/to/file.js`
   - Responsibility: [What it does]
   - Dependencies: [What it needs]

2. **[Component 2]** - [Description]
   - File: `path/to/file.js`
   - Responsibility: [What it does]
   - Dependencies: [What it needs]

### Components to Modify
1. **[Existing Component 1]** - [What changes]
   - File: `path/to/existing.js`
   - Changes: [Describe modifications]
   - Impact: [What might break]

## Dependencies

```json
{
  "new-package": "^1.0.0",
  "another-package": "^2.0.0"
}
```

## Configuration

New environment variables:
- `NEW_CONFIG_VAR` - Description

New files:
- `config/feature-config.json` - Description

## Database/Storage Changes

- New directory: `path/to/new/dir/`
- New JSON structure: [Describe schema]

## API Changes

### New Methods
```javascript
async newMethod(param1, param2) {
  // Purpose
  // Parameters
  // Returns
}
```

### Modified Methods
```javascript
async existingMethod(param1, newParam) {
  // What changed
}
```

## Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| [Scenario 1] | [How to handle] |
| [Scenario 2] | [How to handle] |

## Logging Strategy

```javascript
this.log('Operation description', 'LEVEL');
// What to log, when, and at what level
```

## Testing Strategy

1. **Unit Tests**
   - Test [Component 1]
   - Test [Component 2]

2. **Integration Tests**
   - Test end-to-end flow
   - Test error scenarios

3. **Manual Testing**
   - Step 1
   - Step 2

## Rollout Plan

1. **Phase 1:** [What to implement first]
2. **Phase 2:** [What comes next]
3. **Phase 3:** [Final steps]

## Rollback Plan

If something goes wrong:
1. [Step to rollback]
2. [How to recover]

## Documentation Updates

- [ ] Update README.md
- [ ] Create [FEATURE-NAME].md guide
- [ ] Update start.bat menu
- [ ] Add to CLAUDE.md

## Timeline Estimate

- Planning: [Time]
- Implementation: [Time]
- Testing: [Time]
- Documentation: [Time]
**Total:** [Time]
```

---

### Template 3: TASKS (Action Items)

**File:** `.specify/tasks/[feature-name]-tasks.md`

```markdown
# Tasks: [Feature Name]

**Date:** [Date]
**Plan:** Link to .specify/plans/[feature-name]-plan.md

## Task Breakdown

### Phase 1: Setup
- [ ] **Task 1.1:** [Description]
  - Time: [Estimate]
  - Files: [List]
  - Dependencies: [None/Other tasks]

- [ ] **Task 1.2:** [Description]
  - Time: [Estimate]
  - Files: [List]
  - Dependencies: [Task 1.1]

### Phase 2: Implementation
- [ ] **Task 2.1:** [Description]
  - Time: [Estimate]
  - Files: [List]
  - Dependencies: [Phase 1 complete]

- [ ] **Task 2.2:** [Description]
  - Time: [Estimate]
  - Files: [List]
  - Dependencies: [Task 2.1]

### Phase 3: Testing
- [ ] **Task 3.1:** [Description]
  - Time: [Estimate]
  - Files: [List]
  - Dependencies: [Phase 2 complete]

### Phase 4: Documentation
- [ ] **Task 4.1:** [Description]
  - Time: [Estimate]
  - Files: [List]
  - Dependencies: [Phase 3 complete]

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| 1.1 | ⏸️ Not Started | - | - | - |
| 1.2 | ⏸️ Not Started | - | - | - |
| 2.1 | ⏸️ Not Started | - | - | - |

Status: ⏸️ Not Started | 🔄 In Progress | ✅ Complete | ❌ Blocked

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| - | - | - |

## Total Estimate

- Total Tasks: [Number]
- Total Time: [Hours/Days]
- Completion: 0% → 100%
```

---

## 🚀 How to Use This Workflow

### Step 1: Create Specification

```bash
# Create new spec file
touch .specify/specifications/email-notifications.md

# Copy SPECIFY template
# Fill in requirements, user stories, etc.
```

### Step 2: Ask Claude to Review

```
"I've created a specification for email notifications at:
.specify/specifications/email-notifications.md

Can you review it and suggest improvements based on our constitution?"
```

### Step 3: Create Technical Plan

```bash
# Create plan file
touch .specify/plans/email-notifications-plan.md

# Copy PLAN template
```

Then ask Claude:
```
"Based on the specification at .specify/specifications/email-notifications.md,
help me create a detailed technical plan following our constitution principles."
```

### Step 4: Break Down into Tasks

```bash
# Create tasks file
touch .specify/tasks/email-notifications-tasks.md

# Copy TASKS template
```

Then ask Claude:
```
"Based on the plan at .specify/plans/email-notifications-plan.md,
help me break this into actionable tasks with time estimates."
```

### Step 5: Implement

```
"I'm ready to implement the tasks from:
.specify/tasks/email-notifications-tasks.md

Let's start with Task 1.1. Please help me implement it following
our constitution principles and logging standards."
```

---

## 📋 Quick Start Scripts

Create helper scripts to speed up the process:

### `create-spec.sh`
```bash
#!/bin/bash
FEATURE_NAME=$1

mkdir -p .specify/specifications .specify/plans .specify/tasks

# Copy templates
cp .specify/MANUAL-WORKFLOW.md .specify/specifications/${FEATURE_NAME}.md
cp .specify/MANUAL-WORKFLOW.md .specify/plans/${FEATURE_NAME}-plan.md
cp .specify/MANUAL-WORKFLOW.md .specify/tasks/${FEATURE_NAME}-tasks.md

echo "Created spec files for: $FEATURE_NAME"
```

### `create-spec.bat` (Windows)
```batch
@echo off
set FEATURE_NAME=%1

mkdir .specify\specifications 2>nul
mkdir .specify\plans 2>nul
mkdir .specify\tasks 2>nul

echo Created directories for: %FEATURE_NAME%
echo.
echo Next steps:
echo 1. Edit .specify\specifications\%FEATURE_NAME%.md
echo 2. Ask Claude to review
echo 3. Create plan with Claude's help
echo 4. Break into tasks
echo 5. Implement!
```

---

## 💡 Example: Real Feature Development

### Email Notifications Feature

**1. Create Specification:**
```
File: .specify/specifications/email-notifications.md

Feature: Email Notifications for New Posts

User Story:
As a blog owner, I want email notifications when posts are created,
so I can review them quickly.

Requirements:
1. Send email after draft post creation
2. Include post title, word count, Blogger link
3. Use free email service (Gmail SMTP)
4. Configurable recipients
5. HTML + plain text templates

Constitution Alignment:
✅ Zero Intervention - Automated after post creation
✅ Safety First - Only for drafts, not published
✅ Comprehensive Logging - All email attempts logged
✅ Cost-Effective - Free Gmail SMTP
✅ Quality - Professional email templates
```

**2. Ask Claude:**
```
"I've created a spec at .specify/specifications/email-notifications.md
Help me create a technical plan following our constitution."
```

**3. Claude Creates Plan:**
```
File: .specify/plans/email-notifications-plan.md

Components to Create:
1. EmailNotificationSystem class
   - File: blogger-mcp/email-notification-system.js
   - Methods: sendNewPostEmail(), loadTemplate()

2. Email templates
   - File: blogger-mcp/email-templates/new-post.html
   - File: blogger-mcp/email-templates/new-post.txt

Configuration:
- EMAIL_SMTP_HOST=smtp.gmail.com
- EMAIL_SMTP_PORT=587
- EMAIL_FROM=your-email@gmail.com
- EMAIL_TO=recipient@example.com
```

**4. Break into Tasks:**
```
File: .specify/tasks/email-notifications-tasks.md

Phase 1: Setup (15 min)
- [ ] Install nodemailer
- [ ] Create email-notification-system.js skeleton
- [ ] Add EMAIL_* to .env

Phase 2: Implementation (45 min)
- [ ] Implement EmailNotificationSystem class
- [ ] Create HTML template
- [ ] Create plain text template
- [ ] Add logging

Phase 3: Integration (20 min)
- [ ] Import in automated-content-pipeline.js
- [ ] Call after createBlogPost()
- [ ] Handle errors gracefully

Phase 4: Testing & Docs (25 min)
- [ ] Test with 1 post
- [ ] Test email failure
- [ ] Update documentation

Total: ~2 hours
```

**5. Implement with Claude:**
```
"Let's implement Phase 1 Task 1: Install nodemailer and create the class skeleton"
```

---

## ✅ Benefits of This Manual Approach

1. **Same principles** - Follows spec-kit methodology
2. **Version controlled** - All in `.specify/` directory
3. **Reviewable** - Can review plans before coding
4. **Structured** - Consistent across features
5. **Constitution-aligned** - Every spec references constitution
6. **Flexible** - Can adapt templates as needed

---

## 🎯 Pro Tips

1. **Always reference constitution** in your specs
2. **Use Claude to review** your specifications
3. **Break tasks small** - 15-30 minute chunks
4. **Track progress** - Update task status regularly
5. **Learn from past specs** - Reuse patterns that work

---

**This manual workflow gives you spec-driven development without needing the CLI commands!** 🚀
