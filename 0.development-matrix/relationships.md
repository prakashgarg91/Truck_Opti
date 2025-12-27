<!-- BREADCRUMB: 0.development-matrix/ -->
<!-- 
📂 DEVELOPMENT MATRIX STRUCTURE:
├── INDEX.md .................. Start here - Full navigation
├── 0.development.md .......... Development rules & contract
├── USER-REQUIREMENTS.md ...... What user wants (READ-ONLY)
├── features.json ............. Feature status (machine-readable)
├── PROGRESS.md ............... Phase completion tracking
├── relationships.md .......... [YOU ARE HERE] Dependencies
├── skills.md ................. Testing protocols & learnings
├── ENGINEERING-GUARDRAILS.md . Anti-patterns to avoid
├── CONFESSION.md ............. Known bugs & gaps
├── MENU-CHART.md ............. Menu system documentation
└── ARCHITECTURE.md ........... System architecture
-->

# RELATIONSHIPS.md - System Dependency Map

**Version:** 1.3.0 | **Last Updated:** December 26, 2025

> **Purpose:** Single source of truth for all system relationships. Consult before making changes to understand impact.

---

## 1. Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BLOGGER-MCP SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐      HTTP/WS       ┌─────────────┐      MCP        ┌─────┐│
│  │  Dashboard  │ ◄─────────────────►│   Server    │◄───────────────►│ MCP ││
│  │  Port 5173  │                    │  Port 3001  │                 │Tools││
│  └─────────────┘                    └─────────────┘                 └─────┘│
│        │                                   │                                │
│        │ Vite Proxy                        │ SQLite                        │
│        │ /api → :3001                      │ better-sqlite3                │
│        ▼                                   ▼                                │
│  ┌─────────────┐                    ┌─────────────┐                        │
│  │   Browser   │                    │  Database   │                        │
│  │  React SPA  │                    │blogger-mcp.db                        │
│  └─────────────┘                    └─────────────┘                        │
│                                            │                                │
│                          ┌─────────────────┼─────────────────┐              │
│                          ▼                 ▼                 ▼              │
│                    ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│                    │  Qdrant  │      │  Redis   │      │ External │        │
│                    │  :6333   │      │  :6379   │      │   APIs   │        │
│                    │(optional)│      │(optional)│      │ (Google) │        │
│                    └──────────┘      └──────────┘      └──────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. File Dependency Graph

### Dashboard (React)

```
dashboard/src/
├── main.tsx
│   └── imports: App.tsx
│
├── App.tsx (CRITICAL - breaks entire UI if wrong)
│   ├── imports: all pages from ./pages/index.ts
│   ├── imports: AuthProvider from ./context/AuthContext
│   ├── defines: Routes, Sidebar navigation
│   └── uses: react-router-dom
│
├── pages/index.ts (barrel export)
│   └── exports: Dashboard, Blogs, Posts, Sources, Analytics, etc.
│
├── pages/*.tsx
│   ├── imports: components from ../components/
│   ├── imports: hooks from ../hooks/useApi.ts
│   ├── imports: services from ../services/*.ts
│   └── uses: react-router-dom (useNavigate, useParams)
│
├── services/api.ts (CRITICAL - all API calls depend on this)
│   ├── exports: apiClient (axios instance)
│   ├── exports: apiRequest<T>, paginatedRequest<T>
│   └── configures: baseURL, interceptors, error handling
│
├── services/*.ts (blogs.ts, posts.ts, sources.ts)
│   ├── imports: apiClient, apiRequest from ./api.ts
│   └── exports: typed API functions
│
├── hooks/useApi.ts
│   ├── imports: useQuery, useMutation from @tanstack/react-query
│   ├── imports: services from ../services/
│   └── exports: useBlogs, usePosts, useSources, etc.
│
└── hooks/useWebSocket.ts
    ├── imports: socket.io-client
    └── exports: useWebSocket hook for real-time events
```

### Server (Express)

```
server/src/
├── index.ts (CRITICAL - server entry point)
│   ├── imports: all routes from ./routes/*.js
│   ├── imports: all services for initialization
│   ├── imports: db from ./db/index.js
│   ├── imports: websocket from ./websocket.js
│   └── registers: middleware, routes, error handlers
│
├── db/index.ts (CRITICAL - all data access)
│   ├── exports: db (better-sqlite3 instance)
│   ├── exports: initializeDatabase(), closeDatabase()
│   └── creates: all 14+ tables on init
│
├── routes/*.ts
│   ├── imports: db from ../db/index.js
│   ├── imports: services from ../services/*.js
│   ├── imports: logger from ../utils/logger.js
│   └── exports: Router instance
│
├── services/*.ts
│   ├── imports: db from ../db/index.js
│   ├── imports: logger from ../utils/logger.js
│   └── exports: singleton service instances
│
├── websocket.ts
│   ├── imports: socket.io
│   ├── exports: initializeWebSocket(), setGlobalIO()
│   └── defines: event types and payloads
│
└── utils/logger.ts
    └── exports: winston logger (use this, never console.log)
```

