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
├── MENU-CHART.md ............. [YOU ARE HERE] Menu system
└── ARCHITECTURE.md ........... System architecture
-->

# 📊 MENU-CHART.md - Interactive Menu System

> **Visual representation of init.ps1/init.sh/init.bat menu options**
> **Last Updated:** 2025-12-16 (Session 7)

---

## ✅ Session 7 Fixes Applied (December 16, 2025)
| Issue | Status | Resolution |
|-------|--------|------------|
| Content pipeline no visible processing | ✅ FIXED | WebSocket real-time events + ActivityFeed component |
| Dark mode fonts invisible | ✅ FIXED | Added dark: variants to Sources, Settings, Automation pages |
| Knowledge base empty | ✅ FIXED | Auto-ingestion service (CA RSS feeds every 6 hours) |
| Sources showing fake data | ✅ FIXED | Real RSS parsing + web scraping with rss-parser/cheerio |
| Search Console not autonomous | ✅ FIXED | Auto-indexing, auto-sitemap, unindexed checker |
| No Google Trends integration | ⚠️ DEFERRED | Needs SerpAPI key - placeholder ready |
| No real-time processing status | ✅ FIXED | ActivityFeed shows pipeline status via WebSocket |

## ✅ What's Working (December 16, 2025)
- Google OAuth authenticated (5 blogs connected)
- OpenRouter API configured and working
- Server builds and runs (TypeScript clean)
- Dashboard builds and runs (TypeScript clean)
- 40 API endpoints pass tests
- **NEW:** Real-time WebSocket updates for pipeline status
- **NEW:** ActivityFeed component shows live processing
- **NEW:** Knowledge ingestion from CA news sources
- **NEW:** Auto-indexing for Search Console

---

## 🎯 Main Menu Structure

```
╔══════════════════════════════════════════════════════════════════════╗
║                 🤖 BLOGGER-MCP CONTROL CENTER                        ║
║                    Autonomous Blogging System                         ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   ┌─────────────────────────────────────────────────────────────┐    ║
║   │  SERVICE STATUS                                              │    ║
║   │  ─────────────────────────────────────────────────────────   │    ║
║   │  🟢 Qdrant:     localhost:6333   [Running]                   │    ║
║   │  🔴 Backend:    localhost:3001   [DOWN - start with start-all.bat]│    ║
║   │  🟡 Dashboard:  localhost:5173   [Unknown - depends on backend]  │    ║
║   │  🟢 Database:   37 tables        [Connected]                 │    ║
║   └─────────────────────────────────────────────────────────────┘    ║
║                                                                       ║
║   ═══════════════════════════════════════════════════════════════    ║
║                         MENU OPTIONS                                  ║
║   ═══════════════════════════════════════════════════════════════    ║
║                                                                       ║
║   [1]  🚀 Start All Services  (run start-all.bat BEFORE testing)     ║
║   [2]  🛑 Stop All Services                                          ║
║   [3]  🔄 Restart All Services                                       ║
║   ───────────────────────────────────────────────────────────────    ║
║   [4]  📊 View Service Status (re-run after starting backend)        ║
║   [5]  🧪 Run Feature Tests                                          ║
║   [6]  📋 Show AGENT-MATRIX Summary                                  ║
║   ───────────────────────────────────────────────────────────────    ║
║   [7]  ⚡ Execute Phase (Claude Code)                                ║
║   [8]  📝 Generate Claude Prompt                                     ║
║   [9]  🔍 Check features.json                                        ║
║   ───────────────────────────────────────────────────────────────    ║
║   [10] 🌐 Open Dashboard in Browser                                  ║
║   [11] 📂 Open Project in VS Code                                    ║
║   [12] 🔧 View Logs                                                  ║
║   ───────────────────────────────────────────────────────────────    ║
║   [13] 💾 Git Status & Commit                                        ║
║   [14] 📤 Git Push to GitHub                                         ║
║   ───────────────────────────────────────────────────────────────    ║
║   [0]  ❌ Exit                                                       ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝

Enter choice [0-14]: █
```

---

## 📋 Menu Option Details

### 🟢 Service Management

| Option | Name | Command | Description |
|--------|------|---------|-------------|
| 1 | Start All | `start-all.bat` | Starts Qdrant, Backend, Dashboard |
| 2 | Stop All | `docker-compose down` | Stops all services |
| 3 | Restart | Stop + Start | Full restart cycle |

### 📊 Status & Testing

| Option | Name | Command | Description |
|--------|------|---------|-------------|
| 4 | View Status | HTTP checks | Tests all endpoints |
| 5 | Run Tests | `npm test` | Execute test suite |
| 6 | AGENT-MATRIX | `cat AGENT-MATRIX.md` | Show task matrix |

### ⚡ Claude Code Integration

| Option | Name | Prompt | Description |
|--------|------|--------|-------------|
| 7 | Execute Phase | Shows sub-menu | Select phase to execute |
| 8 | Generate Prompt | Clipboard copy | Copy Claude prompt |
| 9 | features.json | `cat features.json` | View feature status |

---

## 🔄 Phase Execution Sub-Menu

