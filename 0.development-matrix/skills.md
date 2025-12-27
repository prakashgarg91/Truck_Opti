<!-- BREADCRUMB: 0.development-matrix/ -->
<!-- 
📂 DEVELOPMENT MATRIX STRUCTURE:
├── INDEX.md .................. Start here - Full navigation
├── 0.development.md .......... Development rules & contract
├── USER-REQUIREMENTS.md ...... What user wants (READ-ONLY)
├── features.json ............. Feature status (machine-readable)
├── PROGRESS.md ............... Phase completion tracking
├── relationships.md .......... File/DB/API dependencies
├── skills.md ................. [YOU ARE HERE] Learnings
├── ENGINEERING-GUARDRAILS.md . Anti-patterns to avoid
├── CONFESSION.md ............. Known bugs & gaps
├── MENU-CHART.md ............. Menu system documentation
└── ARCHITECTURE.md ........... System architecture
-->

---
name: full-stack-development-skills
description: Learnings from Blogger-MCP development for AI agents to avoid repeated errors
version: 1.0.0
applicable_to: [monorepo, react, express, typescript, sqlite]
---

# Full-Stack Development Skills for AI Agents

## 🎯 Core Principle: Test Like a User, Not Like a Theorist

**NEVER claim a feature works without actually executing and verifying it.**

## 1. Iterative Testing Protocol

### Start Small → Build Up → Test Fully

```
Level 1: Syntax Check
  └── Does it compile? (tsc --noEmit, eslint)
  
Level 2: Unit Verification  
  └── Does the function return expected output?
  
Level 3: Integration Check
  └── Do services communicate correctly?
  
Level 4: User Simulation
  └── Click through UI, check network tab, verify database state
  
Level 5: Edge Cases
  └── Empty states, errors, loading, concurrent operations
```

### Anti-Pattern: False Positives
```
❌ "I updated the code, it should work now"
❌ "The logic looks correct"
❌ "Based on the pattern, this will work"

✅ "I ran the command and got this output: [actual output]"
✅ "I navigated to /page and verified the data renders"
✅ "I checked the database and the row was inserted"
```

## 2. Relationship Mapping

### Before Touching Any Code, Map These:

```
FILE RELATIONSHIPS
├── Import Chain: Who imports this file?
├── Export Usage: Where are exports consumed?
├── Type Dependencies: What types does it need?
└── Side Effects: Does it initialize anything on import?

DATA FLOW
├── Source: Where does data originate? (API, DB, state)
├── Transform: What modifications happen?
├── Destination: Where does it end up? (UI, DB, external API)
└── Errors: What happens when each step fails?

SERVICE DEPENDENCIES
├── What services must be running? (Docker, Redis, Qdrant)
├── What env vars are required?
├── What's the startup order?
└── What happens if a dependency is down?
```

### Example from Blogger-MCP:

```
Posts.tsx
├── Imports from: ../services/posts.ts (publishPost, unpublishPost, deletePost)
├── Uses hooks: usePosts, useBlogs from ../hooks/useApi.ts
├── Navigation: useNavigate to /content-editor
├── API calls: POST /api/posts/:id/publish, DELETE /api/posts/:id
└── Dependencies: Server must be running on port 3001

posts.ts (service)
├── Uses: apiClient from ./api.ts
├── Types: Post, UpdatePostData from same file
├── Note: updatePost does NOT accept 'published' status - use publishPost()
└── Returns: Promise<Post> via apiRequest wrapper
```

## 3. Common Error Patterns & Solutions

### TypeScript Import Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Module has no exported member 'X'` | Wrong source file | Check actual exports in target file |
| `Type 'X' is not assignable to 'Y'` | Interface mismatch | Read the interface definition, don't assume |
| ESM import needs `.js` extension | Server uses ESM | `from './service.js'` not `from './service'` |

### React State Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Blank page | Unhandled error in render | Check browser console, add error boundary |
| Stale data | Missing refetch | Call `refetch()` after mutations |
| Loading forever | Promise never resolves | Check network tab, verify endpoint exists |

### Database Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| `SQLITE_ERROR: no such table` | Migration not run | Check db/index.ts for table creation |
| Data not persisting | Wrong db path | Verify DATABASE_PATH in .env |
| Sync issues | better-sqlite3 is synchronous | Don't use async/await with it |

## 4. Verification Checklist

### Before Marking Any Task Complete:

- [ ] **Compiled without errors** - `tsc --noEmit` passes
- [ ] **No console errors** - Browser DevTools clean
- [ ] **API responds correctly** - Network tab shows 200/expected status
- [ ] **Database updated** - Queried and verified row exists/changed
- [ ] **UI reflects change** - Visual confirmation, not assumption
- [ ] **Error states handled** - Tested with bad input, disconnected services
- [ ] **Documented in CONFESSION.md** - Any known limitations noted

## 5. Project-Specific Learnings (Blogger-MCP)

### Architecture Gotchas

1. **Dashboard ↔ Server Communication**
   - Dashboard uses `/api` prefix (Vite proxy handles it)
   - Server runs on 3001, Dashboard on 5173
   - CORS configured for localhost:5173 only

2. **Service Patterns**
   - Services export singletons: `export const sourceMonitor = new SourceMonitorService()`
   - Routes import services, services import db
   - Never import services circularly

3. **AI Provider Fallback**
   - Chain: Gemini → OpenRouter → OpenAI → Anthropic
   - If all fail, error message should list which keys ARE configured
   - Check `process.env.GEMINI_API_KEY`, etc.

4. **WebSocket Events**
   - Server emits via `io.emit('event:name', payload)`
   - Dashboard subscribes via `useWebSocket().on('event:name', handler)`
   - Events defined in `websocket.ts` types