---

## 3. Database Schema Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE RELATIONSHIPS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  blogs (1) ─────────────────────────────── (N) posts                       │
│    │                                              │                         │
│    │ blog_id                                      │ post_id                 │
│    ▼                                              ▼                         │
│  blog_settings (1:1)                         post_analytics (1:1)          │
│                                                   │                         │
│                                                   │ post_id                 │
│  official_sources (1) ──────────────────── (N) source_endpoints            │
│    │                                              │                         │
│    │ source_id                                    │ endpoint_id             │
│    ▼                                              ▼                         │
│  source_changes (N)                          change_records (N)            │
│                                                   │                         │
│                                                   │ change_id               │
│                                                   ▼                         │
│                                              content_extractions (N)        │
│                                                                             │
│  knowledge_base (standalone)                                                │
│    │                                                                        │
│    │ id                                                                     │
│    ▼                                                                        │
│  knowledge_citations (N)                                                    │
│                                                                             │
│  content_queue (standalone) ─── pipeline_topics                            │
│  publish_queue (standalone)                                                 │
│  automation_rules (standalone)                                              │
│  unified_ai_config (singleton - id=1)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Tables & Their Purpose

| Table | Purpose | Key Columns | Used By |
|-------|---------|-------------|---------|
| `blogs` | Blog configurations | id, name, url, blogger_id | blogs.ts route |
| `posts` | Blog post content | id, blog_id, title, content, status | posts.ts route |
| `official_sources` | Monitored sources | id, name, base_url, status | sources.ts route |
| `source_endpoints` | URLs to check | id, source_id, path, content_hash | source-monitor.ts |
| `source_changes` | Detected changes | id, source_id, change_type, detected_at | sources.ts route |
| `content_extractions` | Extracted PDFs/content | id, change_id, content_type, title, indexed_at | extraction.ts route |
| `knowledge_base` | RAG knowledge | id, title, content, embedding | knowledge.ts route |
| `pipeline_topics` | Content pipeline | id, topic, status, priority | pipeline.ts route |
| `unified_ai_config` | AI settings | id=1, config (JSON) | unified-ai.ts |

---

## 4. API Endpoint → Page Mapping

| Page | Primary Endpoints | Services Used |
|------|-------------------|---------------|
| `Dashboard.tsx` | `/api/health`, `/api/blogs`, `/api/posts/stats` | health.ts, blogs.ts, posts.ts |
| `Blogs.tsx` | `/api/blogs` (CRUD) | blogs.ts |
| `Posts.tsx` | `/api/posts`, `/api/posts/:id/publish` | posts.ts |
| `Sources.tsx` | `/api/sources`, `/api/sources/:id/check` | sources.ts, source-monitor.ts |
| `ContentEditor.tsx` | `/api/content/generate`, `/api/posts` | content-generation.ts, posts.ts |
| `Pipeline.tsx` | `/api/pipeline/*` | pipeline.ts, content-pipeline.ts |
| `KnowledgeBase.tsx` | `/api/knowledge/*`, `/api/extraction/*` | knowledge.ts, qdrant-knowledge.ts, content-extraction-pipeline.ts |
| `Analytics.tsx` | `/api/analytics/*` | (mock data currently) |
| `Settings.tsx` | `/api/ai-settings/*`, `/api/unified-ai/*` | ai-settings.ts, unified-ai.ts |
| `SeoDashboard.tsx` | `/api/seo/*` | seo.ts, seo-analyzer.ts |
| `SearchConsole.tsx` | `/api/search-console/*` | search-console.ts |

---

## 5. Service Dependencies

### Initialization Order (server/src/index.ts)

```
1. Load environment variables (dotenv)
2. Initialize database (initializeDatabase)
3. Create Express app
4. Apply middleware (cors, helmet, compression)
5. Register routes
6. Initialize WebSocket
7. Start services:
   - qdrantKnowledgeService.initialize()
   - schedulerService (cron jobs)
   - contentQueueService
   - sourceMonitor (if enabled)
   - contentPipelineService
8. Start HTTP server
```

### Service → Service Dependencies

