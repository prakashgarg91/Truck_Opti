# 🧪 HAIKU END-USER TESTING GUIDE

> **"Kona Kona Check Karo" - Test Every Corner of the App**
> For Claude Haiku 4.5 to test as a real end-user.
> Follow step by step. Report ACTUAL results only.

---

## 🚨 HAIKU - READ THIS FIRST

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   तुम एक REAL USER हो। App का हर button, हर feature test करो।    ║
║   You are a REAL USER. Test every button, every feature.         ║
║                                                                  ║
║   RULES:                                                         ║
║   1. Sign in to DISCUSSION.md first                              ║
║   2. Execute REAL commands - no imagination                      ║
║   3. Report ACTUAL output - copy paste exactly                   ║
║   4. If error → paste full error message                         ║
║   5. Mark each test: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL              ║
║   6. Don't fix bugs - just report them                           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 📋 TESTING CHECKLIST

### Quick Overview - What to Test

| Area | Tests | Time Est. |
|------|-------|-----------|
| 🔧 Environment | 5 tests | 5 min |
| 🌐 WebApp/API | 15 tests | 15 min |
| 📱 Bot Menus | 40 tests | 30 min |
| 🗄️ Database | 10 tests | 10 min |
| 📡 RSS System | 12 tests | 15 min |
| 📺 Channels | 8 tests | 10 min |
| 👥 Groups | 8 tests | 10 min |
| ⏰ Scheduling | 10 tests | 10 min |
| 🤖 Automation | 8 tests | 10 min |
| 📊 Analytics | 6 tests | 5 min |
| ⚙️ Settings | 8 tests | 10 min |
| **TOTAL** | **130 tests** | **~2 hours** |

---

## 🔧 PHASE 1: ENVIRONMENT SETUP

### Test 1.1: Project Directory
```powershell
cd D:\Github\Telegram-MCP
Get-Location
```
**Expected:** Shows `D:\Github\Telegram-MCP`
**Status:** [ ]

### Test 1.2: Node Version
```powershell
node --version
```
**Expected:** v18+ or v22+
**Status:** [ ]

### Test 1.3: Dependencies Installed
```powershell
npm list --depth=0 2>&1 | Select-Object -First 20
```
**Expected:** Shows installed packages, no errors
**Status:** [ ]

### Test 1.4: Unit Tests Pass
```powershell
npm test 2>&1 | Select-Object -Last 10
```
**Expected:** `Tests: 338 passed (338)`
**Status:** [ ]

### Test 1.5: Environment Variables
```powershell
if ($env:BOT_TOKEN) { "BOT_TOKEN: Set" } else { "BOT_TOKEN: Missing" }
if ($env:SUPABASE_URL) { "SUPABASE_URL: Set" } else { "SUPABASE_URL: Missing" }
```
**Expected:** Both should say "Set" for production testing
**Status:** [ ]

---

## 🌐 PHASE 2: WEBAPP & API TESTING

### Start the Test Server First
```powershell
# In a separate terminal:
node test-webapp-server.js
```

### Test 2.1: Health Endpoint
```powershell
curl http://localhost:3000/health
```
**Expected:** `{"status":"ok","uptime":...}`
**Status:** [ ]

### Test 2.2: Status Endpoint
```powershell
curl http://localhost:3000/status
```
**Expected:** JSON with modules and database status
**Status:** [ ]

### Test 2.3: Dashboard Page
```powershell
curl -s http://localhost:3000/ | Select-String -Pattern "title|Dashboard" | Select-Object -First 3
```
**Expected:** Contains "Dashboard" or HTML content
**Status:** [ ]

### Test 2.4: API - List Channels
```powershell
curl http://localhost:3000/api/channels
```
**Expected:** JSON array (may be empty `[]`)
**Status:** [ ]

### Test 2.5: API - List Groups
```powershell
curl http://localhost:3000/api/groups
```
**Expected:** JSON array
**Status:** [ ]

### Test 2.6: API - List RSS Feeds
```powershell
curl http://localhost:3000/api/rss/feeds
```
**Expected:** JSON array of feeds
**Status:** [ ]

