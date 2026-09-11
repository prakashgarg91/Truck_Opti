# MISSION — Production Readiness (received 2026-09-11, execute next session)

> Owner-pasted mission brief, saved verbatim below. Context: incident 2026-09-11 restored
> the public site (Heroku v5, commit 3d330d2e). This mission takes the local-first deployment
> to full production readiness. See also: 0.dev-matrix/AI-HANDOFF.md (2026-09-11 entry),
> closeout-logs/incident-2026-09-11/. Do not modify DNS records unless evidence proves they are wrong.

---

You are the lead engineer and production-readiness owner for TruckOpti.

Your mission is to turn the currently reachable local-first deployment into a secure, fully functional production application with working authentication, database-backed workflows, role portals, payments, monitoring, and verifiable end-to-end tests.

Do not interpret “complete” as merely making pages return HTTP 200. The application is complete only when its supported workflows work with real production services, authorization is enforced server-side, all acceptance gates pass, and unfinished features are either completed or removed from production UI.

PROJECT

Repository:
D:\Github\Truck_Opti

Production:
https://www.truckopti.in

Canonical hostname:
www.truckopti.in

Stack:
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- React Router v6
- Supabase Auth, PostgreSQL, Storage, Realtime, and Edge Functions
- Heroku
- Cloudflare
- Razorpay/PhonePe payment-related code
- Google Maps with Leaflet/OpenStreetMap fallback
- Sentry integration

Live application directory:
frontend/

Legacy Flask application:
apps/web/

Do not modify the legacy Flask application unless an active production workflow demonstrably depends on it.

CURRENT VERIFIED STATE

Infrastructure recovery is complete:

- https://www.truckopti.in returns HTTP 200.
- https://truckopti.in redirects once to the canonical www hostname.
- Cloudflare points to the current Heroku targets.
- Cloudflare SSL/TLS is Full (strict).
- Heroku ACM certificates are issued.
- Heroku has one running Eco web dyno.
- Current deployment is Heroku v5 from commit 3d330d2e.
- Public production smoke passed 12/12.
- Server routing tests passed 8/8.
- Frontend unit tests passed 329/329.
- Packing regression passed 18/18.

Current custom-domain targets:

- truckopti.in:
  introductory-qantassaurus-k64s4nhylrwjjc5m2pxd94bs.herokudns.com
- www.truckopti.in:
  silhouetted-radish-pu52ykkmld576qwc5w4p5gs3.herokudns.com
- Heroku default:
  truck-opti-app-0de4b9bc1ac2.herokuapp.com

Do not modify these DNS records unless evidence proves they are wrong.

APPLICATION BLOCKERS

The live application currently operates in its Supabase-optional local-first fallback.

Heroku configuration status:

- VITE_APP_URL: SET
- VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION: SET and false
- VITE_SUPABASE_URL: MISSING
- VITE_SUPABASE_ANON_KEY: MISSING
- VITE_AUTH_PASSWORD_ENABLED: MISSING
- VITE_AUTH_PHONE_OTP_ENABLED: MISSING
- VITE_GOOGLE_CLIENT_ID: MISSING
- VITE_RAZORPAY_KEY_ID: MISSING
- RAZORPAY_KEY_SECRET: MISSING
- RAZORPAY_WEBHOOK_SECRET: MISSING
- VITE_PHONEPE_MERCHANT_ID: MISSING
- VITE_PHONEPE_API_URL: MISSING
- VITE_GOOGLE_MAPS_API_KEY: MISSING
- VITE_SENTRY_DSN: MISSING

The old Supabase hostname:

jbxncejtcbpcronndqlx.supabase.co

is DNS NXDOMAIN. Do not reuse it until the project has been restored and the hostname resolves.

The production Office Login currently shows contradictory/degraded states:

- Password login is hidden.
- Email OTP is disabled.
- Phone OTP is disabled.
- Google login says “needs setup.”
- An OTP email field and “Send Email OTP” button can still appear even though OTP is disabled.
- Offline device setup is the only usable entry.
- Authenticated dashboards and payments have not been verified.

