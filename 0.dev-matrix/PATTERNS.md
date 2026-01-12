# 🧠 PATTERNS

> **Shared Learning Repository - Transferable Across Projects**
> Every AI adds learnings here. Copy this file to new projects.
> This is the collective intelligence of all AIs who worked here.

---

## 📚 HOW TO USE THIS FILE

```
1. BEFORE coding → Search for relevant patterns
2. DURING coding → Apply patterns exactly
3. AFTER coding  → Add new patterns you discovered
4. NEW PROJECT   → Copy this file, learnings transfer!
```

---

## 🏗️ ARCHITECTURE PATTERNS

### Pattern: Module Structure
```javascript
// UNIVERSAL: Use this structure for any class/module
export default class ModuleName {
  constructor(config = {}) {
    this.config = config;
    this.initialized = false;
  }
  
  async initialize() {
    // Setup logic here
    this.initialized = true;
    return { success: true };
  }
  
  async cleanup() {
    // Cleanup logic here
    this.initialized = false;
  }
}
```
**Why:** Consistent lifecycle, easy testing, clear state.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Response Format
```javascript
// UNIVERSAL: Always return consistent response objects
// Success
return { success: true, data: result };

// Failure
return { success: false, error: 'Descriptive error message' };

// With metadata
return { 
  success: true, 
  data: result, 
  meta: { count: 10, page: 1 } 
};
```
**Why:** Predictable API responses, easy error handling.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Configuration Management
```javascript
// UNIVERSAL: Layered configuration
const config = {
  // Layer 1: Hardcoded defaults
  ...defaultConfig,
  
  // Layer 2: Environment variables
  ...envConfig,
  
  // Layer 3: Database settings (override env)
  ...dbConfig,
  
  // Layer 4: Runtime overrides
  ...runtimeConfig
};
```
**Why:** Flexible config, easy to change without code changes.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🔄 ASYNC PATTERNS

### Pattern: Safe Async Operations
```javascript
// UNIVERSAL: Wrap async operations with error handling
async function safeOperation(operation, fallback = null) {
  try {
    return await operation();
  } catch (error) {
    console.error(`Operation failed: ${error.message}`);
    return fallback;
  }
}

// Usage
const result = await safeOperation(
  () => fetchData(id),
  { data: [] }  // fallback value
);
```
**Why:** Prevents unhandled rejections, graceful degradation.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Retry with Backoff
```javascript
// UNIVERSAL: Retry failed operations with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```
**Why:** Handles transient failures, network issues.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 💾 DATABASE PATTERNS

### Pattern: Repository Pattern
```javascript
// UNIVERSAL: Abstract database operations
class Repository {
  constructor(db, tableName) {
    this.db = db;
    this.table = tableName;
  }
  
  async findById(id) {
    return this.db.query(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);
  }
  
  async findAll(filter = {}) {
    // Build query from filter
  }
  
  async create(data) {
    // Insert and return created record
  }
  
  async update(id, data) {
    // Update and return updated record
  }
  
  async delete(id) {
    // Delete and return success
  }
}
```
**Why:** Consistent data access, easy to swap databases.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Database Migration
```sql
-- UNIVERSAL: Migration file structure
-- Migration: 001_create_users_table
-- Created: 2026-01-11
-- Author: AI-ID

-- UP
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS users;
```
**Why:** Trackable schema changes, rollback capability.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🧪 TESTING PATTERNS

### Pattern: Test Structure
```javascript
// UNIVERSAL: Arrange-Act-Assert pattern
describe('ModuleName', () => {
  describe('methodName', () => {
    it('should do expected thing when given input', async () => {
      // ARRANGE - Setup
      const input = { key: 'value' };
      const expected = { result: 'expected' };
      
      // ACT - Execute
      const result = await module.methodName(input);
      
      // ASSERT - Verify
      expect(result).toEqual(expected);
    });
  });
});
```
**Why:** Clear test structure, easy to understand.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Mock Factory
```javascript
// UNIVERSAL: Create consistent test mocks
function createMockUser(overrides = {}) {
  return {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date(),
    ...overrides
  };
}

// Usage
const user = createMockUser({ name: 'Custom Name' });
```
**Why:** Consistent test data, easy to customize.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🎨 UI PATTERNS