### Test 2.7: API - List Schedules
```powershell
curl http://localhost:3000/api/schedules
```
**Expected:** JSON array
**Status:** [ ]

### Test 2.8: API - Analytics Summary
```powershell
curl http://localhost:3000/api/analytics/summary
```
**Expected:** JSON with analytics data
**Status:** [ ]

### Test 2.9: API - Settings
```powershell
curl http://localhost:3000/api/settings
```
**Expected:** JSON with settings
**Status:** [ ]

### Test 2.10: Static Files (CSS/JS)
```powershell
curl -s http://localhost:3000/css/style.css | Select-Object -First 5
```
**Expected:** CSS content
**Status:** [ ]

### Test 2.11: WebSocket Connection
```powershell
# Check if socket.io is available
curl -s http://localhost:3000/socket.io/ | Select-Object -First 1
```
**Expected:** Some response (may be error - that's ok)
**Status:** [ ]

### Test 2.12: 404 Handling
```powershell
curl http://localhost:3000/nonexistent-page-12345
```
**Expected:** 404 response or error page
**Status:** [ ]

### Test 2.13: API Error Handling
```powershell
curl http://localhost:3000/api/invalid-endpoint
```
**Expected:** Error response (not crash)
**Status:** [ ]

### Test 2.14: POST to Settings
```powershell
curl -X POST http://localhost:3000/api/settings -H "Content-Type: application/json" -d "{\"timezone\":\"Asia/Kolkata\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 2.15: CORS Headers
```powershell
curl -I http://localhost:3000/api/channels 2>&1 | Select-String "Access-Control"
```
**Expected:** CORS headers present
**Status:** [ ]

---

## 🗄️ PHASE 3: DATABASE TESTING

### Test 3.1: SQLite Database Exists
```powershell
Test-Path "D:\Github\Telegram-MCP\data\telegram-bot.db"
```
**Expected:** `True`
**Status:** [ ]

### Test 3.2: Database Tables
```powershell
# Run a quick Node script to check tables
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=''table''').all())"
```
**Expected:** List of tables (channels, groups, rss_feeds, etc.)
**Status:** [ ]

### Test 3.3: Channels Table
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); console.log(db.prepare('SELECT COUNT(*) as count FROM channels').get())"
```
**Expected:** Count of channels
**Status:** [ ]

### Test 3.4: RSS Feeds Table
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); console.log(db.prepare('SELECT COUNT(*) as count FROM rss_feeds').get())"
```
**Expected:** Count of RSS feeds
**Status:** [ ]

### Test 3.5: Groups Table
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); console.log(db.prepare('SELECT COUNT(*) as count FROM groups').get())"
```
**Expected:** Count or table structure
**Status:** [ ]

### Test 3.6: Schedules Table
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); console.log(db.prepare('SELECT COUNT(*) as count FROM schedules').get())"
```
**Expected:** Count of schedules
**Status:** [ ]

### Test 3.7: Settings Table
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); console.log(db.prepare('SELECT * FROM settings LIMIT 5').all())"
```
**Expected:** Settings data
**Status:** [ ]

### Test 3.8: Analytics Data
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); try { console.log(db.prepare('SELECT COUNT(*) as count FROM analytics').get()) } catch(e) { console.log('Table may not exist:', e.message) }"
```
**Expected:** Count or table info
**Status:** [ ]

### Test 3.9: Database Write Test
```powershell
node -e "const db = require('better-sqlite3')('./data/telegram-bot.db'); const r = db.prepare('SELECT 1+1 as result').get(); console.log('DB working:', r)"
```
**Expected:** `{ result: 2 }`
**Status:** [ ]

### Test 3.10: Database File Size
```powershell
(Get-Item "D:\Github\Telegram-MCP\data\telegram-bot.db").Length / 1KB
```
**Expected:** Size in KB (should be > 0)
**Status:** [ ]

---

## 📡 PHASE 4: RSS SYSTEM TESTING

### Test 4.1: RSS Module Loads
```powershell
node -e "const RSS = require('./lib/enhanced-rss-automation.js').default; const r = new RSS(); console.log('RSS Module:', typeof r.initialize)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 4.2: Fetch RSS Feed (BBC)
```powershell
node -e "const Parser = require('rss-parser'); const p = new Parser(); p.parseURL('https://feeds.bbci.co.uk/news/rss.xml').then(f => console.log('Feed Title:', f.title, 'Items:', f.items.length)).catch(e => console.log('Error:', e.message))"
```
**Expected:** Feed title and item count
**Status:** [ ]

### Test 4.3: Fetch RSS Feed (TechCrunch)
```powershell
node -e "const Parser = require('rss-parser'); const p = new Parser(); p.parseURL('https://techcrunch.com/feed/').then(f => console.log('Feed:', f.title, 'Items:', f.items.length)).catch(e => console.log('Error:', e.message))"
```
**Expected:** Feed title and item count
**Status:** [ ]

### Test 4.4: Google News RSS Generator
```powershell
node -e "const url = 'https://news.google.com/rss/search?q=technology&hl=en-IN&gl=IN&ceid=IN:en'; console.log('Google RSS URL:', url)"
```
**Expected:** Shows valid Google RSS URL format
**Status:** [ ]

### Test 4.5: List Saved Feeds (API)
```powershell
curl http://localhost:3000/api/rss/feeds
```
**Expected:** JSON array of saved feeds
**Status:** [ ]

### Test 4.6: Add Feed (API)
```powershell
curl -X POST http://localhost:3000/api/rss/feeds -H "Content-Type: application/json" -d "{\"url\":\"https://feeds.bbci.co.uk/news/rss.xml\",\"name\":\"BBC News Test\"}"
```
**Expected:** Success response with feed ID
**Status:** [ ]

### Test 4.7: Feed Validation
```powershell
node -e "const Parser = require('rss-parser'); const p = new Parser(); p.parseURL('https://invalid-url-12345.com/rss').catch(e => console.log('Correctly caught error:', e.code || e.message))"
```
**Expected:** Error caught (not crash)
**Status:** [ ]

### Test 4.8: RSS Items Processing
```powershell
node -e "const Parser = require('rss-parser'); const p = new Parser(); p.parseURL('https://feeds.bbci.co.uk/news/rss.xml').then(f => { const item = f.items[0]; console.log('Title:', item.title?.substring(0,50)); console.log('Link:', item.link?.substring(0,50)); console.log('Date:', item.pubDate); })"
```
**Expected:** Shows first item's title, link, date
**Status:** [ ]

### Test 4.9: RSS Schedule Check
```powershell
curl http://localhost:3000/api/rss/schedules
```
**Expected:** JSON array of RSS schedules
**Status:** [ ]

### Test 4.10: RSS Feed Delete (API)
```powershell
# First get a feed ID, then delete (modify ID as needed)
curl -X DELETE http://localhost:3000/api/rss/feeds/test-feed-id
```
**Expected:** Success or "not found" response
**Status:** [ ]

### Test 4.11: RSS Feed Stats
```powershell
curl http://localhost:3000/api/rss/stats
```
**Expected:** JSON with RSS statistics
**Status:** [ ]

### Test 4.12: RSS Auto-Post Status
```powershell
curl http://localhost:3000/api/rss/autopost/status
```
**Expected:** JSON with auto-post status
**Status:** [ ]

---

## 📺 PHASE 5: CHANNEL MANAGEMENT

### Test 5.1: Channel Manager Module
```powershell
node -e "const CM = require('./lib/channel-manager.js').default; const c = new CM(); console.log('Channel Manager:', typeof c.addChannel)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 5.2: List Channels (API)
```powershell
curl http://localhost:3000/api/channels
```
**Expected:** JSON array
**Status:** [ ]

### Test 5.3: Add Channel (API)
```powershell
curl -X POST http://localhost:3000/api/channels -H "Content-Type: application/json" -d "{\"channelId\":\"@testchannel123\",\"name\":\"Test Channel\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 5.4: Get Channel Details
```powershell
curl http://localhost:3000/api/channels/@testchannel123
```
**Expected:** Channel details or not found
**Status:** [ ]

### Test 5.5: Update Channel
```powershell
curl -X PUT http://localhost:3000/api/channels/@testchannel123 -H "Content-Type: application/json" -d "{\"name\":\"Updated Name\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 5.6: Channel Signature Settings
```powershell
curl http://localhost:3000/api/channels/@testchannel123/signature
```
**Expected:** Signature settings
**Status:** [ ]

### Test 5.7: Channel Stats
```powershell
curl http://localhost:3000/api/channels/stats
```
**Expected:** Channel statistics
**Status:** [ ]

### Test 5.8: Delete Channel
```powershell
curl -X DELETE http://localhost:3000/api/channels/@testchannel123
```
**Expected:** Success response
**Status:** [ ]

---

## 👥 PHASE 6: GROUP MANAGEMENT

### Test 6.1: Group Manager Module
```powershell
node -e "const GM = require('./lib/group-manager.js').default; const g = new GM(); console.log('Group Manager:', typeof g.addGroup)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 6.2: List Groups (API)
```powershell
curl http://localhost:3000/api/groups
```
**Expected:** JSON array
**Status:** [ ]

### Test 6.3: Add Group (API)
```powershell
curl -X POST http://localhost:3000/api/groups -H "Content-Type: application/json" -d "{\"groupId\":\"-1001234567890\",\"name\":\"Test Group\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 6.4: Get Group Details
```powershell
curl http://localhost:3000/api/groups/-1001234567890
```
**Expected:** Group details or not found
**Status:** [ ]

### Test 6.5: Update Group Welcome Message
```powershell
curl -X PUT http://localhost:3000/api/groups/-1001234567890/welcome -H "Content-Type: application/json" -d "{\"message\":\"Welcome to our group!\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 6.6: Group Rules
```powershell
curl http://localhost:3000/api/groups/-1001234567890/rules
```
**Expected:** Group rules
**Status:** [ ]

### Test 6.7: Group Stats
```powershell
curl http://localhost:3000/api/groups/stats
```
**Expected:** Group statistics
**Status:** [ ]

### Test 6.8: Delete Group
```powershell
curl -X DELETE http://localhost:3000/api/groups/-1001234567890
```
**Expected:** Success response
**Status:** [ ]

---

## ⏰ PHASE 7: SCHEDULING SYSTEM

### Test 7.1: Scheduler Module
```powershell
node -e "const S = require('./lib/advanced-scheduler.js').default; const s = new S(); console.log('Scheduler:', typeof s.schedulePost)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 7.2: List Schedules (API)
```powershell
curl http://localhost:3000/api/schedules
```
**Expected:** JSON array
**Status:** [ ]

### Test 7.3: Create Schedule (API)
```powershell
curl -X POST http://localhost:3000/api/schedules -H "Content-Type: application/json" -d "{\"content\":\"Test post\",\"targetId\":\"@testchannel\",\"scheduledTime\":\"2026-01-12T10:00:00Z\"}"
```
**Expected:** Success with schedule ID
**Status:** [ ]

### Test 7.4: Get Schedule Details
```powershell
curl http://localhost:3000/api/schedules/1
```
**Expected:** Schedule details
**Status:** [ ]

### Test 7.5: Update Schedule
```powershell
curl -X PUT http://localhost:3000/api/schedules/1 -H "Content-Type: application/json" -d "{\"content\":\"Updated content\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 7.6: Delete Schedule
```powershell
curl -X DELETE http://localhost:3000/api/schedules/1
```
**Expected:** Success response
**Status:** [ ]

### Test 7.7: Recurring Schedule
```powershell
curl -X POST http://localhost:3000/api/schedules/recurring -H "Content-Type: application/json" -d "{\"content\":\"Daily post\",\"targetId\":\"@testchannel\",\"frequency\":\"daily\",\"time\":\"09:00\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 7.8: Schedule Queue
```powershell
curl http://localhost:3000/api/schedules/queue
```
**Expected:** Upcoming scheduled posts
**Status:** [ ]

### Test 7.9: Schedule Stats
```powershell
curl http://localhost:3000/api/schedules/stats
```
**Expected:** Schedule statistics
**Status:** [ ]

### Test 7.10: Timezone Handling
```powershell
node -e "const d = new Date(); console.log('UTC:', d.toISOString()); console.log('India:', d.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}))"
```
**Expected:** Both times displayed correctly
**Status:** [ ]

---

## 🤖 PHASE 8: AUTOMATION SYSTEM

### Test 8.1: Automation Engine Module
```powershell
node -e "const AE = require('./lib/automation-engine.js').default; const a = new AE(); console.log('Automation:', typeof a.initialize)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 8.2: AI Auto-Post Module
```powershell
node -e "const AI = require('./lib/ai-autopost-scheduler.js').default; const a = new AI(); console.log('AI AutoPost:', typeof a)"
```
**Expected:** Shows `function` or `object`
**Status:** [ ]

### Test 8.3: Pipeline Status (API)
```powershell
curl http://localhost:3000/api/automation/pipelines
```
**Expected:** JSON array of pipelines
**Status:** [ ]

### Test 8.4: Create Pipeline
```powershell
curl -X POST http://localhost:3000/api/automation/pipelines -H "Content-Type: application/json" -d "{\"name\":\"Test Pipeline\",\"type\":\"rss\",\"targetId\":\"@testchannel\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 8.5: Pipeline Stats
```powershell
curl http://localhost:3000/api/automation/stats
```
**Expected:** Automation statistics
**Status:** [ ]

### Test 8.6: Auto-Response Status
```powershell
curl http://localhost:3000/api/automation/autoresponse
```
**Expected:** Auto-response settings
**Status:** [ ]

### Test 8.7: Quote Poster Status
```powershell
node -e "const QP = require('./lib/quote-poster.js').default; const q = new QP(); console.log('Quote Poster:', typeof q.postQuote)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 8.8: Bot Interaction Manager
```powershell
node -e "const BIM = require('./lib/bot-interaction-manager.js').default; const b = new BIM(); console.log('Bot Interaction:', typeof b)"
```
**Expected:** Shows object/function type
**Status:** [ ]

---

## 📊 PHASE 9: ANALYTICS SYSTEM

### Test 9.1: Analytics Module
```powershell
node -e "const A = require('./lib/analytics-system.js').default; const a = new A(); console.log('Analytics:', typeof a.getStats)"
```
**Expected:** Shows `function`
**Status:** [ ]

### Test 9.2: Analytics Summary (API)
```powershell
curl http://localhost:3000/api/analytics/summary
```
**Expected:** JSON with summary stats
**Status:** [ ]

### Test 9.3: Channel Analytics
```powershell
curl http://localhost:3000/api/analytics/channels
```
**Expected:** Per-channel stats
**Status:** [ ]

### Test 9.4: Post Analytics
```powershell
curl http://localhost:3000/api/analytics/posts
```
**Expected:** Post statistics
**Status:** [ ]

### Test 9.5: Time-based Analytics
```powershell
curl "http://localhost:3000/api/analytics/timeline?days=7"
```
**Expected:** Timeline data
**Status:** [ ]

### Test 9.6: Export Analytics
```powershell
curl http://localhost:3000/api/analytics/export
```
**Expected:** Export data or file
**Status:** [ ]

---

## ⚙️ PHASE 10: SETTINGS & CONFIGURATION

### Test 10.1: Get All Settings
```powershell
curl http://localhost:3000/api/settings
```
**Expected:** JSON with all settings
**Status:** [ ]

### Test 10.2: Update Timezone
```powershell
curl -X POST http://localhost:3000/api/settings -H "Content-Type: application/json" -d "{\"timezone\":\"Asia/Kolkata\"}"
```
**Expected:** Success response
**Status:** [ ]

### Test 10.3: Get Timezone
```powershell
curl http://localhost:3000/api/settings/timezone
```
**Expected:** Current timezone
**Status:** [ ]

### Test 10.4: Notification Settings
```powershell
curl http://localhost:3000/api/settings/notifications
```
**Expected:** Notification settings
**Status:** [ ]

### Test 10.5: API Keys Status
```powershell
curl http://localhost:3000/api/settings/apikeys
```
**Expected:** API key status (not actual keys!)
**Status:** [ ]

### Test 10.6: Admin List
```powershell
curl http://localhost:3000/api/settings/admins
```
**Expected:** List of admin IDs
**Status:** [ ]

### Test 10.7: Security Settings
```powershell
curl http://localhost:3000/api/settings/security
```
**Expected:** Security configuration
**Status:** [ ]

### Test 10.8: Backup/Export Settings
```powershell
curl http://localhost:3000/api/settings/export
```
**Expected:** Exportable settings data
**Status:** [ ]

---

## 📝 PHASE 11: ERROR HANDLING & EDGE CASES

### Test 11.1: Invalid JSON Request
```powershell
curl -X POST http://localhost:3000/api/settings -H "Content-Type: application/json" -d "invalid json"
```
**Expected:** Error response (not crash)
**Status:** [ ]

### Test 11.2: Missing Required Fields
```powershell
curl -X POST http://localhost:3000/api/channels -H "Content-Type: application/json" -d "{}"
```
**Expected:** Validation error
**Status:** [ ]

### Test 11.3: Very Long Input
```powershell
$longText = "A" * 10000; curl -X POST http://localhost:3000/api/schedules -H "Content-Type: application/json" -d "{`"content`":`"$longText`"}"
```
**Expected:** Handled gracefully
**Status:** [ ]

### Test 11.4: Special Characters
```powershell
curl -X POST http://localhost:3000/api/schedules -H "Content-Type: application/json" -d "{\"content\":\"Test <script>alert('xss')</script> emoji 🎉\"}"
```
**Expected:** Sanitized or escaped
**Status:** [ ]

### Test 11.5: Concurrent Requests
```powershell
1..5 | ForEach-Object -Parallel { curl http://localhost:3000/api/channels } -ThrottleLimit 5
```
**Expected:** All return valid responses
**Status:** [ ]

---

## 📊 RESULTS SUMMARY TEMPLATE

After completing all tests, fill this summary:

```
╔══════════════════════════════════════════════════════════════════╗
║                    HAIKU TESTING REPORT                          ║
╠══════════════════════════════════════════════════════════════════╣
║ Tester: Claude Haiku 4.5                                         ║
║ Date: YYYY-MM-DD                                                 ║
║ Duration: X hours                                                ║
╠══════════════════════════════════════════════════════════════════╣
║ RESULTS:                                                         ║
║ ✅ Passed:    ___/130                                            ║
║ ❌ Failed:    ___/130                                            ║
║ ⚠️ Partial:   ___/130                                            ║
║ ⏭️ Skipped:   ___/130                                            ║
╠══════════════════════════════════════════════════════════════════╣
║ CRITICAL ISSUES:                                                 ║
║ 1. [Issue description]                                           ║
║ 2. [Issue description]                                           ║
╠══════════════════════════════════════════════════════════════════╣
║ RECOMMENDATION:                                                  ║
║ [ ] Ready for production                                         ║
║ [ ] Needs fixes before production                                ║
║ [ ] Major rework needed                                          ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 🐛 BUG REPORT TEMPLATE

For each bug found, create:

```markdown
## BUG: [Short Title]

**Test ID:** Phase X, Test X.X
**Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low

**Command Run:**
```powershell
[exact command]
```

**Expected:**
[what should happen]

**Actual:**
```
[paste exact output]
```

**Error (if any):**
```
[paste error message]
```

**Suggested Fix:**
[your analysis]
```

---

## 🔄 POST-TESTING STEPS

After completing all tests:

1. **Sign out of DISCUSSION.md**
2. **Post summary in DISCUSSION.md**
3. **Create bug report file** (if bugs found)
4. **Update STATE.md** with test results
5. **Do NOT push to GitHub** - just report findings

---

**Testing Guide Version:** 2.0
**Total Tests:** 130
**Estimated Time:** 2 hours