CRITICAL AUTHENTICATION ARCHITECTURE GAP

The current `GoogleSignInButton` uses Google Identity Services, decodes the Google ID token in the browser, and calls `loginLocal`. The source explicitly says this identity is trusted only for device-local data and never for money.

This implementation must not authorize:

- Administrators
- Reviewers
- Agency shared data
- Driver assignments
- Subscription changes
- Payments
- Payouts
- Server-backed operations

The repository already contains a Supabase OAuth path through:

`authSupabaseApi.signInWithGoogle()`

Production Google login should use Supabase Auth or another server-verified identity flow. Client-side JWT decoding alone is not acceptable production authentication.

OPERATING RULES

1. Read before editing:

   - AGENTS.md
   - 0.dev-matrix/AI-HANDOFF.md
   - 0.dev-matrix/STATE.md
   - 0.dev-matrix/SECURITY.md
   - .github/instructions/repo-guide.instructions.md
   - PATTERNS.md
   - DEPENDENCIES.md
   - RULES.md

2. Run `0.dev-matrix/resume-work.ps1` early.

3. Preserve all existing uncommitted files. Never use:

   - git reset --hard
   - git clean
   - destructive checkout/revert commands
   - broad deletion commands

4. Never print or commit secrets. Report configuration values only as:

   - SET
   - MISSING
   - PLACEHOLDER
   - INVALID

5. Never expose these to the frontend:

   - Supabase service-role or secret key
   - Razorpay secret
   - Razorpay webhook secret
   - Google OAuth client secret
   - SMTP credentials
   - Sentry auth token
   - Database password

6. VITE_* variables are public and embedded during the frontend build. After changing a VITE_* variable, create a fresh Heroku build and deployment.

7. Supabase database deployment is owner-controlled. Prepare and verify migrations, but do not run `supabase db push` without the owner performing or explicitly authorizing that step.

8. Do not make a real payment, purchase a service, rotate credentials, or change a paid plan without explicit owner approval.

9. Use test-driven development for every code fix:

   - Reproduce with a failing test.
   - Make the smallest focused correction.
   - Run the focused test.
   - Run the relevant regression suite.

10. Never weaken a test or audit merely to make it pass. Correct stale expectations when product requirements changed, but preserve equivalent or stronger coverage.

11. Use current official Supabase documentation and inspect the Supabase changelog before implementation. Confirm whether the installed Supabase packages still support Node 20. If Node 22 is now required, plan and test a coordinated Node/Heroku runtime upgrade rather than ignoring the mismatch.

12. Keep the user informed with short progress updates. If blocked by a dashboard login or secret, provide the exact owner action and continue all independent work.

PHASE 1 — BUILD A VERIFIED COMPLETION INVENTORY

Before changing code, create a concise inventory covering:

- Public routes
- Customer workflows
- Driver workflows
- Agency workflows
- Admin/backoffice workflows
- Authentication methods
- Authorization boundaries
- Database tables and migrations
- Storage buckets and policies
- Edge Functions
- Realtime subscriptions
- Payment providers
- Maps/tracking
- Notifications
- PWA/offline behavior
- Monitoring
- Tests and deployment gates

Classify each item as:

- WORKING AND VERIFIED
- IMPLEMENTED BUT UNVERIFIED
- DEGRADED/FALLBACK
- STALE TEST OR CONFIGURATION
- MISSING
- OWNER-BLOCKED
- OUT OF SCOPE

Do not label anything working based only on code presence.

Start by running:

- `git status --short`
- `git branch --show-current`
- `git log -10 --oneline`
- `npm ci`
- `cd frontend; npm ci`
- `cd frontend; npm run build`
- `cd frontend; npm run test:unit`
- `cd frontend; npm run test:packing`
- `cd frontend; npm run lint`
- `npm run test:server-routing`
- `npm run test:public-smoke`
- `npm run test:frontend-smoke`
- `npm run test:prod-config`
- `npm run launch-check`

