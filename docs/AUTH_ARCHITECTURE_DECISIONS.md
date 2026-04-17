# Auth Architecture Decisions — TruckOpti

> **Status:** Decision Record | **Date:** 2026-03-31 | **Author:** GLM-005 (Manager)
> **Audience:** Project owner, future developers, AI agents

---

## Executive Summary

TruckOpti has **two separate authentication systems** that are **not connected to each other**:

1. **Production frontend** (`frontend/`): Uses **Supabase Auth** exclusively — OTP delivery, Google OAuth, session management, JWT handling are all handled by Supabase.
2. **Legacy Flask backend** (`apps/web/`): Has a custom OTP service (`otp_service.py`) that delivers OTPs via Telegram bot or Gmail SMTP. This is **not wired into the React frontend** and runs on a completely separate stack (Flask + SQLite + custom JWT).

**Key decision for launch:** Configure Twilio in Supabase Auth (5-minute task) OR accept Email OTP + Google OAuth as the launch auth methods and defer phone OTP. If phone OTP is enabled later, keep it inside Supabase Phone Auth with Twilio/Twilio Verify instead of introducing Firebase Auth as a second production auth system.

---

## 1. Why Telegram Private Channels Are NOT a Production Database

Using a Telegram private channel as a database for user data, OTP records, or application state is **not viable for production** for these reasons:

### Rate Limits
- Bot API: ~1 message/second per chat. Group/channel: ~20 messages/minute.
- At scale (1000+ users), every OTP verification would be rate-limited.
- Telegram may throttle or block bots that exceed usage patterns.

### No Query Capability
- No SQL, no indexing, no filtering.
- "Search" is text-based message search — no structured queries.
- Cannot do `SELECT * WHERE phone = ? AND otp = ? AND expires_at > NOW()`.
- Every data retrieval requires fetching all messages and parsing them.

### No ACID / No Transactions
- Writing a user record and updating their subscription cannot be atomic.
- If the bot crashes mid-operation, data is in an inconsistent state.
- No rollback, no constraints, no foreign keys.

### Data Size Limits
- Telegram messages: 4096 characters max.
- File attachments: 50 MB per file, but API retrieval is slow.
- No schema enforcement — any message format accepted.

### Reliability
- Telegram has had multi-hour outages (e.g., major 2025 outages affecting millions).
- Your database uptime = Telegram's uptime. No SLA for free bots.
- No point-in-time recovery, no backups you control.

### Security
- All data passes through Telegram's servers.
- No encryption at rest under your control.
- Bot tokens, if leaked, expose all channel data.
- No Row-Level Security, no user isolation.

### Migration Lock-In
- No standard export format.
- Every query is a custom Telegram API call.
- Moving to a real database later = full rewrite.

### Verdict

Telegram private channels are useful for **notifications and logging** (append-only, low-volume data). They are **not a database** for any application that needs queries, transactions, user isolation, or reliability guarantees.

---

## 2. The Custom OTP Service (`apps/web/`) — Assessment

### What It Has

| Feature | Status | Notes |
|---------|--------|-------|
| OTP generation (6-digit) | ✅ Works | Uses `random.choices` (should use `secrets.choice` for crypto safety) |
| OTP hashing (SHA-256) | ✅ Works | Acceptable for OTP verification |
| Rate limiting (5/hour, 30s cooldown) | ✅ Works | Per-process only, lost on restart |
| Telegram bot delivery | ✅ Works | Requires user to message bot first for chat_id |
| Email SMTP delivery | ✅ Works | Via Gmail App Password |
| Dev console mode | ✅ Works | Print to terminal |
| OTP expiry (5 minutes) | ✅ Works | |
| Max attempts (3) | ✅ Works | |

### What It Cannot Do (Production Gaps)

| Gap | Severity | Why It Matters |
|-----|----------|----------------|
| **In-memory OTP store** | 🔴 Critical | OTPs lost on process restart. Not shared across workers. |
| **No database** | 🔴 Critical | Uses SQLite + Python dict, not connected to Supabase. |
| **No session management** | 🔴 Critical | Frontend expects Supabase session tokens, not custom JWTs. |
| **Separate user model** | 🔴 Critical | Flask `User` model is separate from Supabase `auth.users`. |
| **No phone SMS delivery** | 🟠 High | Telegram bot requires user to initiate chat. Not real SMS. |
| **No WhatsApp delivery** | 🟠 High | Only a placeholder. |
| **chat_id registration friction** | 🟠 High | User must message bot on Telegram before receiving OTPs. |
| **Not wired to frontend** | 🔴 Critical | Frontend calls `supabase.auth.signInWithOtp()`, not Flask endpoints. |

### What Would Be Required to Use It