```
ai-content.ts
├── depends on: unified-ai.ts (fallback provider)
└── depends on: process.env.GEMINI_API_KEY

unified-ai.ts
├── depends on: db (for config storage)
├── depends on: Multiple AI provider env vars
└── depends on: @google/generative-ai

source-monitor.ts
├── depends on: db (source_endpoints table)
└── emits: WebSocket events (source:checked)

content-pipeline.ts
├── depends on: ai-content.ts
├── depends on: seo-analyzer.ts
├── depends on: db (pipeline_topics table)
└── emits: WebSocket events (pipeline:*)

qdrant-knowledge.ts
├── depends on: QDRANT_URL env var
├── depends on: @qdrant/js-client-rest
└── optional: fails gracefully if Qdrant not running

pdf-processor.ts (NEW - December 2025)
├── depends on: pdf-parse v2.4.5 (class-based API)
├── depends on: tesseract.js (OCR for scanned PDFs)
├── depends on: qdrant-knowledge.ts (vector storage)
├── depends on: db (processed_pdfs table)
├── depends on: logger.ts
└── stores in: Qdrant collection + SQLite tracking

content-extraction-pipeline.ts (NEW - December 2025)
├── depends on: pdf-processor.ts (PDF download & processing)
├── depends on: qdrant-knowledge.ts (vector storage)
├── depends on: robust-fetch.ts (anti-blocking fetch)
├── depends on: cheerio (HTML parsing for PDF links)
├── depends on: db (source_changes, content_extractions tables)
├── depends on: logger.ts
├── exports: contentExtractionPipeline (singleton)
├── initializes: 5-minute auto-processing interval
├── used by: index.ts (server startup)
└── routes: extraction.ts (/api/extraction/*)

docker-manager.ts (NEW - December 2025)
├── depends on: child_process (exec)
├── depends on: docker + docker-compose
├── initializes: Qdrant container (port 6333)
└── initializes: Redis container (port 6379)
```

---

## 6. Type Dependencies

### Shared Types (server/src/types/index.ts)

```typescript
// Used across routes and services
Blog, Post, Source, KnowledgeEntry
ApiResponse<T>, PaginatedResponse<T>
OfficialSource, SourceEndpoint, SourceChange
```

### Dashboard Types (dashboard/src/services/*.ts)

```typescript
// Each service file defines its own types
// posts.ts: Post, CreatePostData, UpdatePostData, PostFilters
// blogs.ts: Blog, CreateBlogData, UpdateBlogData
// These MUST match server response shapes
```

### Type Sync Issues to Watch

| Dashboard Type | Server Type | Watch For |
|----------------|-------------|-----------|
| `Post.status` | `post.status` | Dashboard: `'draft' \| 'published'`, Server may have more |
| `UpdatePostData.status` | `posts.ts` route | Cannot set `'published'` directly - use `publishPost()` |
| `Blog.status` | `blogs.ts` route | Values must match exactly |

---

## 7. WebSocket Event Flow

```
SERVER                              DASHBOARD
──────                              ─────────
                                    
sourceMonitor.checkSource()         
    │                               
    ├─► io.emit('source:checked')  ──────►  useWebSocket().on('source:checked')
    │                                            │
    │                                            ▼
    │                               ActivityFeed component updates
    │                               
contentPipeline.process()           
    │                               
    ├─► io.emit('pipeline:started') ──────►  Pipeline.tsx state update
    ├─► io.emit('pipeline:step')    ──────►  Progress indicator
    └─► io.emit('pipeline:completed')──────► Refresh topic list
```

### Event Types (server/src/websocket.ts)

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `blog:*` | `{ blogId, name?, changes? }` | Blog CRUD operations |
| `post:*` | `{ postId, blogId?, title? }` | Post CRUD operations |
| `source:checked` | `{ sourceId, hasChanges, changesCount }` | sourceMonitor |
| `pipeline:*` | `{ pipelineId, type, step?, status? }` | contentPipeline |
| `activity:log` | `{ id, type, message, timestamp }` | Various services |

---

## 8. External API Dependencies

| Service | API | Required Env Vars | Fallback |
|---------|-----|-------------------|----------|
| Blogger | Google Blogger API v3 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | None - required |
| AI Content | Gemini | `GEMINI_API_KEY` | OpenRouter → OpenAI → Anthropic |
| AI Content | OpenRouter | `OPENROUTER_API_KEY` | Next in chain |
| AI Content | OpenAI | `OPENAI_API_KEY` | Next in chain |
| AI Content | Anthropic | `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` | Error |
| Vector DB | Qdrant | `QDRANT_URL` | Knowledge Base disabled |
| Search Console | Google Search Console API | Google OAuth | Features disabled |
| Analytics | Google Analytics API | Google OAuth | Mock data |