Record exact counts, exit codes, warnings, and failures.

Expected initial failures include:

- Frontend smoke expecting an Email OTP control when OTP is intentionally disabled
- Production config audit incorrectly treating disabled email OTP as an unconditional failure
- Missing Supabase, Google, payment, and Sentry configuration
- Dependency advisories
- Working-tree hygiene caused by pre-existing user files

Separate real product failures from test drift and workspace hygiene.

PHASE 2 — RECOVER OR REPLACE SUPABASE

First determine whether project ref `jbxncejtcbpcronndqlx` can be restored.

In the Supabase dashboard, inspect:

- Project status
- Billing status
- Pause/restoration options
- Database availability
- Backups
- Auth users
- Tables and row counts
- Storage buckets
- Edge Functions
- Project URL and public client key
- Auth providers
- Redirect URLs
- SMTP configuration
- Function secrets
- Logs and advisors

Preferred path:

A. Restore the existing project if its data is intact and the endpoint becomes healthy.

Fallback path:

B. Create a replacement project if the original cannot be safely restored.

Do not switch projects merely because it is faster. Preserve existing production data when recoverable.

If creating a replacement project:

1. Create a staging/recovery project first.
2. Inventory all files in:

   - supabase/schema.sql
   - supabase/migrations/
   - supabase/functions/

3. Confirm migration ordering and eliminate conflicts.
4. Apply migrations to staging using the documented human-controlled workflow.
5. Verify every expected table, function, trigger, index, enum, and constraint.
6. Seed only documented reference data.
7. Migrate production data from a verified backup when available.
8. Create required Storage buckets.
9. Deploy required Edge Functions.
10. Configure Edge Function secrets server-side.
11. Run database and security advisors.
12. Compare the resulting schema with the repository.
13. Only then prepare production cutover.

For every table in an exposed schema:

- RLS must be enabled.
- Policies must use real ownership or tenant predicates.
- Never use `USING (true)` on user-owned data.
- `TO authenticated` alone is not authorization.
- UPDATE policies require `USING` and `WITH CHECK`.
- Authorization must not use user-editable `user_metadata`.
- Views should use `security_invoker` where supported.
- Privileged functions must not be exposed casually.
- Storage policies must cover INSERT, SELECT, and UPDATE when upsert is used.
- Validate Data API exposure and explicit grants.

Test cross-tenant attacks:

- Customer A cannot read Customer B.
- Agency A cannot read Agency B.
- Driver A cannot update Driver B.
- Non-admin users cannot access admin data.
- Unapproved agencies cannot dispatch jobs.
- Unapproved drivers cannot claim or complete trips.
- Anonymous users cannot read private operational data.

Before setting Heroku variables, prove:

- Supabase DNS resolves.
- `/auth/v1/health` responds.
- The publishable/anon key belongs to that project.
- The service-role key is stored only server-side.
- The schema matches the deployed frontend and Edge Functions.

PHASE 3 — DEFINE AND IMPLEMENT THE PRODUCTION AUTH MATRIX

Adopt this production authentication policy unless the owner explicitly chooses another documented policy:

Public customers:

- Google through Supabase Auth
- Email OTP or password as a tested fallback
- Phone/WhatsApp OTP hidden until Twilio/Supabase Phone is fully configured

Office/admin/demo/reviewer:

- Password login enabled
- Unique seeded credentials
- Optional Supabase Google login for approved identities
- No public self-assignment of privileged roles
- Password reset operational
- MFA recommended for administrators

Drivers:

- Verified Supabase identity
- Driver record linked to `auth.uid()`
- Approval required before operational access

Agencies:

- Verified Supabase identity
- Agency record linked to `auth.uid()`
- Approval required before fleet/dispatch access

Offline/local mode:

- Clearly labelled “Local device workspace”
- May access only device-local data
- Must not grant admin, driver, reviewer, or shared-agency authority
- Must not call privileged APIs
- Must not activate subscriptions or payments
- Must visibly communicate that data is not synced
- Must have reliable export/backup and logout/reset behavior