### Pattern: Menu Builder (Telegram/Discord/Slack)
```javascript
// UNIVERSAL: Build interactive menus
function buildMenu(items, options = {}) {
  const { columns = 2, backButton = true } = options;
  
  const keyboard = [];
  let row = [];
  
  items.forEach((item, index) => {
    row.push({ text: item.label, callback_data: item.action });
    if (row.length === columns) {
      keyboard.push(row);
      row = [];
    }
  });
  
  if (row.length) keyboard.push(row);
  if (backButton) keyboard.push([{ text: '⬅️ Back', callback_data: 'back' }]);
  
  return { inline_keyboard: keyboard };
}
```
**Why:** Consistent menu generation, easy to modify.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Multi-line Text (Template Literals)
```javascript
// UNIVERSAL: For multi-line messages, ALWAYS use template literals
// ❌ WRONG - \n shows literally in some contexts
const wrong = "Line 1\nLine 2\nLine 3";

// ✅ RIGHT - Actual line breaks
const right = `Line 1
Line 2
Line 3`;

// ✅ With variables
const message = `Hello ${userName}!

Your order #${orderId} is confirmed.

Total: $${total}`;
```
**Why:** Prevents literal `\n` display, works everywhere.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🔐 SECURITY PATTERNS

### Pattern: Input Validation
```javascript
// UNIVERSAL: Validate all inputs
function validateInput(input, schema) {
  const errors = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = input[field];
    
    if (rules.required && !value) {
      errors.push(`${field} is required`);
    }
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be ${rules.type}`);
    }
    if (rules.max && value > rules.max) {
      errors.push(`${field} must be <= ${rules.max}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```
**Why:** Prevents injection, ensures data integrity.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Rate Limiting
```javascript
// UNIVERSAL: Prevent abuse with rate limiting
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.max = maxRequests;
    this.window = windowMs;
    this.requests = new Map();
  }
  
  isAllowed(clientId) {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    const recent = clientRequests.filter(t => now - t < this.window);
    
    if (recent.length >= this.max) return false;
    
    recent.push(now);
    this.requests.set(clientId, recent);
    return true;
  }
}
```
**Why:** Protects against DoS, ensures fair usage.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🚫 ANTI-PATTERNS (Never Do These)

### Anti-Pattern: Callback Hell
```javascript
// ❌ NEVER: Nested callbacks
getData(function(a) {
  getMoreData(a, function(b) {
    getEvenMoreData(b, function(c) {
      // Hell
    });
  });
});

// ✅ INSTEAD: Async/await
const a = await getData();
const b = await getMoreData(a);
const c = await getEvenMoreData(b);
```
**Why:** Unreadable, hard to debug, error-prone.

---

### Anti-Pattern: God Objects
```javascript
// ❌ NEVER: One class that does everything
class App {
  handleUsers() {}
  handleOrders() {}
  sendEmails() {}
  generateReports() {}
  processPayments() {}
  // ... 50 more methods
}

// ✅ INSTEAD: Separate concerns
class UserService {}
class OrderService {}
class EmailService {}
```
**Why:** Unmaintainable, untestable, violates SRP.

---

### Anti-Pattern: Magic Numbers
```javascript
// ❌ NEVER: Hard-coded mystery numbers
if (status === 3) { /* what is 3? */ }
setTimeout(fn, 86400000); // what is this?

// ✅ INSTEAD: Named constants
const STATUS_APPROVED = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (status === STATUS_APPROVED) {}
setTimeout(fn, ONE_DAY_MS);
```
**Why:** Self-documenting, easy to change, no guessing.

---

### Anti-Pattern: Swallowing Errors
```javascript
// ❌ NEVER: Silent failure
try {
  doSomething();
} catch (e) {
  // Nothing - error disappears
}

// ✅ INSTEAD: Handle or rethrow
try {
  doSomething();
} catch (e) {
  console.error('doSomething failed:', e);
  throw e; // or return error response
}
```
**Why:** Hidden bugs, impossible to debug production issues.

---

### Anti-Pattern: Premature Optimization
```javascript
// ❌ NEVER: Optimize before measuring
// "I'll use a custom linked list for better performance"
const list = new MyCustomLinkedList();

// ✅ INSTEAD: Use simple approach first
const list = [];
// Then profile if needed, optimize with data
```
**Why:** Wasted time, often makes code worse, measure first.

---

## 📝 PROJECT-SPECIFIC PATTERNS

### Telegram Bot: Single Instance
```javascript
// PROJECT: Telegram-MCP
// Only ONE bot instance per token
// ❌ Running both causes: ETELEGRAM 409 Conflict

// npm start      = Production bot (Heroku)
// npm run mcp    = Development (local)
// NEVER run both simultaneously
```
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Telegram Bot: Callback Handler
```javascript
// PROJECT: Telegram-MCP
// Handler pattern for Telegram callbacks
bot.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  switch (action) {
    case 'menu_main':
      await showMainMenu(ctx);
      break;
    case 'menu_settings':
      await showSettings(ctx);
      break;
    default:
      await ctx.answerCbQuery('Unknown action');
  }
});
```
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🛡️ ERROR PREVENTION PATTERNS

### Pattern: Error Logger Integration
```javascript
// UNIVERSAL: Always log errors to persistent storage
import errorLogger from './lib/error-logger.js';

// Initialize on startup
await errorLogger.initialize();

// In catch blocks - ALWAYS include context
catch (error) {
  console.error(error);
  await errorLogger.log(error, {
    module: 'module-name',
    function: 'functionName',
    severity: 'error', // or 'critical', 'warning'
    userId: userId || null,
    metadata: { additionalContext: 'value' }
  });
}
```
**Why:** Runtime errors captured to database, AI can query and fix.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Method Call Verification
```javascript
// ❌ WRONG - Method name doesn't exist
this.handleCallback(data);  // BUG: Should be handleAdminCallback

// ✅ RIGHT - Use exact method name from class definition
this.handleAdminCallback(data);  // Matches the actual method

// PREVENTION: Run npm run deep-scan before pushing
// Catches: UNDEFINED_METHOD errors at static analysis time
```
**Why:** Deep scanner catches typos before runtime.
**Critical Bug Fixed:** handleCallback → handleAdminCallback (v555)
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Async Error Handling
```javascript
// ❌ WRONG - No error handling
async function riskyOperation() {
  const data = await fetchData();
  return data.process();
}

// ✅ RIGHT - Full error handling with logging
async function safeOperation() {
  try {
    const data = await fetchData();
    return { success: true, data: data.process() };
  } catch (error) {
    console.error('Operation failed:', error.message);
    await errorLogger.log(error, {
      module: 'data-service',
      function: 'safeOperation'
    });
    return { success: false, error: error.message };
  }
}

// PREVENTION: Run npm run deep-scan
// Catches: ASYNC_NO_ERROR_HANDLING warnings
```
**Why:** Prevents silent failures, all errors traceable.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Callback Handler Coverage
```javascript
// ❌ WRONG - Missing case handler
switch (data.action) {
  case 'admin_settings':
    handleSettings();
    break;
  // Missing: 'admin_users' case - will silently fail!
}

// ✅ RIGHT - Default case + logging
switch (data.action) {
  case 'admin_settings':
    handleSettings();
    break;
  case 'admin_users':
    handleUsers();
    break;
  default:
    console.warn(`Unhandled callback: ${data.action}`);
    await errorLogger.log(new Error(`Unhandled callback: ${data.action}`), {
      module: 'callback-handler',
      function: 'handleCallback',
      severity: 'warning'
    });
}

// PREVENTION: Run npm run deep-scan
// Catches: UNHANDLED_CALLBACK warnings
```
**Why:** No user action silently fails.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

### Pattern: Pre-Push Validation
```bash
# UNIVERSAL: Before every git push
npm test              # All tests must pass
npm run deep-scan     # Review warnings, fix critical ones
git add -A
git commit -m "type(scope): description"
git push origin main  # GitHub first
git push heroku main  # Deploy second (if applicable)

# NEVER skip validation!
# The handleCallback bug passed 338 tests but broke production
```
**Why:** Catches bugs tests miss.
**Learned by:** OPUS-001 | **Project:** Telegram-MCP | **Date:** 2026-01

---

## 🔧 ADDING NEW PATTERNS

### Template
```markdown
### Pattern: [Pattern Name]
\`\`\`language
// Code example here
\`\`\`
**Why:** [Explain benefit]
**Learned by:** [AI-ID] | **Project:** [Project Name] | **Date:** [YYYY-MM]
```

### Guidelines
1. **Be specific** - Include working code
2. **Explain why** - Not just how
3. **Attribution** - Credit the discovering AI
4. **Context** - When to use (and when not to)

---

## 📊 PATTERN STATISTICS

| Category | Count | Last Updated |
|----------|-------|--------------|
| Architecture | 3 | 2026-01 |
| Async | 2 | 2026-01 |
| Database | 2 | 2026-01 |
| Testing | 2 | 2026-01 |
| UI | 2 | 2026-01 |
| Security | 2 | 2026-01 |
| Anti-Patterns | 5 | 2026-01 |
| Error Prevention | 5 | 2026-01 |
| Project-Specific | 2 | 2026-01 |
| **Total** | **25** | - |

---

**This file is TRANSFERABLE. Copy to new projects to share learnings!**
**Contributed by:** OPUS-001 | **Framework Version:** 3.0
