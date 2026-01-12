# 📱 MENU-CHART

> **Bot Menu Structure**
> Report issues by ID: "M1.2 not working"

---

## 🏠 Main Menu

```
/start or /admin → Main Menu
├── 📝 Content (M1)
├── 📺 Channels (M2)
├── 👥 Groups (M3)
├── ⏰ Scheduling (M4)
├── 🤖 Automation (M5)
├── 📊 Analytics (M6)
├── 🌐 Social Media (M7)
├── 💰 Monetization (M8)
├── 🔒 Security (M9)
└── ⚙️ Settings (M10)
```

---

## 📦 Module Details

### M1: Content/RSS
```
admin_rss
├── M1.1 ➕ Add Feed      (rss_add)        ✅
├── M1.2 🔗 Google RSS    (rss_google)     ✅
├── M1.3 📋 Manage Feeds  (rss_manage)     ✅
├── M1.4 📤 Post Now      (rss_post)       ✅
├── M1.5 ⏰ Schedule      (rss_schedule)   ✅
├── M1.6 🔄 Auto-Post     (rss_autopost)   ✅
└── M1.7 📊 Feed Stats    (rss_stats)      ✅
```

### M2: Channels
```
admin_channels
├── M2.1 ➕ Add Channel   (channel_add)     ✅
├── M2.2 📋 List Channels (channel_list)    ✅
├── M2.3 ✍️ Signatures    (channel_sigs)    ✅
├── M2.4 🎨 Branding      (channel_brand)   ✅
└── M2.5 📊 Analytics     (channel_stats)   ✅
```

### M3: Groups
```
admin_groups
├── M3.1 ➕ Add Group     (group_add)       ✅
├── M3.2 📋 List Groups   (group_list)      ✅
├── M3.3 ✍️ Signatures    (group_sigs)      ✅
├── M3.4 👋 Welcome Msg   (group_welcome)   ✅
└── M3.5 📜 Auto-Rules    (group_rules)     ✅
```

### M4: Scheduling
```
admin_schedule
├── M4.1 📅 Schedule Post (schedule_post)   ✅
├── M4.2 📋 View Queue    (schedule_queue)  ✅
├── M4.3 🔁 Recurring     (schedule_recur)  ✅
└── M4.4 📥 Bulk Import   (schedule_bulk)   ✅
```

### M5: Automation
```
admin_automation
├── M5.1 🔄 Auto-Post Pipeline  ✅
├── M5.2 🤖 AI Auto-Posting     ✅
└── M5.3 📊 Pipeline Stats      ✅
```

### M6: Analytics
```
admin_analytics
├── M6.1 📊 Overview     ✅
├── M6.2 📺 Channel Stats ✅
└── M6.3 📤 Export Data   ✅
```

### M7: Social Media
```
admin_social
├── M7.1 🐦 Twitter/X    ⏳ (needs API)
├── M7.2 📘 Facebook     ⏳ (needs API)
├── M7.3 📸 Instagram    ⏳ (needs API)
└── M7.4 💼 LinkedIn     ⏳ (needs API)
```

### M8: Monetization
```
admin_monetization
├── M8.1 💳 Subscriptions  ✅
├── M8.2 📊 Revenue        ✅
└── M8.3 👥 Subscribers    ✅
```

### M9: Security
```
admin_security
├── M9.1 👑 Admin List    ✅
├── M9.2 📋 Whitelist     ✅
└── M9.3 📜 Audit Logs    ✅
```

### M10: Settings
```
admin_settings
├── M10.1 🌍 Timezone     ✅
├── M10.2 🔔 Notifications ✅
├── M10.3 🔑 API Keys     ✅
└── M10.4 📤 Export Data  ✅
```

---

## 🔄 Wizard Flows

### W1: Content Wizard
```
Enter Content → Select Target → Set Schedule → Choose Format → Confirm
```

### W2: Channel Wizard
```
Enter @channel → Validate Bot Admin → Set Name → Done
```

### W3: Group Wizard
```
Enter Group ID → Validate Access → Set Welcome → Done
```

### W4: Pipeline Wizard
```
Select Type → Select Channel → Set Frequency → Enable Images → Active
```

---

## 📁 Key Files

| Menu | Handler File |
|------|--------------|
| Main | `lib/comprehensive-admin-menu.js` |
| RSS | `lib/menus/rss/rss-menu-handler.js` |
| Channels | `lib/menus/channels/channel-menu-handler.js` |
| Groups | `lib/menus/groups/group-menu-handler.js` |
| Scheduling | `lib/menus/scheduling/schedule-menu-handler.js` |
| Wizards | `lib/menus/wizards/` |

---

## 📊 Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Working |
| ⏳ | Needs external setup |
| ❌ | Broken (report!) |

---

**Version:** 2.14.3 | **Buttons:** 54+