Required code work:

1. Rewire production Google login to Supabase Auth:

   - Use `supabase.auth.signInWithOAuth({ provider: 'google' })`.
   - Use `/auth/callback`.
   - Validate return-to paths against a local allowlist.
   - Create a verified Supabase session.
   - Resolve roles from protected server/database state.

2. Do not use browser-decoded Google claims for privileged authorization.

3. If local Google linking remains useful, move it behind clearly separate local-workspace language. It must not look like production cloud login.

4. Fix `LoginPage` conditional rendering:

   - Do not show an email input or “Send Email OTP” when email OTP is disabled.
   - Do not show SMS/WhatsApp when phone auth is disabled.
   - Do not show an interactive-looking Google button when Google is not configured.
   - When no online method is configured, show one honest maintenance/setup message and the local-workspace option.
   - On office mode, default to Password when password login is enabled.
   - Never expose environment-variable names such as `VITE_AUTH_PASSWORD_ENABLED` to ordinary production users.

5. Verify local-session persistence. `authStore` currently attempts to resume local mode, but persisted state must include enough information to distinguish local and Supabase sessions safely.

6. On application initialization:

   - A cached browser session may support UI restoration.
   - Sensitive server operations must validate the user with Supabase Auth.
   - Edge Functions must validate JWTs with `getUser()` or equivalent verified claims.
   - Do not trust `getSession()` alone on a server.

7. Prevent privilege escalation:

   - Signup must create an ordinary customer by default.
   - Users cannot edit their role.
   - Admin role assignment must require a privileged server-side operation.
   - Agency and driver status changes must require authorized admin workflows.
   - Do not derive authorization from editable metadata.

Required tests:

- Password sign-in success and failure
- Email/login-ID resolution
- Password reset
- Google OAuth callback
- Safe return-to handling
- Invalid/expired session behavior
- Logout while online and offline
- Role resolution
- Default user role
- Admin/driver/agency denial cases
- Local workspace isolation
- No privileged access from fabricated localStorage/Zustand state
- No privilege escalation through metadata
- Page behavior for every flag combination

PHASE 4 — CONFIGURE AUTH PROVIDERS

Supabase:

- Set Site URL to `https://www.truckopti.in`.
- Add exact production and approved localhost redirect URLs.
- Avoid broad wildcard redirects in production.
- Configure email confirmation and password-reset templates.
- Configure a reliable custom SMTP provider if email OTP/password reset is supported.
- Enable Google provider using its Web Client ID and Client Secret.
- Enable password auth if required by the approved matrix.
- Enable phone auth only after Twilio/Twilio Verify is functional.
- Set suitable OTP expiry and rate limits.
- Review leaked-password protection and CAPTCHA/bot protection where appropriate.

Google Cloud:

- Create or use a production Web OAuth client.
- Authorized JavaScript origin:
  `https://www.truckopti.in`
- Authorized redirect URI:
  use the exact Supabase Google callback shown in the Supabase dashboard.
- Configure consent-screen branding and support email.
- Never place the Google client secret in a VITE_* variable.

Heroku:

Set the valid public build-time values before rebuilding:

- VITE_APP_URL=https://www.truckopti.in
- VITE_SUPABASE_URL=<verified live project URL>
- VITE_SUPABASE_ANON_KEY=<verified public/publishable client key>
- VITE_AUTH_PASSWORD_ENABLED=true
- VITE_AUTH_EMAIL_OTP_ENABLED=<true only if email delivery is verified>
- VITE_AUTH_PHONE_OTP_ENABLED=<true only if phone delivery is verified>
- VITE_GOOGLE_CLIENT_ID=<production web client ID>
- VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION=false

Redeploy after setting them because Vite embeds these values during build.

Seed separate temporary accounts for:

- Customer
- Driver
- Agency
- Admin
- Reviewer/payment reviewer

