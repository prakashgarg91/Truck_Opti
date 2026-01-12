# 📜 RULES

> **AI Development Rules & Anti-Patterns**
> Read this ONCE before starting work.

---

## 🔴 CRITICAL RULES

### 1. Single Bot Instance
```
❌ NEVER run two bots with same token
✅ Use: npm start (prod) OR npm run mcp (dev) - NOT BOTH
```

### 2. Push Order
```
git push origin main   ← FIRST (GitHub)
git push heroku main   ← SECOND (Heroku)
```

### 3. Menu Text = Template Literals
```javascript
// ❌ WRONG - shows literal \n
const text = "Line 1\nLine 2";

// ✅ RIGHT - actual line breaks
const text = `Line 1
Line 2`;
```

### 4. Every Module Needs initialize()
```javascript
export default class MyModule {
  constructor() { this.initialized = false; }
  async initialize() { this.initialized = true; }
}
```

### 5. Test Before Commit
```bash
npm test           # Must pass 338+ tests
npm run analyze    # Static analysis for hidden bugs
```

---

## 🔴 HIDDEN BUG PREVENTION

### 6. Run Static Analysis
```bash
# Find bugs that unit tests miss
node scripts/static-analysis.js
```

### 7. Method Name Verification
```javascript
// ❌ WRONG - typo in method name
await this.handleCallback(query);  // Does this method exist?

// ✅ RIGHT - verify method exists
await this.handleAdminCallback(query);  // Exact method name
```

### 8. Error Logging is MANDATORY
```javascript
// All catch blocks MUST log to Supabase
catch (error) {
  await errorLogger.log(error, {
    module: 'module-name',
    function: 'function-name',
    severity: 'error'
  });
}
```

### 9. Check Errors in Supabase
```sql
-- Before ANY deployment, check:
SELECT * FROM bot_errors WHERE NOT resolved ORDER BY occurred_at DESC;
```

---

## 🟡 IMPORTANT RULES

### 6. Return Format
```javascript
// Always return { success, data?, error? }
return { success: true, data: result };
return { success: false, error: 'message' };
```

### 10. No TODO in Production
```javascript
// ❌ Left placeholder
async save() { /* TODO: implement */ }

// ✅ Actually implement
async save() { return await db.insert(this.data); }
```

---

## 🔬 DEEP ERROR PREVENTION (CRITICAL!)

### 11. Run Deep Scan Before EVERY Commit
```bash
npm run deep-scan   # Find ALL hidden bugs
npm run pre-deploy  # Full check: tests + scan
```

### 12. Error Types to Fix

| Type | Severity | Must Fix? |
|------|----------|-----------|
| UNDEFINED_METHOD | 🔴 High | YES - Will crash at runtime |
| UNDEFINED_VARIABLE | 🔴 High | YES - Will crash at runtime |
| UNHANDLED_CALLBACK | 🔴 High | YES - Button won't work |
| IMPORT_NOT_EXPORTED | 🔴 High | YES - Import will fail |
| ASYNC_NO_ERROR_HANDLING | 🟡 Medium | Should fix |
| EMPTY_CATCH | 🟡 Medium | Should fix |
| DEAD_CODE | 🟢 Low | Nice to fix |

### 13. Query Errors from Database
```sql
-- Check Supabase for runtime errors
SELECT * FROM bot_errors 
WHERE NOT resolved 
ORDER BY occurred_at DESC;

-- Critical errors first
SELECT * FROM bot_errors 
WHERE severity = 'critical' AND NOT resolved;
```

### 14. Fix Error Workflow
```
1. Run deep-scan → Find warnings
2. Check Supabase → Find runtime errors  
3. Fix errors (highest severity first)
4. Run tests → Verify fix
5. Run deep-scan again → Confirm warnings reduced
6. Commit + Push
```

---

## 🟡 IMPORTANT RULES

### 15. Database Check
```javascript
// Local: SQLite (data/*.db)
// Heroku: PostgreSQL (DATABASE_URL)
// Cloud: Supabase (SUPABASE_URL)
```

### 16. No Duplicate Handlers
```javascript
// ❌ Two handlers for same callback
case 'rss_add': ...
case 'rss_add': ... // DUPLICATE!

// ✅ One handler per callback
```

### 17. Health Endpoint Required
```
GET /health → { status: 'ok', uptime: X }
GET /status → { modules: [...], database: 'connected' }
```

---

## 🟢 BEST PRACTICES

### 18. File Naming
- Classes: `PascalCase` → `ChannelManager`
- Files: `kebab-case` → `channel-manager.js`
- Methods: `camelCase` → `addChannel()`

### 12. Error Messages Include Context
```javascript
throw new Error(`Channel ${channelId} not found in DB`);
// NOT: throw new Error('Not found');
```

### 13. Log Important Actions
```javascript
console.log(`[RSS] Added feed: ${feedUrl} → ${channelId}`);
```

### 14. Cleanup Test Data
```javascript
afterEach(async () => {
  await db.query('DELETE FROM test_channels');
});
```

### 15. Environment Variables
```bash
# Required
TELEGRAM_BOT_TOKEN=xxx
ADMIN_TELEGRAM_ID=1443609804

# Optional
GEMINI_API_KEY=xxx
SUPABASE_URL=xxx
```

---

**Version:** 2.14.3 | **Rules Count:** 15