---

## 9. Critical File Change Impact Matrix

| If You Change... | Check These... | Risk Level |
|------------------|----------------|------------|
| `server/src/db/index.ts` | All routes, all services | 🔴 HIGH |
| `server/src/index.ts` | Server startup, route registration | 🔴 HIGH |
| `dashboard/src/App.tsx` | All page routing, sidebar | 🔴 HIGH |
| `dashboard/src/services/api.ts` | All API calls | 🔴 HIGH |
| `server/src/types/index.ts` | All routes using types | 🟡 MEDIUM |
| `dashboard/src/services/*.ts` | Pages using that service | 🟡 MEDIUM |
| `server/src/routes/*.ts` | Dashboard pages calling those endpoints | 🟡 MEDIUM |
| `server/src/services/*.ts` | Routes using that service | 🟡 MEDIUM |
| `server/src/services/intelligent-source-discovery.ts` | source-monitor.ts, sources.ts | 🟡 MEDIUM |
| `server/src/services/pdf-processor.ts` | knowledge-base.ts route, Qdrant storage | 🟡 MEDIUM |
| `server/src/utils/docker-manager.ts` | Server startup, Qdrant/Redis availability | 🟡 MEDIUM |
| `dashboard/src/pages/*.tsx` | Just that page | 🟢 LOW |
| `dashboard/src/components/*.tsx` | Pages using that component | 🟢 LOW |

---

## 10. Intelligent Source Discovery (NEW - Session 11)

### Self-Healing Source System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTELLIGENT SOURCE DISCOVERY FLOW                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  source-monitor.ts                   intelligent-source-discovery.ts        │
│  ┌─────────────────┐                 ┌─────────────────────────────────┐   │
│  │ checkEndpoint() │                 │ discoverEndpoints()             │   │
│  │     │           │                 │   ├── analyzePageForEndpoints() │   │
│  │     ▼           │                 │   ├── discoverRssFeeds()        │   │
│  │ HTTP 404?  ─────┼────────────────►│   └── checkWebsiteTemplates()   │   │
│  │     │           │  scheduleAutoFix│                                 │   │
│  │     │           │                 │ autoFixBrokenEndpoints()        │   │
│  │     ▼           │◄────────────────┤   ├── scan homepage             │   │
│  │ Record error    │  Add endpoints  │   ├── find alternatives         │   │
│  └─────────────────┘                 │   └── return count              │   │
│                                      └─────────────────────────────────┘   │
│                                                                             │
│  DOMAIN TEMPLATES:                   DISCOVERY PATTERNS:                    │
│  ├── Finance (ICAI, SEBI, RBI, GST)  ├── URL: /notification, /circular     │
│  ├── Law (India Code, Courts)        ├── Link: announcements, updates      │
│  ├── Education (IGNOU, UGC)          └── Section: #notifications, .news    │
│  └── Environment (CPCB, MoEFCC)                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### New Service Dependencies

```
intelligent-source-discovery.ts
├── depends on: db (official_sources, source_endpoints, discovered_items)
├── depends on: cheerio (HTML parsing)
├── depends on: rss-parser (RSS feed parsing)
├── depends on: logger (Winston)
├── exports: intelligentSourceDiscovery (singleton)
├── used by: source-monitor.ts (scheduleAutoFix)
└── used by: sources.ts routes (discover, auto-fix endpoints)

source-monitor.ts (UPDATED)
├── depends on: intelligent-source-discovery.ts (NEW)
├── auto-fix: Triggered on 404 errors
└── debounced: 5 second delay to batch failures
```

### New API Endpoints

| Route | Method | Service | Purpose |
|-------|--------|---------|---------|
| `/api/sources/discover` | POST | intelligent-source-discovery | Deep scan URL |
| `/api/sources/:id/auto-fix` | POST | intelligent-source-discovery | Fix single source |
| `/api/sources/auto-fix-all` | POST | source-monitor | Fix all broken sources |
| `/api/sources/rss-feeds` | GET | intelligent-source-discovery | List known RSS feeds |
| `/api/sources/init-rss-feeds` | POST | intelligent-source-discovery | Initialize 13 RSS feeds |
| `/api/sources/rss/fetch` | POST | intelligent-source-discovery | Fetch RSS content |
| `/api/sources/domains` | GET | intelligent-source-discovery | All available domains |
| `/api/sources/domains/search` | GET | intelligent-source-discovery | Search domains by keyword |
| `/api/sources/domains/:id/initialize` | POST | intelligent-source-discovery | Initialize domain sources |

### Database Tables (New)