Use unique strong passwords stored outside Git. Do not publish credentials in logs or reports. Rotate or disable temporary credentials after acceptance testing.

PHASE 5 — FIX THE AUDITS SO THEY EXPRESS THE REAL PRODUCT POLICY

Update `scripts/production_config_audit.mjs`.

The audit must validate the approved authentication matrix instead of assuming Email OTP is always required.

Suggested rules:

- Supabase URL exists, is HTTPS, resolves, and its health endpoint responds.
- Supabase client key exists and is not a placeholder.
- At least one secure public cloud login method is configured.
- Office password login is enabled if office/demo/reviewer access is required.
- If Google login is enabled, Google client configuration is present.
- If email OTP is enabled, SMTP/email delivery has separate operational proof.
- If phone OTP is enabled, phone-provider proof is required.
- `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION` must equal false.
- No secret key may appear in a VITE_* variable.
- The selected payment provider must be production-ready.
- Disabled payment providers must not be exposed in production UI.
- Sentry must be configured or explicitly accepted as an owner-blocked launch requirement.
- The production URL must be canonical HTTPS.
- Audit output must never reveal secret values.

Update `scripts/frontend_launch_smoke.mjs`.

The auth smoke must branch according to the deployed feature matrix:

- Test Email OTP only if enabled.
- Test password UI and login when enabled and credentials are supplied securely.
- Test Google button configuration without attempting an interactive OAuth flow in unattended CI.
- Test the offline/local workspace separately.
- Fail if production displays a contradictory or unusable login form.
- Remove the hardcoded dead Supabase URL.
- Read the live URL from sanitized environment/configuration.
- Test backend health without recording sensitive response bodies.

Add focused tests before modifying these scripts.

PHASE 6 — COMPLETE CORE PRODUCT WORKFLOWS

Use a verified account for every role and test these workflows against the restored staging backend before production.

Customer:

- Signup and login
- Profile and company data
- Customer records
- Truck/carton/product data
- 3D packing calculation
- Save and reopen packing job
- Route calculation
- Booking creation
- Shipment history
- Tracking
- Invoice generation
- Subscription status and usage limits
- Logout and session restoration

Driver:

- Driver registration
- Document upload
- Admin approval
- Assigned-trip visibility
- Trip status updates
- Pickup and delivery proof
- OTP/PIN completion if supported
- Earnings
- History
- Profile
- Denial of access to another driver’s trip

Agency:

- Agency registration
- Admin approval
- Fleet CRUD
- Driver assignment
- Jobs and dispatch
- Rates
- Billing
- Dashboard analytics
- Profile
- Denial of access to another agency’s records

Admin/backoffice:

- Verified privileged login
- Dashboard
- User management
- Driver approvals
- Agency approvals
- Contact inquiries
- Subscriptions
- Payouts
- Audit/history visibility
- Safe error states
- Denial of admin access for every non-admin role

For every workflow:

- Verify the UI.
- Verify the actual database change.
- Verify RLS behavior.
- Verify a refresh/re-login retains correct state.
- Verify failure handling.
- Check browser console and network failures.
- Confirm raw Supabase/database errors are not shown to users.

PHASE 7 — PAYMENTS

Choose one production payment provider as the supported launch path. Prefer Razorpay unless the owner explicitly selects PhonePe.

Do not expose two incomplete providers.

For Razorpay:

- VITE_RAZORPAY_KEY_ID may contain only the public live key ID.
- RAZORPAY_KEY_SECRET must be server-side only.
- RAZORPAY_WEBHOOK_SECRET must be server-side only.
- Create orders server-side.
- Calculate authoritative prices server-side.
- Verify payment signatures server-side.
- Verify webhook signatures using the raw request body.
- Reject missing or invalid signatures.
- Make webhook processing idempotent.
- Do not activate a subscription from client success alone.
- Store provider IDs, status transitions, and timestamps.
- Protect payment records with RLS.
- Handle duplicate, delayed, failed, and reordered webhook events.
- Provide a reconciliation path.
- Test in Razorpay test mode on staging.
- Require explicit owner approval for a small live payment.
- Verify the live webhook, subscription activation, invoice, and refund/reconciliation path.

