# 🧩 PATTERNS — Universal Implementation Patterns
> **Universal patterns that apply across all repos.**
> Per-repo PATTERNS.md adds stack-specific patterns on top of this baseline.
> Consolidated from Truck_Opti (TypeScript/Supabase) and trading-rex-ai (Python/SQLAlchemy).

---

## 🤖 AUTONOMOUS DEVELOPMENT PATTERNS

### Pattern: MCP-First Retrieval Stack (Save Tokens, Save Money)

**Rule:** Before any broad file read, repo inventory, or repeated grep pass, use the MCP retrieval stack in this exact order:

1. **`roo-code-index-bridge_roo-code-index-search`** — semantic ownership discovery
2. **Graphify MCP tools** (`graphify_graph_stats`, `graphify_query_graph`) — structural map
3. **`code-review-graph_*_tool`** — blast radius and affected flows
4. **Only then** — direct file reads or grep for exact confirmation

**Why:** Roo Index + Graphify + CRG together answer "what files matter" and "what will break" without reading 50+ files. This saves 60-80% of token spend vs. naive file-by-file exploration. In the 2026-06-07 TO-107 run, the scout used 6 MCP calls to isolate the root cause across 3 files instead of reading the entire frontend tree.

**Cost evidence:** A typical scout/build/review cycle on Truck_Opti costs ~$0.15-0.30 with MiniMax M3 Free (scout + build) + one DeepSeek V4 Pro review gate. The same work done by direct Copilot Chat without MCP pre-filtering costs 3-5x more in token consumption because it reads irrelevant files.

---

### Pattern: Opencode as Primary Execution Engine

**Rule:** Use `opencode` (free models: MiniMax M3 Free, DeepSeek V4 Pro) as the primary autonomous execution engine. Reserve paid Copilot/Claude interactions for:
- Final review gates (DeepSeek V4 Pro completion review)
- Human-blocked task unblocking (owner credential setup)
- Complex multi-file refactors that need interactive reasoning

**Why:** `opencode` runs the full scout/build/review triad with free models. The 2026-06-07 TO-107 run proved the pipeline: scout (MiniMax M3 Free) diagnosed Heroku bundle drift in 3 minutes, build (MiniMax M3 Free) validated the bounded slice and made the `server.js` cache-header fix, review gate (pending) will sign off with DeepSeek V4 Pro.

**Execution contract:**
```powershell
# Start autonomous pipeline
.\START-AUTONOMOUS-DEV.bat 12

# Or directly via Frame
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Github\Frame\run-portfolio.ps1" -ProjectName "Truck_Opti" -MaxRunsOverride 12
```

---

### Pattern: Bounded-Slice Scout → Build → Review Triad

**Rule:** Every task follows the triad:
1. **Scout** — read-only diagnosis, writes `SCOUT-CONTEXT.md` artifact, no code edits
2. **Build** — bounded-slice edits only, writes `BUILD-RESULT.md` artifact, validates immediately
3. **Review** — sign-off or correction cycle, only lane allowed to mark task done

**Why:** Prevents unbounded scope creep. The scout's artifact is the contract; build cannot widen scope. Review is the gate. In TO-107, the scout explicitly excluded `apps/web` Python, migration apply, and smoke-script edits from the bounded slice — build respected that boundary.

---

## 🔐 SECURITY PATTERNS

### Pattern: Parameterized DB Queries (Never Concatenate)
```python
# ✅ SQLite raw
db.execute("SELECT * FROM orders WHERE user_id = ?", (user_id,))

# ✅ SQLAlchemy ORM (preferred)
orders = db.query(Order).filter(Order.user_id == user_id).all()
```
```typescript
// ✅ Supabase client
const { data } = await supabase.from('orders').select().eq('user_id', userId)
```
**Why:** Prevents SQL injection — the #1 AI-generated security flaw.

---

### Pattern: Config Access via Config/Env Module
```python
# ✅ Python — centralized config
from app.core.config import Config
config = Config()
api_key = config.service.api_key
```
```typescript
// ✅ TypeScript — validated env module
import { env } from '../config/env'
const apiKey = env.SERVICE_API_KEY
```
**Why:** Centralized config, no hardcoded secrets, fails fast if key is missing.

---

### Pattern: Never Expose Raw Errors to Users
```python
# ✅ Python
try:
    result = do_operation()
except Exception as exc:
    logger.error("Operation failed", exc_info=True)
    return {"error": "Operation failed. Please try again."}
```
```typescript
// ✅ TypeScript
try {
    const result = await doOperation()
    return result
} catch (error) {
    console.error('[context] operation error:', error)
    toast.error('Something went wrong. Please try again.')
}
```
**Why:** Raw error messages leak DB schema, file paths, and internal state.

---

## 🧪 TESTING PATTERNS

### Pattern: AAA Test Structure (Arrange-Act-Assert)
```python
def test_risk_limit_blocks_overflow(risk_manager, order):
    # ARRANGE
    order.quantity = 999_999

    # ACT
    result = risk_manager.validate_order(order)

    # ASSERT
    assert result is False
```
```typescript
it('blocks overdraft withdrawal', () => {
    // ARRANGE
    const account = { balance: 100 }

    // ACT
    const result = withdrawalService.canWithdraw(account, 999)

    // ASSERT
    expect(result).toBe(false)
})
```
**Why:** Clear intent, easy to read, easy to debug when it fails.

---