```
╔══════════════════════════════════════════════════════════════════════╗
║                     ⚡ PHASE EXECUTION MENU                          ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   SELECT PHASE TO EXECUTE:                                           ║
║   ─────────────────────────────────────────────────────────────────  ║
║                                                                       ║
║   [0]  Phase 0: Critical Fixes       ✅ COMPLETE                     ║
║   [1]  Phase 1: Verification         ✅ COMPLETE                     ║
║   [2]  Phase 2: Dashboard            🔄 IN PROGRESS (85%)            ║
║   [3]  Phase 3: Authentication       ✅ COMPLETE                     ║
║   [4]  Phase 4: AI Content           ✅ COMPLETE                     ║
║   [5]  Phase 5: Auto-Publishing      🔄 IN PROGRESS                  ║
║   [6]  Phase 6: SEO Engine           🔄 IN PROGRESS                  ║
║   [7]  Phase 7a: Analytics           🔄 IN PROGRESS                  ║
║   [7b] Phase 7b: Knowledge Base      ✅ COMPLETE (auto-ingest)       ║
║   [7c] Phase 7c: Monitoring          🔄 IN PROGRESS                  ║
║   [8]  Phase 8: Testing              ⏳ PARTIAL                      ║
║   [9]  Phase 9: Deployment           ⏳ PENDING                      ║
║   ─────────────────────────────────────────────────────────────────  ║
║   [B]  Back to Main Menu                                             ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝

Enter phase number: █
```

---

## 🧪 Feature Test Sub-Menu

```
╔══════════════════════════════════════════════════════════════════════╗
║                     🧪 FEATURE TEST MENU                             ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   SELECT TEST CATEGORY:                                              ║
║   ─────────────────────────────────────────────────────────────────  ║
║                                                                       ║
║   [1]  Infrastructure Tests    (Qdrant, Backend, DB)                 ║
║   [2]  Authentication Tests    (OAuth, Sessions)                     ║
║   [3]  Content Generation      (AI, Templates)                       ║
║   [4]  Publishing Tests        (Blogger API)                         ║
║   [5]  SEO Engine Tests        (Keywords, Meta)                      ║
║   [6]  Knowledge Base Tests    (Qdrant, Search)                      ║
║   [7]  Dashboard Tests         (UI, Navigation)                      ║
║   [8]  API Endpoint Tests      (All routes)                          ║
║   ─────────────────────────────────────────────────────────────────  ║
║   [A]  Run ALL Tests                                                 ║
║   [U]  Update features.json                                          ║
║   [B]  Back to Main Menu                                             ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 📊 Progress Dashboard View

```
╔══════════════════════════════════════════════════════════════════════╗
║                     📊 PROJECT PROGRESS                              ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Phase 0: Critical Fixes     ████████████████████  100%  ✅          ║
║  Phase 1: Verification       ████████████████████  100%  ✅          ║
║  Phase 2: Dashboard          █████████████████░░░   85%  🔄          ║
║  Phase 3: Authentication     ████████████████████  100%  ✅          ║
║  Phase 4: AI Content         ████████████████████  100%  ✅          ║
║  Phase 5: Auto-Publishing    ████████████░░░░░░░░   60%  🔄          ║
║  Phase 6: SEO Engine         ████████████░░░░░░░░   60%  🔄          ║
║  Phase 7a: Analytics         ████████░░░░░░░░░░░░   40%  🔄          ║
║  Phase 7b: Knowledge Base    ████████████████████  100%  ✅          ║
║  Phase 7c: Monitoring        ████████░░░░░░░░░░░░   40%  🔄          ║
║  ─────────────────────────────────────────────────────────────────   ║
║  OVERALL PROGRESS            █████████████████░░░   85%              ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 🔧 Service Status Icons

| Icon | Status | Meaning |
|------|--------|---------|
| 🟢 | Running | Service is healthy |
| 🟡 | Warning | Service has issues |
| 🔴 | Stopped | Service not running |
| ⚪ | Unknown | Cannot determine |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-14` | Select menu option |
| `0` | Exit program |
| `B` | Back to previous menu |
| `Q` | Quick exit |
| `R` | Refresh status |
| `H` | Show help |

---

## 🔄 Workflow Examples

### Start Development Session
```
Menu → [1] Start All → [4] View Status → [10] Open Dashboard
```

### Run Claude Code Phase
```
Menu → [7] Execute Phase → [4] Phase 4 → Copy Prompt → Paste in Claude
```

### Test After Changes
```
Menu → [5] Run Tests → [U] Update features.json → [13] Git Commit
```

### Deploy Updates
```
Menu → [5] Run Tests → [13] Git Commit → [14] Git Push
```

---

## 📁 Files Used by Menu

| File | Purpose |
|------|---------|
| `init.ps1` | Windows PowerShell menu script (recommended) |
| `init.bat` | Windows CMD menu script (fallback) |
| `init.sh` | Linux/Mac menu script |
| `features.json` | Test status tracking |
| `AGENT-MATRIX.md` | Phase definitions |
| `start-all.bat` | Service startup |
| `docker-compose.yml` | Container config |
| `tools/feature-tests.mjs` | Feature test runner used by menu |
| `tools/update-features.mjs` | Updates features.json based on live checks |

---

*Generated: 2025-12-16 | Menu Version: 1.2.0 (Session 7)*
