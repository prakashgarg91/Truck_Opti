<!-- BREADCRUMB: 0.development-matrix/ -->
<!-- 
📂 DEVELOPMENT MATRIX STRUCTURE:
├── INDEX.md .................. Start here - Full navigation
├── 0.development.md .......... Development rules & contract
├── USER-REQUIREMENTS.md ...... What user wants (READ-ONLY)
├── features.json ............. Feature status (machine-readable)
├── PROGRESS.md ............... Phase completion tracking
├── relationships.md .......... File/DB/API dependencies
├── skills.md ................. Testing protocols & learnings
├── ENGINEERING-GUARDRAILS.md . [YOU ARE HERE] Anti-patterns
├── CONFESSION.md ............. Known bugs & gaps
├── MENU-CHART.md ............. Menu system documentation
└── ARCHITECTURE.md ........... System architecture
-->

# ENGINEERING-GUARDRAILS.md

## Purpose
This file defines recurring mistakes, anti-patterns, and engineering violations that must be avoided during development.

It serves as a **long-term memory and preventive system** for both humans and AI agents.
This document **evolves continuously** as new issues, bugs, or conceptual mistakes are discovered.

Guardrails are **timeless lessons** (unlike bugs or TODOs) and must be preserved across refactors and versions.

---

## When to Add or Update a Guardrail (Trigger Conditions)

A new entry **MUST** be added to this file when a discovered issue satisfies **any 2 or more** of the following conditions:

- Likely to repeat in future development
- Conceptual mistake (not just syntax or typo)
- Costly or risky if repeated (bugs, data loss, security, logic errors)
- Related to system design, architecture, or domain intent
- Preventable by defining a clear rule or constraint

### Decision Rule (for AI Agents and Humans)

```text
If YES to ≥2 conditions → Add or update a Guardrail
If YES to ≥3 conditions → Mark Severity as High
```

---

## Guardrail Categories

### 🔴 CRITICAL (System-Breaking)

#### GR-001: Never Use console.log in Server Code
- **Severity:** High
- **Category:** Logging
- **Rule:** Always use Winston logger from `../utils/logger.js`, never `console.log`
- **Why:** console.log doesn't write to log files, has no levels, breaks production debugging
- **Correct:** `logger.info('message')`, `logger.error('error', error)`
- **Wrong:** `console.log('debug')`, `console.error('failed')`

#### GR-002: ESM Import Extensions Required in Server
- **Severity:** High
- **Category:** TypeScript/ESM
- **Rule:** Server imports MUST include `.js` extension
- **Why:** Server uses ESM modules; missing extensions cause runtime errors
- **Correct:** `import { db } from '../db/index.js'`
- **Wrong:** `import { db } from '../db/index'`

#### GR-003: Never Claim Features Work Without Testing
- **Severity:** Critical
- **Category:** Development Process
- **Rule:** Never say "it should work" or "the logic looks correct" without actual verification
- **Why:** False positives waste time and create technical debt
- **Correct:** "I ran the command and got: [actual output]"
- **Wrong:** "I updated the code, it should work now"

#### GR-004: Check relationships.md Before Modifying Files
- **Severity:** High
- **Category:** Architecture
- **Rule:** Before editing any file, check its dependencies in relationships.md
- **Why:** Changes can cascade to dependent files; understanding impact prevents breaks
- **Files:** See `0.development-matrix/relationships.md` for full dependency graph

---

### 🟡 IMPORTANT (Logic/Data Errors)

#### GR-010: Post Status Type Mismatch
- **Severity:** Medium
- **Category:** Types
- **Rule:** Dashboard `UpdatePostData.status` cannot be `'published'` - use `publishPost()`/`unpublishPost()`
- **Why:** Server POST endpoints handle status transitions; PATCH doesn't accept published
- **Correct:** `await publishPost(post.id)` or `await unpublishPost(post.id)`
- **Wrong:** `await updatePost(post.id, { status: 'published' })`

#### GR-011: better-sqlite3 is Synchronous
- **Severity:** Medium
- **Category:** Database
- **Rule:** Never use async/await with better-sqlite3 methods
- **Why:** better-sqlite3 is synchronous; async wrapping creates unnecessary complexity
- **Correct:** `const row = db.prepare('SELECT...').get(id)`
- **Wrong:** `const row = await db.prepare('SELECT...').get(id)`