### Pattern: Risk/Validation Before Side Effects
```python
# ✅ Python — validate before acting
if not risk_manager.validate_order(order):
    return {"error": "Risk limits exceeded"}
result = api.place_order(order)
```
```typescript
// ✅ TypeScript — guard before mutation
if (!canPerformAction(user, action)) {
    throw new UnauthorizedError('Action not permitted')
}
await performAction(action)
```
**Why:** Prevents state corruption when validation fails mid-operation.

---

## 🔄 LIFECYCLE PATTERNS

### Pattern: Async Resource Cleanup
```typescript
// ✅ React — always return cleanup from useEffect
useEffect(() => {
    const channel = supabase.channel('name').on('*', handler).subscribe()
    return () => { supabase.removeChannel(channel) }
}, [dependency])
```
```python
# ✅ Python — use context managers
with database_connection() as db:
    result = db.query(...)
# connection automatically closed
```
**Why:** Resource leaks cause memory exhaustion and stale subscriptions pushing updates to unmounted components.

---

### Pattern: Strategy / Base Class Interface
```python
# ✅ Enforces consistent interface for pluggable strategies
class BaseStrategy:
    def analyze(self, data: dict) -> dict:
        raise NotImplementedError
    def validate(self, signal: dict) -> bool:
        raise NotImplementedError
```
**Why:** Prevents strategy implementations from diverging silently.

---

## 🧱 SHARED CAPABILITY PATTERNS

### Pattern: Separate Product Repos, Shared Capability Contracts
```text
Product repo owns:
- business rules
- UI / endpoints
- product-specific persistence
- launch and failure isolation

Shared capability owns:
- generic monitoring / polling
- RSS parsing
- dedupe helpers
- normalized contracts
- provider fallbacks
```
**Canonical home:** `D:\Github\Office_Scripts\Shared-scripts\`

**Rule:** put cross-repo generic building blocks in the shared capability layer, but keep product logic inside each product repo. Repos may consume the same capability without importing each other's business code.

**Why:** This preserves blast-radius isolation while still avoiding repeated plumbing work.

---

### Pattern: Source Watch Capability
```json
{
    "item_id": "source:abc123",
    "source_type": "rss",
    "source_url": "https://example.com/feed.xml",
    "canonical_url": "https://example.com/post",
    "title": "Example title",
    "summary": "Short extracted summary",
    "content_text": "Normalized body text",
    "published_at": "2026-05-31T10:00:00Z",
    "detected_at": "2026-05-31T10:05:00Z",
    "content_hash": "sha256:...",
    "tags": ["finance", "india"]
}
```
**Use it for:** website monitoring, RSS/feed polling, dedupe, and normalized item output.

**Consumers:** Blogger-MCP, Telegram-MCP, Opportunity Gap finder, and future content or alerting repos.

**Rule:** Source Watch should live as a shared capability under `D:\Github\Office_Scripts\Shared-scripts\` or be promoted to a small shared service when runtime/state requirements outgrow a folder-only implementation.

**Why:** One normalized upstream contract lets separate repos reuse the same source intelligence without becoming coupled to each other's app code.

---

## 📊 STATE MANAGEMENT PATTERNS

### Pattern: Single Authoritative State Store
```typescript
// ✅ ONE store for shared state — never duplicate in local useState
import { useAuthStore } from '../store/authStore'
const { user, agencyId } = useAuthStore()

// ❌ NEVER — local state for shared data
const [user, setUser] = useState(null)
```
**Why:** Multiple sources of truth cause sync bugs and stale reads.

---

### Pattern: Derived Values via Memo — Not useEffect Sync
```typescript
// ✅ Derive from state
const displayName = useMemo(() => `${user.first} ${user.last}`, [user])

// ❌ ANTI-PATTERN — effect to sync derived state
const [displayName, setDisplayName] = useState('')
useEffect(() => { setDisplayName(`${user.first} ${user.last}`) }, [user])
```
**Why:** The effect version creates render loops and unnecessary re-renders.

---

## 🔢 CONSTANT PATTERNS

### Pattern: Named Constants — Never Magic Numbers in Logic
```typescript
// ✅
const GST_RATE = 0.18
const MAX_FILE_SIZE_MB = 5
return amount * GST_RATE

// ❌ Bypasses the constant and causes hidden bugs
return amount * 0.05   // BUG-020 pattern
```
**Why:** Constants that are defined but not used cause real production bugs.

---

## 📝 AI CONTEXT PATTERNS

### Pattern: Code-Review-Graph First Call
```
# Before any non-trivial edit:
code-review-graph_get_minimal_context_tool(repo_root="D:/Github/<repo>", task="<description>")   # ~100 tokens, full picture
```
**Why:** Prevents editing code without knowing its call graph and blast radius.

---

### Pattern: Roo Bridge And Graphify Before Grep
```
# For intent/behaviour queries:
roo-code-index-bridge_roo-code-index-search(query="payment webhook processing", workspace_path="D:/Github/<repo>")

# For architecture and gap questions after semantic narrowing:
read graphify-out/GRAPH_REPORT.md
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Query "payment webhook processing"

# For exact strings only after semantic narrowing:
grep_search(query="verifyWebhookSignature")
```
**Why:** Roo bridge surfaces the right code neighborhood by intent, Graphify highlights structural gaps and community boundaries, and grep confirms exact strings after the graph layer narrows the search surface.

---

## 📎 SEE ALSO

- `SECURITY.md` — Security patterns and pre-commit checks
- `RULES.md` — Coding rules (many cross-reference these patterns)
- Per-repo `PATTERNS.md` — Stack-specific patterns (TypeScript, Python, etc.)
