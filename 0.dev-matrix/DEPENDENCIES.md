# 🔗 RELATIONSHIPS

> **Code Dependencies & Data Flows**
> Check here before modifying files.

---

## 🚀 Entry Points

### Production (Heroku)
```
npm start → autonomous-bot-standalone.js
```

### Development (MCP)
```
npm run mcp → index.js
```

**⚠️ Never run both simultaneously!**

---

## 📊 Architecture Layers

```
┌─────────────────────────────────────────────────┐
│ LAYER 1: Entry Points                           │
│ index.js (MCP) OR autonomous-bot-standalone.js  │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ LAYER 2: Bot & Menu System                      │
│ TelegramBot + comprehensive-admin-menu.js       │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ LAYER 3: Core Managers                          │
│ channel-manager, group-manager, rss-manager     │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ LAYER 4: Database                               │
│ universal-database.js → SQLite/Postgres/Supabase│
└─────────────────────────────────────────────────┘
```

---

## 📁 Module Dependencies

### comprehensive-admin-menu.js
```
Uses:
├── channel-manager.js
├── group-manager.js
├── enhanced-rss-automation.js
├── advanced-scheduler.js
├── analytics-system.js
├── security-manager.js
├── premium-image-generator.js
├── content-pipeline-manager.js
└── lib/menus/* (handlers, wizards)
```

### autonomous-bot-standalone.js
```
Uses:
├── comprehensive-admin-menu.js
├── health-monitor.js
├── auto-recovery.js
├── quote-poster.js
├── ai-autopost-scheduler.js
└── All managers (shared with admin menu)
```

### universal-database.js
```
Adapts to:
├── SQLite (local dev)
├── PostgreSQL (Heroku DATABASE_URL)
└── Supabase (SUPABASE_URL)
```

---

## 🔄 Data Flow: Button Press

```
User clicks button
       ↓
TelegramBot (callback_query event)
       ↓
comprehensive-admin-menu.js
  → handleCallbackQuery()
  → route to handler
       ↓
lib/menus/channels/channel-menu-handler.js
  → process action
       ↓
lib/channel-manager.js
  → business logic
       ↓
lib/channel-database.js
  → SQL operations
       ↓
lib/universal-database.js
  → execute query
       ↓
Database (SQLite/Postgres/Supabase)
```

---

## 🔄 Data Flow: Scheduled Post

```
Cron timer fires
       ↓
advanced-scheduler.js
  → checkScheduledPosts()
       ↓
Get posts due for execution
       ↓
For each post:
  → channel-manager.js.sendToChannel()
  → TelegramBot.sendMessage()
       ↓
Mark post as sent in DB
```

---

## 🔄 Data Flow: RSS Auto-Post

```
Cron: every 30 minutes
       ↓
enhanced-rss-automation.js
  → checkAllFeeds()
       ↓
For each active feed:
  → Fetch RSS XML
  → Parse items
  → Filter new items (not in processed_rss_items)
       ↓
For each new item:
  → Format message
  → Apply signature
  → Send to target channels
  → Mark as processed
```

---

## 💾 Database Tables

| Table | Purpose | Manager |
|-------|---------|---------|
| users | User data, admin status | user-manager.js |
| channels | Telegram channels | channel-manager.js |
| groups | Telegram groups | group-manager.js |
| rss_feeds | RSS subscriptions | rss-manager.js |
| rss_feeds_v2 | Enhanced RSS | enhanced-rss-automation.js |
| scheduled_posts | Post queue | advanced-scheduler.js |
| processed_rss_items | Dedup tracking | enhanced-rss-automation.js |
| kv_store | Settings/config | universal-database.js |
| content_pipelines | Auto-post pipes | content-pipeline-manager.js |
| ai_autopost_schedules | AI posting | ai-autopost-scheduler.js |
| analytics_data | Metrics | analytics-system.js |

---

## 🔧 Common Operations

### Add New Menu Button
1. `comprehensive-admin-menu.js` → add callback case
2. Create handler in `lib/menus/{module}/`
3. Test via Telegram

### Add New Database Table
1. Update `scripts/setup-supabase.sql`
2. Add to `universal-database.js` init
3. Create operations in relevant manager

### Add New Scheduled Job
1. `autonomous-bot-standalone.js` → add cron job
2. Create handler function
3. Log execution for debugging

---

## 🔍 Find Files By Feature

| Feature | Files |
|---------|-------|
| RSS Management | `enhanced-rss-automation.js`, `rss-manager.js`, `lib/menus/rss/` |
| Channel Posting | `channel-manager.js`, `lib/menus/channels/` |
| Quote Images | `premium-image-generator.js`, `quote-poster.js` |
| Scheduling | `advanced-scheduler.js`, `lib/menus/scheduling/` |
| AI Content | `content-generator.js`, `ai-autopost-scheduler.js` |
| Analytics | `analytics-system.js`, `lib/menus/analytics/` |

---

**Version:** 2.14.3 | **Modules:** 47+