### Files That Break Everything If Wrong

| File | Impact | Be Careful With |
|------|--------|-----------------|
| `server/src/index.ts` | Server won't start | Route registration order |
| `server/src/db/index.ts` | All data access fails | Table schemas |
| `dashboard/src/App.tsx` | Entire UI breaks | Route definitions, imports |
| `dashboard/src/services/api.ts` | All API calls fail | Base URL, interceptors |

## 6. Testing Commands Reference

```bash
# TypeScript check (dashboard)
cd dashboard && npx tsc --noEmit

# TypeScript check (server)  
cd server && npx tsc --noEmit

# Start and watch logs
npm run dev 2>&1 | tee dev.log

# Check if services are running
curl http://localhost:3001/api/health
curl http://localhost:6333/collections  # Qdrant

# Database inspection
sqlite3 server/data/blogger-mcp.db ".tables"
sqlite3 server/data/blogger-mcp.db "SELECT * FROM posts LIMIT 5;"
```

## 7. When Stuck: Systematic Debug Protocol

```
1. READ THE ACTUAL ERROR (not just the summary)
2. FIND THE FILE:LINE mentioned in stack trace
3. CHECK IMPORTS - are they from the right file?
4. CHECK TYPES - does the interface match usage?
5. CHECK RUNTIME - is the service/db/api actually running?
6. REPRODUCE MINIMALLY - can you trigger it with curl/browser?
7. FIX ONE THING - don't change multiple things at once
8. VERIFY THE FIX - actually test, don't assume
```

---

## 8. Kaizen Debug Protocol (NEW - Session 18)

### The JavaScript URL Lesson (December 26, 2025)

**Problem:** Content Extraction Pipeline found PDFs but couldn't download them. Logs showed "fetch failed" but no clear error.

**Root Cause Discovery Process:**
```
1. ENABLED DEBUG LOGGING
   - Set LOG_LEVEL=debug in server/.env
   - Redirected output: npm run dev 2>&1 | tee error-logs/debug.log

2. ANALYZED LOG PATTERNS
   - Searched for "error", "failed", "warning"
   - Found: URLs like javascript:OpenWindowByRelativeURL('L','/path/file.pdf', true)
   - Realized: You CAN'T HTTP fetch a javascript: URL!

3. DOCUMENTED IN KAIZEN FILE
   - Created KAIZEN-2025-12-26.md with analysis
   - Listed root cause, patterns found, fix applied

4. APPLIED TARGETED FIX
   - Added parseJavaScriptUrl() method
   - Extracts actual PDF path from JavaScript URL
   - Handles 4 patterns: OpenWindowByRelativeURL, window.open, location.href, generic

5. VERIFIED WITH ACTUAL OUTPUT
   - Ran server again, watched logs
   - Saw: "PAN PDF: 14 chunks indexed"
   - Confirmed fix working before committing
```

### Kaizen Analysis Template

Create `0.development-matrix/error-logs/KAIZEN-YYYY-MM-DD.md`:

```markdown
# Kaizen Error Analysis - YYYY-MM-DD HH:MM

## Log Source
- File: [log filename]
- Generated: [timestamp]

## Summary
- Total warnings/errors found: X
- Fixed issues: Y
- Remaining non-critical: Z

## Issues Found

### 1. [Issue Name]
**Error Pattern:** [what you saw in logs]
**Root Cause:** [why it happened]
**Fix Applied:** [what you changed]
**Verified:** [how you confirmed it works]

## Action Items
- [x] Fixed item 1
- [ ] Remaining item for later
```

### Key Learnings

```
❌ "It should work now" - without testing
❌ Assuming error messages tell the whole story
❌ Fixing multiple things at once
❌ Not documenting what you learned

✅ Enable debug logging FIRST
✅ Capture actual log output to file
✅ Create KAIZEN document with root cause
✅ Verify fix with actual output, not assumptions
✅ Commit both fix AND documentation
```

---

## 9. Web Scraping Best Practices

### The IGNOU Lesson (December 21, 2025)

**Problem:** IGNOU and other government sites blocked/failed our basic `fetch()` calls.

**Root Cause:**
- Basic user-agent (`Blogger-MCP/1.0`) flagged as bot
- No rate limiting caused suspicion
- No retry logic meant temporary failures became permanent
- SSL/timeout errors crashed the whole check

**Solution:** Created `robust-fetch.ts` utility:
```typescript
// ✅ CORRECT - use robustFetch for external sites
import { robustFetch } from '../utils/robust-fetch.js';

const result = await robustFetch(url, {
  timeout: 30000,
  maxRetries: 2,
  contentType: 'html',
});

if (result.success) {
  const html = result.content;
}
```

### Key Learnings

```
1. USER-AGENT ROTATION - Real browser UAs, not bot identifiers
2. RATE LIMITING - 2s minimum between same-domain requests  
3. EXPONENTIAL BACKOFF - 1s → 2s → 4s delays on retries
4. GRACEFUL ERRORS - Don't retry unrecoverable (DNS, SSL certs)
5. 403/429 HANDLING - Wait longer before retry
6. ETHICAL INTENT - DNT header, Google referrer
```

### Anti-Patterns for Web Scraping

```
❌ await fetch(url) // No retries, basic UA
❌ Making 10 requests/second to same domain
❌ Using "Bot" or "Crawler" in user agent
❌ Ignoring 429 rate limit responses
❌ Crashing on first failure

✅ await robustFetch(url, { maxRetries: 2 })
✅ 2+ second delay between same-domain requests
✅ Browser-like user agent rotation
✅ Respect Retry-After header on 429
✅ Log warning and continue on failure
```

---

*Last Updated: December 26, 2025*