#### GR-012: API Response Format Consistency
- **Severity:** Medium
- **Category:** API Design
- **Rule:** All API responses MUST use `{ success: boolean, data: T }` format
- **Why:** Dashboard apiRequest wrapper expects this structure
- **Correct:** `res.json({ success: true, data: result })`
- **Wrong:** `res.json(result)` or `res.json({ result })`

#### GR-013: Service Singleton Exports
- **Severity:** Medium
- **Category:** Architecture
- **Rule:** Services must export singleton instances, not classes
- **Why:** Multiple instances cause state inconsistency and duplicate initialization
- **Correct:** `export const sourceMonitor = new SourceMonitorService()`
- **Wrong:** `export class SourceMonitorService { }` (without singleton)

---

### 🟢 RECOMMENDED (Best Practices)

#### GR-020: Dashboard API Service Location
- **Severity:** Low
- **Category:** Organization
- **Rule:** Each entity type has its own service file in `dashboard/src/services/`
- **Why:** posts.ts, blogs.ts, sources.ts - keeps code organized and types colocated
- **Correct:** Import from specific service: `from '../services/posts'`
- **Wrong:** Import from generic api: `from '../services/api'` (unless for apiClient itself)

#### GR-021: Navigation Uses useNavigate Hook
- **Severity:** Low
- **Category:** React Patterns
- **Rule:** For programmatic navigation, use `useNavigate()` from react-router-dom
- **Why:** Consistent with React Router v6 patterns, enables relative navigation
- **Correct:** `const navigate = useNavigate(); navigate('/path')`
- **Wrong:** `window.location.href = '/path'`

#### GR-022: Loading States for Async Actions
- **Severity:** Low
- **Category:** UX
- **Rule:** All buttons triggering async actions should show loading state
- **Why:** Prevents double-clicks, gives user feedback, professional UX
- **Pattern:** `const [isLoading, setIsLoading] = useState<string | null>(null)`

#### GR-023: Error Boundaries for Page Components
- **Severity:** Low
- **Category:** Error Handling
- **Rule:** Wrap pages in error boundaries to prevent blank screens
- **Why:** Unhandled render errors cause blank pages with no feedback
- **Symptom:** Page shows completely white/blank - check browser console

#### GR-024: Use robustFetch for External HTTP Requests
- **Severity:** Medium
- **Category:** Web Scraping
- **Rule:** For scraping external websites, use `robustFetch()` from `utils/robust-fetch.js`
- **Why:** Basic fetch fails on rate-limited/blocking sites; robustFetch handles retries, rate limiting, user-agent rotation
- **Correct:** `import { robustFetch } from '../utils/robust-fetch.js'; await robustFetch(url, { timeout: 30000 })`
- **Wrong:** `await fetch(url)` for external sites (internal APIs are fine)

#### GR-025: Rate Limit External API Calls
- **Severity:** Medium  
- **Category:** External APIs
- **Rule:** Requests to same external domain must have minimum 2s delay
- **Why:** Prevents IP blocking, respects website resources, ethical scraping
- **Implementation:** robustFetch handles this automatically via requestTimings map
- **Manual:** Use `await sleep(2000)` between same-domain requests if not using robustFetch

#### GR-026: Parse JavaScript URLs Before Fetching
- **Severity:** High
- **Category:** Web Scraping
- **Rule:** When extracting URLs from HTML, check for `javascript:` protocol and parse actual path
- **Why:** `javascript:OpenWindowByRelativeURL()` URLs cannot be HTTP fetched - will always fail
- **Correct:** Use `parseJavaScriptUrl(url, baseUrl)` to extract actual PDF/page path
- **Wrong:** `await fetch('javascript:OpenWindowByRelativeURL(...)')` - always fails
- **Patterns:** `OpenWindowByRelativeURL`, `window.open()`, `location.href=`
- **Added:** Session 18 (December 2025) after Kaizen analysis

---

## Violation Response Protocol

When a guardrail is violated:

1. **Stop** - Don't proceed with more changes
2. **Fix** - Correct the violation immediately
3. **Verify** - Test that the fix works
4. **Document** - If it's a new pattern, add to this file
5. **Learn** - Add to skills.md if reusable lesson

---

## Adding New Guardrails

Use this template:

```markdown
#### GR-XXX: [Short Title]
- **Severity:** Critical/High/Medium/Low
- **Category:** [Logging/Types/API/Architecture/Database/React/UX/etc.]
- **Rule:** [Clear, actionable rule]
- **Why:** [Explanation of consequences]
- **Correct:** [Code example of correct approach]
- **Wrong:** [Code example of what to avoid]
```

---

*Last Updated: December 26, 2025*
*Total Guardrails: 13*