1. **Replace** `supabase.auth.signInWithOtp()` calls in the frontend with calls to Flask `/api/v1/auth/send-otp` and `/verify-otp`.
2. **Replace** Supabase session management (JWT generation, refresh tokens, expiry, revocation) — ~500 lines of new code.
3. **Replace** user sync logic in `authStore.ts` (currently syncs to Supabase `public.users` table).
4. **Add** persistent OTP storage (Redis or database table).
5. **Add** phone SMS delivery (Twilio/Vonage) or require users to use Telegram.
6. **Migrate** all existing users from Supabase `auth.users` to Flask's SQLite/Postgres.
7. **Test** all auth flows end-to-end.

**Estimated effort: 2–3 weeks for an experienced developer.**

---

## 3. Migration Options: Supabase OTP → Self-Managed OTP

### Option A: Configure Twilio in Supabase (Recommended for Launch)

| Aspect | Detail |
|--------|--------|
| **Effort** | 5 minutes |
| **What changes** | Zero code changes. Supabase dashboard → Auth → Phone → Enter Twilio credentials. |
| **What you get** | Phone SMS OTP + WhatsApp OTP working immediately. |
| **Cost** | Twilio: ~₹4/SMS for India. ~₹4000/month for moderate volume. |
| **Risk** | Minimal. Supabase handles rate limiting, security, delivery. |
| **Dependency** | Supabase + Twilio. Both are established, well-maintained services. |

### Option B: Launch Without Phone OTP (Alternative)

| Aspect | Detail |
|--------|--------|
| **Effort** | 0 minutes (already working) |
| **What changes** | Accept Email OTP + Google OAuth as launch auth methods. |
| **What you get** | Users can sign up/login via email OTP or Google. No phone OTP. |
| **Cost** | ₹0 additional. |
| **Risk** | Some Indian users may expect phone OTP. Google OAuth is universal. |
| **Dependency** | Supabase only. |

### Option C: Full Custom OTP Migration (Future Consideration)

| Aspect | Detail |
|--------|--------|
| **Effort** | 2–3 weeks |
| **What changes** | Replace all Supabase Auth calls with custom backend. Build JWT system, session management, user migration, persistent OTP storage, SMS gateway. |
| **What you get** | Complete independence from Supabase Auth. Full control over auth flow. |
| **Cost** | Development time + SMS gateway costs + infrastructure. |
| **Risk** | High. Security-critical system rewrite. Requires extensive testing. |
| **Dependency** | Self-managed (your server, your database, your SMS gateway). |

### Recommendation

**For launch: Option A (Twilio in Supabase) or Option B (Email + Google only).**

If TruckOpti decides to add phone OTP later, the implementation path should remain:

- Supabase Auth for session issuance and identity storage
- Supabase Phone provider backed by Twilio or Twilio Verify for SMS/WhatsApp delivery

Do **not** add Firebase Auth as a parallel production phone-OTP path for this app. That would introduce a second auth stack, extra identity-linking work, and additional third-party auth billing without reducing the current migration risk.

Option C is a separate project for after launch, not a launch blocker.

---

## 4. Current Auth Flow (Supabase — Production Frontend)

```
LoginPage.tsx
  → SMS/WhatsApp OTP: supabase.auth.signInWithOtp({ phone, channel })
  → Email OTP:        supabase.auth.signInWithOtp({ email })
  → Google OAuth:     supabase.auth.signInWithOAuth({ provider: 'google' })
      ↓
OTPPage.tsx
  → supabase.auth.verifyOtp({ phone/email, token, type })
      ↓
AuthCallbackPage.tsx (Google only)
  → supabase.auth.exchangeCodeForSession(code)
  → supabase.auth.setSession({ access_token, refresh_token })
      ↓
authStore.ts (Zustand + persist)
  → supabase.auth.getSession()
  → supabase.auth.onAuthStateChange()
  → syncUserProfile() → upsert to public.users table
```

All session tokens, refresh, and expiry are managed by `@supabase/supabase-js`. The frontend **never** directly handles JWT creation or secret management.

---

## 5. Decision Record

| Decision | Made By | Date | Rationale |
|----------|---------|------|-----------|
| Use Supabase Auth for production | Original architecture | Pre-2026 | Proven, secure, zero maintenance for auth |
| Telegram channels are NOT a database | GLM-005 | 2026-03-31 | No ACID, no queries, no reliability guarantees (see §1) |
| Custom OTP in apps/web is NOT production-ready | GLM-005 | 2026-03-31 | In-memory store, separate user model, not wired to frontend (see §2) |
| Twilio config in Supabase is the fastest path to phone OTP | GLM-005 | 2026-03-31 | 5-minute setup, zero code changes (see §3, Option A) |
| Email OTP + Google OAuth is a viable launch alternative | GLM-005 | 2026-03-31 | Already working, ₹0 additional cost (see §3, Option B) |
| If phone OTP is added later, keep it on Supabase Phone + Twilio only | GPT-020 | 2026-04-16 | Avoids splitting production auth across Supabase and Firebase while preserving the current session/RLS model |
| Full custom OTP migration is a post-launch project | GLM-005 | 2026-03-31 | 2–3 weeks effort, high risk, not blocking launch (see §3, Option C) |

---

*Created by GLM-005 (Manager) | 2026-03-31 | TruckOpti Auth Architecture Review*
