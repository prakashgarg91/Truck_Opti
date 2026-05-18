# 🧩 PATTERNS — Universal Implementation Patterns
> **Universal patterns that apply across all repos.**
> Per-repo PATTERNS.md adds stack-specific patterns on top of this baseline.
> Consolidated from Truck_Opti (TypeScript/Supabase) and trading-rex-ai (Python/SQLAlchemy).

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

## 💸 PAYMENT PATTERNS

### Pattern: Payment Success Owns Invoice Delivery
```typescript
const { error: updateError } = await supabase.from('payment_history')
    .update({ status: 'success', invoice_id: invoiceId, metadata: updatedMetadata })
    .eq('id', paymentRow.id)

if (updateError) {
    throw updateError
}

try {
    await finalizePaidInvoiceDelivery(supabase, {
        invoiceId,
        paymentHistoryId: paymentRow.id,
        paymentMetadata: updatedMetadata,
        userId,
        customerEmail,
        customerPhone,
        paymentProvider: 'razorpay',
        providerPaymentId,
    })
} catch (deliveryError) {
    console.error('Invoice delivery follow-up failed after payment verification:', deliveryError)
}
```
**Why:** Hosted PDFs and invoice emails must hang off the server-owned payment success path, not the UI. Keep the delivery helper idempotent, call it from every success handler including duplicate-return branches, and make it best-effort so a billing-document problem never reverses a successful payment.

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
get_minimal_context(task="<description>")   # ~100 tokens, full picture
```
**Why:** Prevents editing code without knowing its call graph and blast radius.

---

### Pattern: Roo Bridge And Graphify Before Grep
```
# For intent/behaviour queries:
search_roo_index(query="payment webhook processing", scope="code")

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
