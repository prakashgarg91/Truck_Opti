# 🛡️ SECURITY — Universal Safeguards
> **Audience**: Every AI agent (Claude, GPT, Gemini, Copilot, etc.) working on any D:\Github repo.
> **Status**: Living document. Update when new bug classes are discovered.
> **Source**: Checkmarx / DevOps.com — "When AI Gets It Wrong: The Insecure Defaults Lurking in Your Code"
> **Severity codes**: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## WHY THIS EXISTS

AI assistants are trained on billions of lines of public code — including deprecated patterns,
insecure configurations, and "quick-fix" tutorials never meant for production.
Because the model is probabilistic (not security-aware), it defaults to the **most common** pattern,
not the **most secure** one.

**Several of these failure modes have already occurred across this system's repositories.**
This file is the mandatory pre-commit checklist that prevents recurrence.

---

## 🔴 SAFEGUARD 1 — SQL Injection (Never String-Concatenate Queries)

**AI's bad default:**
```python
# ❌ exploitable
query = f"SELECT * FROM orders WHERE user_id = '{user_id}'"
db.execute(query)
```

**Required pattern:**
```python
# ✅ parameterized (SQLite/psycopg2)
db.execute("SELECT * FROM orders WHERE user_id = ?", (user_id,))

# ✅ ORM (SQLAlchemy)
orders = db.query(Order).filter(Order.user_id == user_id).all()
```
```typescript
// ✅ Supabase client — never raw concatenated SQL
const { data } = await supabase.from('orders').select().eq('user_id', userId)
```

**Pre-commit grep check (zero hits required):**
```
grep -rn "f\"SELECT\|f'SELECT\|\"SELECT.*+\|'SELECT.*+" .
grep -rn "f\"INSERT\|f\"UPDATE\|f\"DELETE" .
```

---

## 🔴 SAFEGUARD 2 — Weak Cryptography / Broken Auth Algorithms

**AI's bad default:**
```python
# ❌ MD5 and SHA-1 are broken
import hashlib
token_hash = hashlib.md5(token.encode()).hexdigest()
```

**Required pattern:**
```python
# ✅ Password hashing — bcrypt or PBKDF2
import bcrypt
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

# ✅ HMAC signing — SHA-256 minimum
import hmac, hashlib
sig = hmac.new(secret.encode(), data.encode(), hashlib.sha256).hexdigest()

# ✅ JWT — RS256 or HS256 only (never "none" algorithm)
```

**Pre-commit grep check:**
```
grep -rn "md5\|sha1\b\|sha_1" . --include="*.py" --include="*.ts" --include="*.js"
```

---

## 🔴 SAFEGUARD 3 — Payment Webhooks Must Verify Origin (HMAC)

**AI's bad default:** Process the webhook payload without checking the signature header.

**Required pattern:**
```python
# ✅ Razorpay
import hmac, hashlib
def verify_razorpay_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

# ✅ ALWAYS: reject if signature missing or invalid — do not process
```

---

## 🔴 SAFEGUARD 4 — Row Level Security (Never USING (true))

**AI's bad default:** `CREATE POLICY ... USING (true)` — grants full table access to all authenticated users.

**Required pattern (Supabase / PostgreSQL RLS):**
```sql
-- ✅ Scope to owner
CREATE POLICY "users_own_rows" ON shipments
  FOR ALL USING (auth.uid() = user_id);

-- ✅ Agency/tenant scoping
CREATE POLICY "agency_rows" ON shipments
  FOR SELECT USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
```

**Pre-commit grep check:**
```
grep -rn "USING (true)" . --include="*.sql"
```
Zero hits required.

---

## 🟠 SAFEGUARD 5 — Open Redirect Prevention

**AI's bad default:** Forward users to a URL returned in an API response without validation.

**Required pattern:**
```typescript
// ✅ Allowlist of safe domains
const ALLOWED_DOMAINS = ['yourapp.com', 'payment-provider.com']
function isSafeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch { return false }
}
if (isSafeUrl(redirectUrl)) window.location.href = redirectUrl
```

---

## 🟠 SAFEGUARD 6 — File Upload Type Validation

**AI's bad default:** Trust the `Content-Type` header sent by the client.

**Required pattern:**
```python
# ✅ Validate magic bytes, not MIME header
import imghdr
def validate_image(file_bytes: bytes) -> bool:
    return imghdr.what(None, h=file_bytes) in ('jpeg', 'png', 'gif', 'webp')
```
```typescript
// ✅ Also validate extension + size on server side — never client-only
```

---

## 🟠 SAFEGUARD 7 — Secret Management (No Hardcoded Values)

**AI's bad default:** Hardcode API keys as string literals.

**Required pattern:**
```python
# ✅ Always from environment
import os
api_key = os.environ["SERVICE_API_KEY"]  # raises KeyError if missing — good
```
```typescript
// ✅ From validated env module
import { env } from '../config/env'
```

**Pre-commit grep check:**
```
grep -rn "sk-\|pk-live\|secret.*=.*['\"][a-zA-Z0-9_-]\{20,\}" . --include="*.py" --include="*.ts"
```

---

## 🟠 SAFEGUARD 8 — No eval(), exec(), pickle, yaml.unsafe_load()

These permanently open remote code execution. No exceptions.

**Pre-commit grep check:**
```
grep -rn "\beval(\|\bexec(\|pickle\.loads\|yaml\.unsafe_load" . --include="*.py"
```
Zero hits required.

---

## 🟡 SAFEGUARD 9 — Dependency CVE Hygiene

After ANY `npm install`, `pip install`, or `uv add`:
```
npm audit                    # 0 high/critical required
pip-audit                    # or: uv run pip-audit
```
Do not ship with known high/critical CVEs. Medium CVEs require documented justification.

**CDN dependencies:** Avoid CDN tarball installs that bypass npm registry (Dependabot cannot scan them).

---

## 🟡 SAFEGUARD 10 — Error Messages Must Not Leak Internals

```typescript
// ❌ Leaks table/column names and stack traces
res.status(500).json({ error: err.message, stack: err.stack })

// ✅ Log internally, return generic
logger.error('DB error:', err)
res.status(500).json({ error: 'Internal server error' })
```

---

## ✅ §CHECKLIST — Run Before Writing Security-Sensitive Code

Before writing code that touches **auth, DB, payments, file uploads, redirects, env vars**:

- [ ] Am I using parameterized queries (not f-string SQL)?
- [ ] Am I using the config module (not hardcoded secrets)?
- [ ] If handling payments — am I verifying the webhook HMAC?
- [ ] If writing RLS policies — am I scoping to `auth.uid()` (not `USING (true)`)?
- [ ] If handling redirects — am I validating against an allowlist?
- [ ] If accepting file uploads — am I validating magic bytes server-side?
- [ ] Am I using strong hashing (bcrypt/SHA-256) not MD5/SHA-1?
- [ ] Have I run `npm audit` / `pip-audit` after any new dependency?
- [ ] Are error responses generic to the user and detailed in logs only?
- [ ] Zero uses of `eval()`, `exec()`, `pickle.loads()`, `yaml.unsafe_load()`?

---

## 📎 SEE ALSO

- `RULES.md` — General coding rules
- `TESTING_PRINCIPLES.md` — Mandatory testing before marking done
- Per-repo `SECURITY.md` — Repo-specific known vulnerabilities and history
