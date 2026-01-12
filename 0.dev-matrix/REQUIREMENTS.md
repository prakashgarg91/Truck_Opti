# 📖 USER REQUIREMENTS

> **What the User Wants**
> This is the source of truth. Everything else serves this.

---

## 🎯 The Product

**Telegram Bot + WebApp** for content management:
- Manage channels, groups, RSS feeds
- Auto-post content on schedule
- Generate 4K quote images
- Analytics dashboard
- Multi-platform ready (future: Twitter, Facebook, etc.)

---

## ✅ Completed Features

### 1. Menu System
- Full admin menu (M0-M10)
- Multi-step wizards
- Professional formatting (no emojis in posts)

### 2. Content Posting
- RSS feeds auto-posting
- AI-generated quotes
- 4K image generation
- Custom signatures per content type

### 3. Scheduling
- Frequency presets: 15min, 30min, 1hr, 2hr, 4hr, 6hr, 12hr, daily
- Specific time scheduling (e.g., 11:11 AM)
- Cron-based reliable execution

### 4. Database
- SQLite (local) + PostgreSQL (Heroku) + Supabase (cloud)
- Data persists across deploys

### 5. Quality
- 338/338 tests passing
- Clean codebase, no duplicates

---

## ⏳ Pending (Needs User Action)

| Feature | What's Needed |
|---------|---------------|
| Twitter/X | API credentials |
| Facebook | API credentials |
| Instagram | API credentials |
| LinkedIn | API credentials |

---

## 🧪 Test Resources

| Type | Value |
|------|-------|
| Admin | @Mizu_9 (ID: 1443609804) |
| Test Bot | @QuiteQuote_Bot |
| Test Channel | @OnlineLibraryZone |
| Test RSS | `https://incometaxindia.gov.in/_layouts/15/Dit/Pages/Rss.aspx` |

### Channels to Manage
- https://t.me/QuiteQuote (text quotes)
- https://t.me/Eleven_Quotes (4K images)
- https://t.me/IGNOUc (IGNOU updates)

---

## 🔮 Future Vision

### WebApp
- Mirror all bot menus in web interface
- Login via Supabase auth
- Visual pipeline builder
- Real-time analytics

### Multi-Platform
- Cross-post to Twitter/X, Facebook, Instagram, LinkedIn
- Unified content calendar
- Platform-specific formatting

### AI Integration
- User brings own Gemini API key
- Model selection (OpenRouter integration)
- Smart content suggestions

### Monetization
- Monthly subscription via PhonePe UPI
- Pricing: Cost + 60% margin

---

## 📋 Key Implementation Files

| Feature | File |
|---------|------|
| Admin Menu | `lib/comprehensive-admin-menu.js` |
| RSS Automation | `lib/enhanced-rss-automation.js` |
| Image Generation | `lib/premium-image-generator.js` |
| Scheduling | `lib/advanced-scheduler.js` |
| Content Pipeline | `lib/content-pipeline-manager.js` |

---

## 🚀 Deployment

```yaml
Platform: Heroku (eco dyno)
Entry: autonomous-bot-standalone.js
Database: Supabase Cloud
Timezone: Asia/Kolkata
Tests: 338/338 passing
```

---

**Version:** 2.14.3 | **Status:** Core Complete, Expansion Phase
