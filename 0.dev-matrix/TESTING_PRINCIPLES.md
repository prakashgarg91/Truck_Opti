# 🧪 TESTING PRINCIPLES — Universal Standard
> **Mandatory testing rules for all AI agents and developers.**
> **Read this BEFORE marking any feature or task as complete.**
>
> Source: Consolidated from Truck_Opti full button audit (found 8 critical "done" bugs),
> trading-rex-ai risk-first trading rules, code-review-graph blast radius analysis.

---

## ⚠️ THE CORE PRINCIPLE

> **Never assume a feature works without verified end-to-end proof.**
> **Do not mark a task complete unless you have confirmed the action succeeds and the user sees the correct outcome.**

This principle was added after a full UI audit revealed:
- 6 CTA buttons had **no `onClick` handlers** — code written, shipped, believed "done"
- An authentication flow was **disabled via env var** yet marked "complete"
- An operation **silently failed** with no user feedback whatsoever
- Links pointed to `href="#"` with no real page behind them

The pattern is universal: **AI code that compiles is NOT done.**

---

## ✅ MANDATORY PRE-COMPLETE CHECKLIST

Before moving any task to COMPLETED status, confirm ALL applicable items:

### For UI Components
- [ ] Interactive elements have their handler wired (onClick, onSubmit, etc.)
- [ ] Clicking performs the expected action (navigate, open modal, submit, etc.)
- [ ] Not permanently disabled by a missing env var or feature flag
- [ ] Shows loading state during async operations
- [ ] Shows error state if operation fails
- [ ] Accessible (descriptive label or aria-label)

### For Forms / API Calls
- [ ] Form submission calls the correct endpoint
- [ ] Endpoint exists and returns expected data in current environment
- [ ] API error is caught and shown to user (not silently swallowed)
- [ ] Success state is clearly communicated (toast, redirect, etc.)
- [ ] Validation prevents invalid data submission

### For Auth / Feature Flags
- [ ] Required env vars are set in ALL environments (dev AND production)
- [ ] Feature is NOT gated behind a flag currently set to `false`
- [ ] Third-party services (Twilio, Razorpay, OAuth, etc.) are actually configured
- [ ] If a service is NOT configured, user sees a helpful error — not silent failure

### For New Pages / Routes
- [ ] Route is registered in the app router
- [ ] Page loads without console errors
- [ ] Page is reachable from relevant navigation
- [ ] Page has correct title/metadata set

### For Backend / API Endpoints
- [ ] Endpoint responds with correct status code
- [ ] Input validation rejects malformed requests with descriptive errors
- [ ] Error response does NOT leak stack trace or DB internals
- [ ] Authentication/authorization is enforced (not just on the happy path)

### For Database Changes / Migrations
- [ ] Migration runs cleanly on a fresh DB
- [ ] Rollback (if any) is tested
- [ ] RLS policies scope correctly (never `USING (true)`)
- [ ] No existing data is silently corrupted

### For Trading / Financial Logic
- [ ] Risk validation runs BEFORE any order is placed
- [ ] Backtest on historical data passes minimum thresholds (Sharpe > 1.0, drawdown < 20%)
- [ ] Paper trading validation period completed before live capital
- [ ] Circuit breakers (emergency stop, position limits) tested
- [ ] All calculations use defined constants — never magic numbers

---

## 🧪 TESTING STRUCTURE — AAA Pattern

All tests must follow Arrange-Act-Assert:

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
it('blocks overdraft withdrawal', async () => {
    // ARRANGE
    const account = { balance: 100 }

    // ACT
    const result = await withdrawalService.withdraw(account, 999)

    // ASSERT
    expect(result.success).toBe(false)
    expect(result.error).toBe('Insufficient funds')
})
```

---

## 🔍 HOW TO AUDIT A PAGE/FEATURE

When testing any UI surface, run through this script:

```
1. OPEN PAGE
   - Does it load without crashing?
   - Console errors?

2. FOR EVERY INTERACTIVE ELEMENT:
   a. Read source code — is the handler wired?
   b. Click/submit in browser — does something happen?
   c. If async — check Network tab for actual request
   d. Error case — is the error message helpful?

3. FOR EVERY FORM:
   a. Submit with valid data — does it work?
   b. Submit with invalid data — error shown?
   c. What happens if the API is down?

4. FOR EVERY LINK / ROUTE:
   a. Does it navigate to a real page (not href="#")?
   b. Does the target page exist and load?

5. ENVIRONMENT CHECK:
   a. Are all required env vars set?
   b. Are third-party services configured?
```

---

## 📊 MINIMUM EVIDENCE REQUIRED

When marking a task done, post in STATE.md / TASK.md:

```
## Task: <task name>
Status: COMPLETE
Evidence:
  - Command run: <exact command>
  - Result: <pass/fail + key numbers>
  - User flow verified: <what you clicked/tested>
  - Console errors: none
```

Incomplete evidence = task is not done.

---

## 📎 SEE ALSO

- `QUALITY-BASELINE.md` — Definition of Done + gate commands
- `RULES.md` — Rule 2 (never mark done without testing)
- `SECURITY.md` — Pre-commit security checklist