If PhonePe is not the selected provider:

- Hide it from production UI.
- Mark its production config as optional/disabled.
- Do not allow sandbox URLs in a visible production checkout.

PHASE 8 — MAPS, STORAGE, NOTIFICATIONS, AND OBSERVABILITY

Maps:

- If Google Maps is configured, restrict the key to:
  `https://www.truckopti.in/*`
- Restrict it to required APIs.
- Verify billing and quota.
- If not configured, verify the Leaflet/OpenStreetMap fallback completely.
- The absence of Google Maps is not a launch gap if the fallback is deliberate and fully functional.

Storage:

- Verify all required buckets.
- Validate file type using server-side content inspection where applicable.
- Enforce file-size limits.
- Use private buckets or signed URLs for sensitive documents.
- Test ownership and tenant policies.
- Prevent path traversal and cross-user reads.
- Verify replace/upsert policies.

Notifications:

- Hide SMS/WhatsApp claims until providers work.
- Verify email delivery, retry behavior, and user-friendly failures.
- Do not silently report success if a provider call failed.

Sentry:

- Configure a production DSN.
- Never send secrets, passwords, OTPs, tokens, payment data, or document contents.
- Upload source maps securely if supported.
- Trigger and confirm one controlled test event.
- Add release/environment metadata.
- Verify frontend and server errors can be correlated.

Logging:

- Use contextual structured logs.
- Never log access tokens or secret values.
- Keep public error messages generic and bilingual where required.
- Confirm Heroku logs contain no recurring application errors during E2E.

PHASE 9 — SECURITY REVIEW

Before production approval:

- Run the repository’s 15-item security checklist.
- Scan auth, RLS, Edge Functions, Storage, payments, redirects, uploads, and environment handling.
- Search for hardcoded secrets.
- Search for unsafe `USING (true)` policies.
- Search for client-side role assignment.
- Search for unverified payment-webhook processing.
- Search for raw error messages exposed to users.
- Search for open redirects.
- Search for service-role usage in frontend code.
- Check all Edge Functions for authenticated user verification.
- Check agency and admin functions for tenant/role authorization.
- Review npm and Python dependency advisories.
- Require zero unresolved critical/high vulnerabilities.
- Resolve the React Router advisories without suppressing or weakening the audit.
- Document any accepted moderate/low risk with owner sign-off and compensating controls.

PHASE 10 — TEST AND RELEASE GATES

Local gates:

- Root `npm ci`
- Frontend `npm ci`
- Frontend build with zero TypeScript errors
- Unit tests pass
- Packing regression passes
- Lint passes within the repository policy
- Server routing tests pass
- Relevant legacy Python auth test passes if affected
- Dependency audits satisfy the security policy

Staging gates:

- All supported auth methods work
- Role matrix passes
- Cross-tenant tests pass
- Storage tests pass
- Edge Functions pass
- Core customer/driver/agency/admin journeys pass
- Payment test-mode journey passes
- No unexpected console errors
- No uncaught exceptions
- No raw internal errors shown to users

Production gates:

- Public smoke passes
- Frontend smoke passes with zero stale expectations
- Production config audit passes
- Server routing passes
- Launch-check reaches its full target, currently 18/18
- Authenticated customer smoke passes
- Authenticated driver smoke passes
- Authenticated agency smoke passes
- Authenticated admin smoke passes
- Payment configuration is verified
- One controlled real payment is completed only with owner approval
- Webhook and subscription activation are verified
- Sentry receives a controlled event
- Cloudflare, Heroku, Supabase, and browser logs show no unexplained errors

Run production checks twice:

1. Fresh browser context with no cache/session.
2. Returning browser context with an existing session and service worker.

Test mobile and desktop viewports.

PHASE 11 — UX COMPLETENESS

Audit every production route for:

- Placeholder text
- “Coming soon”
- “Needs setup”
- Dead buttons
- Disabled controls without explanation
- Broken links
- Empty loading states
- Infinite spinners
- Missing error recovery
- Raw environment-variable names
- Development-only copy
- Test credentials
- Incorrect role labels
- Accessibility issues
- Mobile overflow
- Missing Hindi/English text where the product promises bilingual support

Apply this rule:

Every visible production control must be functional, or it must be removed/hidden. A disabled integration may remain visible only when the product intentionally communicates its availability and the disabled state helps the user.

Specific LoginPage acceptance criteria:

- No environment-variable names shown to users.
- No OTP form when all OTP methods are disabled.
- Office mode provides a working approved login method.
- Google button is functional through verified Supabase Auth or absent.
- Offline mode is clearly separated from cloud login.
- The page never suggests an unavailable method.
- Terms and Privacy links work.
- Keyboard and screen-reader navigation work.
- Errors are friendly and do not reveal backend details.

PHASE 12 — DEPLOYMENT AND ROLLBACK

Before deployment:

- Review the exact diff.
- Confirm no unrelated user files are included.
- Confirm no secrets are staged.
- Record the previous Heroku release.
- Record the current Cloudflare and Heroku domain configuration.
- Confirm database backup/rollback posture.
- Run all local gates.

Deployment order:

1. Deploy and verify Supabase staging.
2. Verify staging E2E.
3. Prepare production migrations and obtain owner execution.
4. Configure production Supabase Auth/providers.
5. Configure server-side secrets.
6. Configure Heroku build-time values.
7. Deploy committed main to Heroku.
8. Confirm dyno health.
9. Run unauthenticated production smoke.
10. Run authenticated role smokes.
11. Run payment verification with owner approval.
12. Review logs and monitoring.
13. Run `npm run close-day`.
14. Update `0.dev-matrix/AI-HANDOFF.md`.

Do not change working DNS unless a verified routing failure requires it.

Rollback documentation must cover:

- Heroku release rollback
- Feature-flag rollback
- Supabase migration rollback or forward repair
- Payment-provider disable switch
- Auth-provider disable switch
- Safe restoration of the previous frontend release

FINAL DEFINITION OF DONE

You may report `FULLY OPERATIONAL` only when all of the following are true:

- Both production domains work with valid TLS.
- The canonical redirect works.
- Supabase is reachable.
- Database schema and migrations are verified.
- RLS and tenant isolation tests pass.
- At least one public cloud login method works.
- Office/password login works.
- Google login, if visible, creates a server-verified Supabase session.
- Password reset works.
- Customer workflows work.
- Driver workflows work.
- Agency workflows work.
- Admin workflows work.
- Local mode cannot obtain privileged authority.
- The selected payment provider works end-to-end.
- Webhooks are verified and idempotent.
- Maps or the deliberate fallback work.
- Storage and document access controls work.
- Monitoring works.
- No secret is exposed.
- No critical/high vulnerability remains.
- No visible production button is dead or misleading.
- Build, unit, packing, routing, public smoke, frontend smoke, production config, authenticated smoke, and launch-check gates pass.
- Browser and server logs contain no unexplained errors.
- Operational evidence is recorded.

If any condition remains incomplete, use:

`PUBLIC SITE OPERATIONAL — PRODUCT FEATURES PARTIALLY BLOCKED`

or:

`NOT PRODUCTION READY`

FINAL REPORT FORMAT

Return:

1. Executive status
2. Confirmed root causes and gaps
3. Architecture decisions
4. Files changed
5. Supabase project and schema status
6. Authentication matrix with proof
7. Role/tenant authorization matrix
8. Payment proof
9. Route/workflow verification matrix
10. Exact test counts and exit codes
11. Security scan results
12. Deployment release and commit
13. Monitoring/log evidence
14. Owner actions still required
15. Rollback instructions
16. Final status

Do not say “all tests pass,” “secure,” “fully working,” or “complete” without including the command output, exact counts, and operational proof supporting the statement.