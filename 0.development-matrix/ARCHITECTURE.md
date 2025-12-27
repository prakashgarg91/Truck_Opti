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
├── ENGINEERING-GUARDRAILS.md . Anti-patterns to avoid
├── CONFESSION.md ............. Known bugs & gaps
├── MENU-CHART.md ............. Menu system documentation
└── ARCHITECTURE.md ........... [YOU ARE HERE] Architecture
-->

# ARCHITECTURE - Autonomous Blogging System

**Version:** 1.0.0 | **Last Updated:** December 2, 2025

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  AUTONOMOUS BLOGGING ARCHITECTURE               │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React)  │  Backend (Express)  │  MCP Server         │
│  Port: 5173        │  Port: 3001         │  135+ Tools         │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Backend (server/)
- **Runtime:** Node.js 18+, TypeScript 5.6
- **Framework:** Express 4.21
- **Database:** SQLite3 (better-sqlite3)
- **Queue:** BullMQ + Redis
- **WebSocket:** Socket.io 4.8
- **Auth:** JWT + bcrypt
- **Logger:** Winston

### Frontend (dashboard/)
- **Framework:** React 18.3 + Vite 5.4
- **Routing:** React Router 6.28
- **State:** TanStack React Query 5.59
- **Styling:** TailwindCSS 3.4
- **HTTP:** Axios 1.7
- **Charts:** Recharts 2.13

### MCP Layer (blogger-mcp/)
- **Tools:** 135+ Google API integrations
- **Services:** Blogger, Search Console, Analytics, YouTube, AdSense
- **Features:** OAuth2, Content Generation, SEO, Schema, Compliance

## Folder Structure

```
Blogger-MCP/
├── server/                  # Express API Backend
│   ├── src/
│   │   ├── index.ts        # Main server entry
│   │   ├── db/
│   │   │   └── index.ts    # SQLite with 14 tables
│   │   ├── routes/         # 6 route modules
│   │   │   ├── health.ts
│   │   │   ├── blogs.ts
│   │   │   ├── posts.ts
│   │   │   ├── sources.ts
│   │   │   ├── knowledge.ts
│   │   │   └── mcp.ts      # 732 lines - MCP integration
│   │   ├── services/       # Business logic
│   │   │   ├── blogger-service.ts
│   │   │   └── source-monitor.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   └── utils/
│   │       └── logger.ts
│   ├── package.json
│   └── tsconfig.json
│
├── dashboard/              # React Frontend
│   ├── src/
│   │   ├── App.tsx         # Main app + routing
│   │   ├── pages/          # 6 pages
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Blogs.tsx
│   │   │   ├── Posts.tsx
│   │   │   ├── Sources.tsx
│   │   │   ├── Analytics.tsx
│   │   │   └── Automation.tsx
│   │   ├── components/     # UI components
│   │   │   ├── ui/         # 7 components
│   │   │   ├── layout/     # Sidebar, Header
│   │   │   └── stats/      # StatsCard
│   │   └── services/       # API clients
│   │       ├── api.ts
│   │       ├── blogService.ts
│   │       ├── postService.ts
│   │       ├── sourceService.ts
│   │       └── mcpService.ts
│   ├── package.json
│   └── vite.config.ts
│
└── blogger-mcp/            # MCP Tool Server
    ├── index.js            # 6500 lines, 135+ tools
    ├── [30 core modules]
    └── [13 utility modules]
```

## Database Schema (14 Tables)

### Core Tables
1. **blogs** - Blog configurations
2. **posts** - Blog post content
3. **sources** - Content sources (RSS, competitors)
4. **knowledge_base** - RAG knowledge storage

### Automation Tables
5. **content_queue** - Pending content generation
6. **publish_queue** - Scheduled posts
7. **workflows** - Automation workflows

### Analytics Tables
8. **analytics** - Performance metrics
9. **seo_scores** - SEO analysis results

### System Tables
10. **users** - User accounts
11. **api_keys** - API key management
12. **activity_log** - System activity tracking
13. **mcp_status** - MCP tool status
14. **settings** - System configuration

## API Endpoints (46 total)

### Health & Status
- `GET /api/health` - Health check
- `GET /api/mcp/status` - MCP tool status

### Blog Management (7 endpoints)
- `GET /api/blogs` - List blogs
- `POST /api/blogs` - Create blog
- `GET /api/blogs/:id` - Get blog
- `PUT /api/blogs/:id` - Update blog
- `DELETE /api/blogs/:id` - Delete blog
- `GET /api/blogs/:id/stats` - Blog stats
- `POST /api/blogs/:id/sync` - Sync with Blogger