```sql
-- Discovered items from scanning
CREATE TABLE IF NOT EXISTS discovered_items (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  content_type TEXT,  -- 'page', 'rss', 'pdf'
  discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed INTEGER DEFAULT 0,
  fed_to_pipeline INTEGER DEFAULT 0
);

-- Custom domains for user-defined knowledge areas
CREATE TABLE IF NOT EXISTS custom_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT,
  official_sources TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 11. Robust Fetch System (Anti-Blocking)

### Purpose
Enables reliable web scraping for knowledge collection while respecting website policies.

### File: server/src/utils/robust-fetch.ts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROBUST FETCH ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────┐                                                    │
│  │   robustFetch()    │ ◄──── Main entry point                             │
│  └────────────────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌────────────────────┐                                                    │
│  │  Rate Limiter      │ 2s min between same-domain requests                │
│  │  (per domain)      │                                                    │
│  └────────────────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌────────────────────┐     ┌──────────────────────────────────────┐       │
│  │  User-Agent Pool   │────►│ Chrome, Firefox, Safari, Edge        │       │
│  │  (6 variants)      │     │ Windows, Mac, Linux combinations     │       │
│  └────────────────────┘     └──────────────────────────────────────┘       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌────────────────────┐                                                    │
│  │  Fetch with        │ 30s timeout with AbortController                   │
│  │  Timeout           │                                                    │
│  └────────────────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌────────────────────┐                                                    │
│  │  Response Handler  │                                                    │
│  │  ├─ 200 OK        │ ──► Return content                                  │
│  │  ├─ 404 Not Found │ ──► No retry, mark as broken                        │
│  │  ├─ 403 Forbidden │ ──► Longer delay, retry                             │
│  │  ├─ 429 Rate Limit│ ──► Wait Retry-After, retry                         │
│  │  └─ 5xx Server    │ ──► Retry with backoff                              │
│  └────────────────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌────────────────────┐                                                    │
│  │  Retry Logic       │ Exponential backoff: 1s → 2s → 4s                  │
│  │  (max 3 attempts)  │                                                    │
│  └────────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Services Using Robust Fetch

| Service | Usage |
|---------|-------|
| source-monitor.ts | `checkEndpoint()` - monitor sources for changes |
| intelligent-source-discovery.ts | `fetchPage()` - deep scan websites |
| intelligent-source-discovery.ts | `fetchRssFeed()` - fallback for RSS parsing |

### Fair Use Headers
```typescript
{
  'User-Agent': '(rotating browser UA)',
  'Accept': 'text/html,application/xhtml+xml...',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.google.com/',
  'DNT': '1',  // Do Not Track - shows ethical intent
}
```

---

## 12. Verification Queries
FROM official_sources s LEFT JOIN source_endpoints e ON s.id = e.source_id 
GROUP BY s.id;

-- Check discovered items by source
SELECT s.name, COUNT(d.id) as discovered_count
FROM official_sources s LEFT JOIN discovered_items d ON s.id = d.source_id
GROUP BY s.id;

-- Check for orphaned records
SELECT * FROM posts WHERE blog_id NOT IN (SELECT id FROM blogs);
SELECT * FROM source_endpoints WHERE source_id NOT IN (SELECT id FROM official_sources);
```

### Check API-Page Alignment
```bash
# List all routes registered
grep -r "router\.\(get\|post\|put\|patch\|delete\)" server/src/routes/

# List all API calls in dashboard
grep -r "apiClient\.\|fetch(" dashboard/src/
```

---

## 13. Debug & Kaizen Infrastructure

### Error Logs Folder (NEW - Session 18)

```
0.development-matrix/error-logs/
├── server-debug_YYYY-MM-DD_HH-MM-SS.log  -- Debug logs from server
├── KAIZEN-YYYY-MM-DD.md                   -- Root cause analysis documents
└── README.md                              -- Logging instructions
```

### Kaizen Analysis Process
1. **Enable Debug Logging:** Set `LOG_LEVEL=debug` in server/.env
2. **Capture Logs:** Redirect server output to timestamped file
3. **Analyze Patterns:** Look for repeated errors, failed operations
4. **Document Root Cause:** Create KAIZEN-YYYY-MM-DD.md with:
   - Summary of issues found
   - Root cause analysis
   - Fixes applied
   - Action items remaining
5. **Apply Fix & Verify:** Test with actual output verification

### Debug Command
```powershell
# Start server with debug logging
cd server; npm run dev 2>&1 | Tee-Object -FilePath "../0.development-matrix/error-logs/server-debug_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').log"
```

---

*This document must be updated when adding new tables, services, or significant dependencies.*