### Post Management (8 endpoints)
- `GET /api/posts` - List posts
- `POST /api/posts` - Create post
- `GET /api/posts/:id` - Get post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/publish` - Publish post
- `POST /api/posts/:id/generate` - AI generate content
- `GET /api/posts/:id/seo` - SEO analysis

### Source Monitoring (5 endpoints)
- `GET /api/sources` - List sources
- `POST /api/sources` - Add source
- `PUT /api/sources/:id` - Update source
- `DELETE /api/sources/:id` - Remove source
- `POST /api/sources/:id/check` - Check for updates

### Knowledge Base (5 endpoints)
- `GET /api/knowledge` - List entries
- `POST /api/knowledge` - Add entry
- `DELETE /api/knowledge/:id` - Remove entry
- `POST /api/knowledge/search` - Semantic search
- `POST /api/knowledge/enhance` - RAG enhancement

### MCP Integration (13 endpoints)
- `POST /api/mcp/execute` - Execute MCP tool
- `GET /api/mcp/tools` - List available tools
- `POST /api/mcp/generate-content` - Generate blog post
- `POST /api/mcp/generate-image` - Generate featured image
- `POST /api/mcp/seo-analyze` - SEO analysis
- `POST /api/mcp/trends` - Get trending topics
- `POST /api/mcp/publish` - Publish to Blogger
- Additional 6 endpoints for batch operations

## Autonomous Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS BLOGGING FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│  1. SOURCE MONITORING                                           │
│     sources.ts → source-monitor.ts → RSS/Scraping              │
│                                                                  │
│  2. TREND DETECTION                                             │
│     MCP /api/mcp/trends → Google Trends API                    │
│                                                                  │
│  3. CONTENT GENERATION                                          │
│     /api/mcp/generate-content → Gemini/Claude → post.content   │
│                                                                  │
│  4. SEO OPTIMIZATION                                            │
│     /api/mcp/seo-analyze → Meta tags, Keywords, Score          │
│                                                                  │
│  5. IMAGE GENERATION                                            │
│     /api/mcp/generate-image → HuggingFace → Featured image     │
│                                                                  │
│  6. SCHEDULING                                                  │
│     publish_queue → BullMQ → Delayed job                       │
│                                                                  │
│  7. PUBLISHING                                                  │
│     /api/mcp/publish → Blogger API → Live post                 │
│                                                                  │
│  8. ANALYTICS                                                   │
│     Analytics API → performance metrics → DB                   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Three-Tier Architecture
- **Why:** Separation of concerns (UI, API, MCP tools)
- **Benefit:** Independent scaling, easier maintenance

### 2. SQLite for Database
- **Why:** Zero configuration, file-based, fast for single-instance
- **Limitation:** Not suitable for distributed systems
- **Future:** Consider PostgreSQL for multi-instance

### 3. MCP Tool Integration
- **Why:** 135+ pre-built Google integrations
- **Benefit:** No need to build OAuth/API wrappers
- **Challenge:** External dependency on MCP server

### 4. React Query for State Management
- **Why:** Built-in caching, automatic refetching
- **Benefit:** Less boilerplate than Redux
- **Use Case:** Perfect for API-driven apps

### 5. TypeScript Throughout
- **Why:** Type safety, better IDE support
- **Benefit:** Catch errors at compile time
- **Challenge:** Initial learning curve

## Security Model

### Authentication Flow
```
User → Login → JWT Token → LocalStorage
  ↓
API Request + Bearer Token → Middleware auth.ts → Verify JWT
  ↓
Allowed → Route Handler | Denied → 401 Unauthorized
```

### API Key Management
- Per-blog API keys stored in `api_keys` table
- Rate limiting: 1000 requests/hour per key
- Keys hashed with bcrypt before storage

### MCP Security
- MCP server runs on localhost only
- No external network access
- OAuth tokens encrypted in database

## Performance Considerations

### Backend Optimizations
- Connection pooling for SQLite
- Response caching with Redis
- Compression middleware
- Winston logger with log rotation

### Frontend Optimizations
- Code splitting with React.lazy()
- Image lazy loading
- Debounced search inputs
- Optimistic UI updates

### Database Indexing
```sql
CREATE INDEX idx_posts_blog_id ON posts(blog_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_sources_active ON sources(active);
CREATE INDEX idx_queue_status ON publish_queue(status);
```

## Deployment Architecture

### Development
```
localhost:5173 (Vite) → localhost:3001 (Express) → MCP Server
```

### Production (Planned)
```
Vercel (Frontend) → Railway (Backend) → Heroku (MCP Server)
                                    ↓
                              PostgreSQL (Database)
```

## Dependencies Map

### Critical Dependencies
- **express:** HTTP server
- **better-sqlite3:** Database
- **socket.io:** Real-time updates
- **bullmq:** Job queue
- **react-query:** Data fetching

### Optional Dependencies
- **helmet:** Security headers
- **morgan:** Request logging
- **compression:** Response compression
- **recharts:** Analytics charts

## Error Handling Strategy

### Backend
```typescript
try {
  // Business logic
} catch (error) {
  logger.error('Error message', { error, context });
  res.status(500).json({ error: 'User-friendly message' });
}
```

### Frontend
```typescript
const { data, error, isLoading } = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  retry: 3,
  onError: (err) => showToast('Error loading posts')
});
```

## Future Architecture Considerations

### Phase 6-9 Additions
1. **Redis for caching** - Response cache, session storage
2. **WebSocket for real-time** - Live post generation progress
3. **Worker threads** - Heavy AI processing off main thread
4. **CDN integration** - Image optimization and delivery
5. **Monitoring** - Sentry for error tracking, Datadog for metrics

---

**Maintained by:** Project Manager Agent
**References:** EVOLUTION-PLAN.md, AGENT-MATRIX.md
