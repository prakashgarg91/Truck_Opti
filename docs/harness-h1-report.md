# Harness H1: Supabase surface inventory for the agency journey

Read-only inventory of `frontend/src` (non-test files) against supabase-js / auth-js / postgrest-js / functions-js **2.90.0** (`frontend/node_modules/@supabase/*`). No code was changed. Line numbers are from `grep`/`sed` reads on the current tree. Entries marked "(approx.)" are function-level ranges, not exact lines.

Abbreviations: `S` = `frontend/src/`. `AS` = `S/services/`. `SP` = `S/pages/`.

---

## 1. Auth

### 1.1 Client creation and boot

| Item | Location |
|---|---|
| `createClient(resolution.clientUrl, resolution.clientKey)` | `S/lib/supabase.ts:23` |
| Config resolution fed from `import.meta.env` | `S/lib/supabase.ts:14-17` |
| Reachability probe wrapper (`GET ${url}/auth/v1/health`, 8 s) | `S/lib/supabase.ts:36-41`, `S/lib/authCapabilities.ts:166-183` |
| `initialize()` called once on app mount | `S/App.tsx:98-103` |
| Auth store with `persist` (partialize keeps `user`, `session`, `authMode`, `pendingPhone`) | `S/stores/authStore.ts` (partialize block near end of file) |

### 1.2 Every `supabase.auth.*` call (non-test)

| Call | File:line | Used by / flow |
|---|---|---|
| `auth.getSession()` | `S/stores/authStore.ts:213` | Boot (`initialize`) |
| `auth.onAuthStateChange(cb)` | `S/stores/authStore.ts:248` (wrapped at `S/services/supabaseApi.ts:1009-1011`) | Boot; handles `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT` |
| `auth.signOut()` | `S/stores/authStore.ts:341`; `S/services/supabaseApi.ts:993`; `S/layouts/AgencyLayout.tsx:91`; `S/layouts/DriverLayout.tsx:20` | Logout |
| `auth.getUser()` | `S/services/agencySupabaseApi.ts:195`; `S/services/driverKycApi.ts:196`; `S/services/subscriptionApi.ts:333,345,427,501`; `S/services/supabaseApi.ts:1071,1130,1140,1153,1175,1187,1231,1260,1305,1335,1382`; `S/pages/ProfilePage.tsx:171` | Agency: `agencySupabaseApi.ts:195` (only on the legacy createJob path), `subscriptionApi.ts:333,345,427,501` (`usageApi`, `subscriptionHelpers`), reads user id for `has_active_subscription`/`check_usage_limit` |
| `auth.signInWithPassword({email,password})` | `S/services/supabaseApi.ts:833` (via `signInWithEmailPassword` 825-850) | **Agency login (password)**: `S/pages/auth/LoginPage.tsx:262` |
| `auth.signInWithOtp(...)` (email) | `S/services/supabaseApi.ts:786-800`, `:807` (sign-up OTP) | Login OTP, not agency password journey: `LoginPage.tsx:229` |
| `auth.signInWithOtp(...)` (phone) | `S/services/supabaseApi.ts:752-760` | `LoginPage.tsx:238` |
| `auth.verifyOtp(...)` | `S/services/supabaseApi.ts:924`, `:943` | `S/pages/auth/OTPPage.tsx:82-86` |
| `auth.signUp({email,password,...})` | `S/services/supabaseApi.ts:855` | Email/password sign-up (not called on agency journey; `TestPaymentPage.tsx:102` is test-only) |
| `auth.resetPasswordForEmail(email, {redirectTo})` | `S/services/supabaseApi.ts:886` | `S/pages/auth/ForgotPasswordPage.tsx:27` |
| `auth.updateUser({password})` | `S/services/supabaseApi.ts:906` | Reset flow |
| `auth.updateUser({data|email|...})` | `S/pages/ProfilePage.tsx:57,70,109,131,174`; `S/pages/CompanyProfilePage.tsx:92` | Profile pages (not on agency journey) |
| `auth.signInWithOAuth` (Google) | `S/services/supabaseApi.ts:974-988` | `S/components/GoogleSignInButton.tsx:41` (not on journey) |
| `auth.setSession({access_token, refresh_token})` | `S/pages/auth/AuthCallbackPage.tsx:43`; `S/pages/auth/ResetPasswordPage.tsx:33` | Callback / reset |
| `auth.exchangeCodeForSession(code)` | `S/pages/auth/AuthCallbackPage.tsx:58` | PKCE callback (`?code=`) |
| `auth.getSession()` (5x retry, 250 ms apart) | `S/pages/auth/AuthCallbackPage.tsx:69`; `S/pages/auth/ResetPasswordPage.tsx:43` | Post-login landing |
| Admin / `auth.admin.*` | none found in `S/` | n/a |

### 1.3 Endpoints and response shapes (auth-js 2.90.0)

Paths are built in `frontend/node_modules/@supabase/auth-js/src/GoTrueClient.ts` (all under base `${SUPABASE_URL}/auth/v1`):

| supabase-js call | HTTP | Path | Source |
|---|---|---|---|
| `signInWithPassword` | POST | `/auth/v1/token?grant_type=password` | GoTrueClient.ts:682, :693 |
| `signUp` | POST | `/auth/v1/signup` | :555, :609, :624 |
| `signInWithOtp` | POST | `/auth/v1/otp` | :1233, :1249 |
| `verifyOtp` | POST | `/auth/v1/verify` | :1286 |
| `resetPasswordForEmail` | POST | `/auth/v1/recover` | :2286 |
| `getUser` | GET | `/auth/v1/user` with `Authorization: Bearer <access_token>` | :1735, :1753 |
| `updateUser` | PUT | `/auth/v1/user` | :1817 |
| auto-refresh / `refreshSession` | POST | `/auth/v1/token?grant_type=refresh_token` | :2490 (via `_refreshAccessToken` :2474) |
| `exchangeCodeForSession` (PKCE) | POST | `/auth/v1/token?grant_type=pkce` | :1126 |
| `signInWithOAuth` | GET (redirect) | `/auth/v1/authorize` | :2538 |
| `signOut` (scope global) | POST | `/auth/v1/logout?scope=global` (Bearer) | GoTrueAdminApi.ts:105; invoked from GoTrueClient `_signOut` (~:2140-2175) |
| `getSession` | none unless refresh needed | reads `localStorage` key `sb-<first hostname label>-auth-token` (SupabaseClient.ts:127) | GoTrueClient `getSession` :1472 |
| health probe (app code) | GET | `/auth/v1/health` | `S/lib/authCapabilities.ts:177` |

`signOut` tolerates 401/403/404 from `/logout` and always removes the local session (`_signOut`, ~GoTrueClient:2171-2175).

**Session object** the shim must return (from auth-js types and `_saveSession`): `access_token`, `refresh_token`, `token_type` (`"bearer"`), `expires_in` (seconds), `expires_at` (unix seconds; set at GoTrueClient:3265 `Math.round(Date.now()/1000) + expires_in`), and `user` with `id`, `aud` (`"authenticated"`), `role` (`"authenticated"`), `email`, `phone`, `phone_confirmed_at`, `app_metadata` (e.g. `provider`), `user_metadata` (e.g. `full_name`, `avatar_url`, `company`), `identities` (optional; `syncUserProfile` checks `identities[].provider === 'google'`). Auth-js requires all of `access_token`, `expires_in`, `refresh_token`, `token_type` when parsing a URL fragment (GoTrueClient:2037-2042).

Refresh is triggered inside `_useSession` when `expires_at*1000 - now < EXPIRY_MARGIN_MS` (GoTrueClient:1653, :2616). **A shim that issues `expires_at` far in the future avoids refresh entirely;** if it does refresh, it must implement `grant_type=refresh_token`.

### 1.4 How the app decides role and what it reads right after login

`S/stores/authStore.ts`:

1. `initialize()` (`:200-250` approx.) calls `auth.getSession()` (`:213`).
2. If a session exists, `syncUserProfile(session)` runs (approx. `:116-160`):
   - `from('users').upsert({id,email,name,phone,phone_verified,google_linked,profile_picture}, {onConflict:'id'})` (`:153`) → `POST /rest/v1/users?on_conflict=id` with `Prefer: resolution=merge-duplicates`.
   - `from('users').select('login_id').eq('id',uid).maybeSingle()` (`:170`).
   - `resolveAppRole` (approx. `:87-108`) runs three selects in parallel:
     - `users` `select role, login_id` `eq id` `maybeSingle` (`:91-94`)
     - `transport_agencies` `select id` `eq user_id` `maybeSingle` (`:96-99`)
     - `drivers` `select id` `eq user_id` `maybeSingle` (`:101-104`)
   - Role precedence: `users.role === 'admin'` → `admin`; `transport_agencies.id` exists → `agency`; `drivers.id` exists or `users.role === 'driver'` → `driver`; else `user`.
3. `set({user, session, isAuthenticated: true, isLoading: false})`.
4. `onAuthStateChange` (`:248`) repeats `syncUserProfile` on `SIGNED_IN`/`TOKEN_REFRESHED`; `SIGNED_OUT` clears user (unless device-local mode).

Right after password login (`S/pages/auth/LoginPage.tsx:262-265`) the page navigates to `/auth/callback`; `AuthCallbackPage.tsx:69` calls `getSession()` up to 5 times, then waits up to 2 s (20 x 100 ms) for `isAuthenticated`, then navigates to `/` (`RoleHome` → `getDefaultHomePathForRole`, `S/components/ProtectedRoute.tsx`).

Agency route guard: `S/App.tsx:186-188` wraps `AgencyLayout` in `ProtectedRoute allowedRoles={['agency']}`; `ProtectedRoute.tsx` redirects to `/login` when `isAuthenticated` is false and renders `PermissionDeniedState` when role mismatches.

### 1.5 Boot behaviour when `getSession()` returns null

`authStore.ts:213-245`: error (if any) is logged; with `session === null` the store sets `isLoading:false, isAuthenticated:false` (or stays authenticated only if a persisted `authMode==='local'` user exists). `ProtectedRoute` then navigates to `/login`. `RoleHome` renders `LandingPage` for signed-out visitors (`App.tsx` `RoleHome`, approx. lines 80-95). A thrown error inside `initialize` also sets `isLoading:false, isAuthenticated:false` (`authStore.ts` catch block).

---

## 2. RPCs (`supabase.rpc` and `client.rpc`)

Notation: `[S]` = agency-journey page reachable; `[C]` = customer/driver/admin only (listed for completeness, shim may leave these unimplemented). Argument names are included where read.

### 2.1 Auth and subscription

| RPC | Call site | Pages | Notes |
|---|---|---|---|
| `resolve_login_identifier` `{p_identifier}` | `S/services/supabaseApi.ts:73` | `LoginPage.tsx:262` path, only when identifier has no `@` | Returns email string; `!data` → "Incorrect login ID" |
| `agency_subscription_entitlement` (no args) | `S/services/subscriptionApi.ts:210` | `useEntitlement.ts` (`S/components/billing/useEntitlement.ts`, query at ~L19-22), `SubscriptionPage`, `CheckoutPage:43`, `PricingPage` via `useSubscription` (`S/hooks/useSubscription.ts:107`), `BillingGate.tsx` (every agency page using `useBillingGate`: AgencyTeam, AgencyFleet, AgencyJobs, AgencyLoadPlan, AgencyOrderImport) | `parseEntitlement(data)`; the only read path for entitlement (TO-152). Required by almost every agency page |
| `agency_subscription_start_trial` | `S/services/subscriptionApi.ts:218` | `AgencyTrialPanel.tsx:37` (in `SubscriptionPage`) | Returns `{ok:false,error}` on refusal |
| `agency_subscription_invoices` | `S/services/subscriptionApi.ts:478` | `SubscriptionPage.tsx:100` via `gstInvoicesApi.list` | `forbidden_scope` → `[]` |
| `check_usage_limit` `{p_user_id,p_resource}` | `S/services/subscriptionApi.ts:337` | `usageApi.canUse` (`useSubscription.ts:189`) | Errors → `false` |
| `increment_usage` `{p_user_id,p_resource,p_amount}` | `S/services/subscriptionApi.ts:349` | `usageApi.increment` | Result ignored |
| `has_active_subscription` `{p_user_id}` | `S/services/subscriptionApi.ts:505` | `subscriptionHelpers.hasActiveSubscription` | Errors → `false` |

### 2.2 Invites and membership (AcceptInvitePage, AgencyTeamPage, DriverInvitationsPanel)

| RPC | Call site | Page |
|---|---|---|
| `agency_member_accept` `{p_token}` | `S/services/agencyInvitesApi.ts:133` (via `callAccept` :86-111) | `S/pages/AcceptInvitePage.tsx` (route `App.tsx:123`, ProtectedRoute) |
| `agency_driver_invitation_accept` `{p_token}` | `S/services/agencyInvitesApi.ts:141` | same |
| `agency_member_invite` | `S/services/agencyOrganizationApi.ts:284` | `S/pages/AgencyTeamPage.tsx` (imports `:12-13`) |
| `agency_member_invitation_revoke` | `S/services/agencyOrganizationApi.ts:298` | AgencyTeamPage |
| `agency_member_revoke` `{p_membership_id,p_expected_version}` | `S/services/agencyOrganizationApi.ts:307` | AgencyTeamPage |
| `agency_member_change_scope` `{p_membership_id,p_scope,p_expected_version}` | `S/services/agencyOrganizationApi.ts:316` | AgencyTeamPage |
| `agency_driver_invitation_create` | `S/services/agencyOrganizationApi.ts:478` | `S/components/DriverInvitationsPanel.tsx:7` (used on AgencyDriversPage) |
| `agency_driver_invitation_revoke` | `S/services/agencyOrganizationApi.ts:491` | DriverInvitationsPanel |

### 2.3 Clients, tariffs, orders, load plans

| RPC | Call site | Page |
|---|---|---|
| `agency_client_agreement_create` | `S/services/agencyOrganizationApi.ts:340` | `S/pages/AgencyClientsPage.tsx` (import `:14`) |
| `agency_client_agreement_update` | `:354` | AgencyClientsPage |
| `agency_client_site_create` | `:372` | AgencyClientsPage |
| `agency_client_site_update` | `:390` | AgencyClientsPage |
| `agency_client_contact_create` | `:406` | AgencyClientsPage |
| `agency_client_contact_update` | `:422` | AgencyClientsPage |
| `agency_tariff_version_publish` | `:453` | `S/pages/AgencyTariffsPage.tsx` (import `:14`) |
| `agency_order_import` | `S/services/agencyOrdersApi.ts:214` | `S/pages/AgencyOrderImportPage.tsx` (import `:16`) |
| `agency_order_cancel` | `S/services/agencyOrdersApi.ts:253` | AgencyOrderImportPage |
| `agency_load_plan_save` | `S/services/agencyLoadPlansApi.ts:415` | `S/pages/AgencyLoadPlanPage.tsx` (import `:19`) |
| `agency_load_plan_approve` | `:447` | AgencyLoadPlanPage |
| `agency_load_plan_cancel` | `:457` | AgencyLoadPlanPage |
| `agency_vehicle_create` `{...}` | `S/services/agencyPortalApi.ts:560` | `S/pages/AgencyFleetPage.tsx` (import `:10`) |
| `agency_vehicle_update` `{...}` | `S/services/agencyPortalApi.ts:585` | AgencyFleetPage |

### 2.4 Jobs, drivers, payouts

| RPC | Call site | Page |
|---|---|---|
| `agency_job_set_status` `{p_job_id,p_status}` | `S/services/agencyPortalApi.ts:443` (via `runPortalCommand` :295-341, rpc at :305) | `S/pages/AgencyJobsPage.tsx:249,263,277` |
| `agency_job_assign_driver` `{p_job_id,p_driver_id}` | `S/services/agencyPortalApi.ts:452` | AgencyJobsPage:230 |
| `agency_truck_assign_driver` `{p_truck_id,p_driver_id,p_expected_version}` | `S/services/agencyPortalApi.ts:827` | `S/pages/AgencyDriversPage.tsx:143` |
| `agency_truck_unassign_driver` `{p_truck_id,p_expected_version}` | `S/services/agencyPortalApi.ts:838` | AgencyDriversPage:156 |
| `agency_driver_payout_request` `{p_driver_id,p_amount,p_note,p_idempotency_key}` | `S/services/agencyPortalApi.ts:856` | AgencyDriversPage:182 |
| `agency_driver_employment_end` `{p_employment_id,p_expected_version}` | `S/services/agencyPortalApi.ts:922` | AgencyDriversPage:107 |
| `agency_driver_directory` `{}` | `S/services/agencyPayrollApi.ts:248` | `S/pages/AgencyPayrollPage.tsx` |
| `agency_driver_rate_set` | `S/services/agencyPayrollApi.ts:279` | AgencyPayrollPage |
| `agency_payroll_open_period` | `:305` | AgencyPayrollPage |
| `agency_payroll_close_period` | `:315` | AgencyPayrollPage |
| `agency_payroll_adjust` | `:325` | AgencyPayrollPage |

### 2.5 Consignments, ERP, expenses, invoices, tracking

| RPC | Call site | Page |
|---|---|---|
| `agency_consignment_create` | `S/services/agencyConsignmentsApi.ts:175` | `S/pages/AgencyConsignmentsPage.tsx` (import `:11`) |
| `agency_consignment_event` | `:198` | AgencyConsignmentsPage |
| `agency_consignment_qr` `{p_consignment_id}` | `:223` | AgencyConsignmentsPage |
| `agency_erp_connection_create` | `S/services/agencyErpApi.ts:205` | `S/pages/AgencyErpPage.tsx` (import `:14`) |
| `agency_erp_connection_set_status` | `:229` | AgencyErpPage |
| `agency_erp_connection_rotate_secret` | `:246` | AgencyErpPage |
| `agency_expense_record` | `S/services/agencyExpensesApi.ts:263` | `S/pages/AgencyExpensesPage.tsx` (import `:17`) |
| `agency_fuel_fill_record` | `:294` | AgencyExpensesPage |
| `agency_maintenance_item_upsert` | `:326` | AgencyExpensesPage |
| `agency_maintenance_service_done` | `:357` | AgencyExpensesPage |
| `agency_expense_summary` `{p_from,p_to}` | `:381` | AgencyExpensesPage |
| `agency_invoice_issue` | `S/services/agencyInvoicesApi.ts:287` | `S/pages/AgencyInvoicesPage.tsx` (import `:15`) |
| `agency_invoice_record_payment` | `:327` | AgencyInvoicesPage |
| `agency_invoice_cancel` | `:359` | AgencyInvoicesPage |
| `agency_trip_live` `{p_job_id}` | `S/services/agencyTrackingApi.ts:235` | `S/pages/AgencyTrackingPage.tsx` (import `:16`) |
| `agency_incident_open` | `:278` | AgencyTrackingPage |
| `agency_incident_update` | `:297` | AgencyTrackingPage |

### 2.6 Dashboard and other (not on the listed pages, noted for completeness)

- `S/services/customerSupabaseApi.ts:336` `authorize_agency_for_shipment`, `:422` `get_shipment_job_offer_tracking`, `:809` `respond_to_job_offer` `[C]`
- `S/services/supabaseApi.ts:613` `ensure_shipment_document_numbers` `[C]`
- `S/services/driverTripProgress.ts:84` `persist_driver_job_offer_progress` `[C]`
- `S/pages/NewShipmentPage.tsx:104` `dispatch_job_to_drivers` `[C]`

### 2.7 Envelope handling

Most agency RPC helpers accept either a bare object or `data[0]` (e.g. `agencyExpensesApi.ts:155-168` `callRpc`, `agencyPortalApi.ts` `runPortalCommand`, `subscriptionApi.ts:219-225` expects `{ok, error}`). Error text is read from `error.message` and matched against controlled exception strings (e.g. `agencyExpensesApi.ts:155-168`, `agencyPortalApi.ts:305-318`). A shim RPC error should use PostgREST shape `{code, message, details, hint}` with `message` equal to the exception name.

---

## 3. Table access (`supabase.from`)

### 3.1 PostgREST mapping that supabase-js produces (postgrest-js 2.90.0)

- `select(cols)` → `GET /rest/v1/<table>?select=<cols>` (`PostgrestQueryBuilder.ts`).
- `eq/neq/in/is/gte/lte/gt/lt/or/ilike/not` → `col=op.value` (`in.(a,b)`, `is.null`, `or=(...)`).
- `order(col,{ascending})` → `order=col.asc|desc`.
- `limit(n)` → `limit=n`.
- `count:'exact', head:true` → **HTTP HEAD** on `/rest/v1/<table>` with `Prefer: count=exact`; the count comes back in `Content-Range` (`PostgrestQueryBuilder.ts:103`, `:121`; `PostgrestBuilder.ts:151`).
- `count:'exact'` without head → `Prefer: count=exact`, count in `Content-Range`.
- `single()` → `Accept: application/vnd.pgrst.object+json` (`PostgrestTransformBuilder.ts:215`). 0 or >1 rows → PostgREST 406 with code `PGRST116`.
- `maybeSingle()` → same Accept (`PostgrestTransformBuilder.ts:233`); 0 rows → 200 `null` body (app relies on this).
- `insert(obj)` (no `.select`) → `POST` with `Prefer: return=minimal` (`PostgrestBuilder.ts:138`), 201 empty body.
- `insert(...).select(cols).single()` → `POST` with `Prefer: return=representation` (`PostgrestTransformBuilder.ts:59`), single object expected.
- `update(obj).eq(...).select(...).single()` → `PATCH`.
- `upsert(obj,{onConflict})` → `POST` with `Prefer: resolution=merge-duplicates` and `on_conflict=` query (`PostgrestQueryBuilder.ts:379-381`).
- `delete()` → `DELETE` (not used on agency pages).
- Embedded relations `select('a, b(c)')` → `select=a,b(c)` PostgREST resource embedding.

### 3.2 Every `from()` on the agency journey

| Page / component | Table | Call (file:line) | Operators and shape |
|---|---|---|---|
| AgencyLayout (every agency page, after mount) | `transport_agencies` | `S/layouts/AgencyLayout.tsx:60-64` | `select('id').eq('user_id',uid).maybeSingle()` |
| AgencyLayout | realtime `agency_jobs` INSERT | `AgencyLayout.tsx:67-79` | see §5 |
| authStore boot / login | `users` | `S/stores/authStore.ts:91-94, 153, 170` | `select('role, login_id').eq('id').maybeSingle()`; `upsert({...}, {onConflict:'id', ignoreDuplicates:false})`; `select('login_id').eq('id').maybeSingle()` |
| authStore boot / login | `transport_agencies` | `authStore.ts:96-99` | `select('id').eq('user_id').maybeSingle()` |
| authStore boot / login | `drivers` | `authStore.ts:101-104` | `select('id').eq('user_id').maybeSingle()` |
| Subscription trial panel / owner check | `transport_agencies` | `S/services/subscriptionApi.ts:235-238` | `select('id').eq('user_id').maybeSingle()` (`agencyOwnerApi.isOwner`) |
| Pricing, Checkout, billing | `subscription_plans` | `S/services/subscriptionApi.ts:146-150` | `select('*').eq('is_active',true).order('price_monthly',{ascending:true})` (PricingPage:44) |
| Plan by tier (fallback) | `subscription_plans` | `subscriptionApi.ts:161-165` | `select('*').eq('tier',t).single()`; error → fallback plan (**shim must return 406 to trigger fallback, or 200 row**) |
| Plan by id | `subscription_plans` | `subscriptionApi.ts:176-180` | `select('*').eq('id',id).single()`, error → fallback |
| AgencyDashboardPage (legacy service, `getAgencyProfile`) | `transport_agencies` | `S/services/agencySupabaseApi.ts:86-89` | `select(cols).eq('user_id').maybeSingle()`; not called by dashboard page (dashboard uses portal fn) |
| `getJobSummary` (legacy) | `agency_jobs` | `agencySupabaseApi.ts:104-111` | **HEAD count with `.eq`, `.in`, `.gte` (lines 104-108); plus `select('fare').eq.eq.gte` (110-111)** — see §4 flagged |
| AgencyJobsPage (`listAuthorizations`) | `shipment_agency_consents` | `agencySupabaseApi.ts:173-177` | `select('shipment_id, granted_via, created_at').is('revoked_at',null).order('created_at',{ascending:false})` |
| AgencyJobsPage (`createJob`) | `transport_agencies` | `agencySupabaseApi.ts:202-206` | `select('id').eq('user_id').maybeSingle()` |
| AgencyJobsPage (`createJob`) | `agency_jobs` | `agencySupabaseApi.ts:215-224` | `insert({agency_id,shipment_id,fare,status:'pending'}).select('id, agency_id, shipment_id, fare, status').single()`; 23505 → already-exists |
| (legacy, not on pages) | `agency_jobs` | `agencySupabaseApi.ts:237-241` | `select('...shipments(origin, destination, shipment_id)')` **embedded** `.eq.order` |
| (legacy, not on pages) | `agency_jobs` | `agencySupabaseApi.ts:257-259` | `select(...embedded shipments)` `.eq('id').single()` |
| (legacy, not on pages) | `agency_jobs` | `agencySupabaseApi.ts:271-276` | `update({status}).eq('id').select(embedded).single()` |
| AgencyFleetPage (`listVehicles`) | `agency_trucks` | `S/services/agencyPortalApi.ts:543-545` | `select('*')` (RLS only) |
| AgencyFleetPage / AgencyDriversPage (`readTruckVersion`) | `agency_trucks` | `agencyPortalApi.ts:355-358` | `select('version').eq('id').maybeSingle()` |
| AgencyDriversPage (`listEmployments`) | `agency_driver_employment` | `agencyPortalApi.ts:906-908` | `select('*')` |
| AgencyRegisterPage (`register`) | `transport_agencies` | `agencyPortalApi.ts:970-972` | `insert(payload)` (no select, return=minimal) |
| AgencyRegisterPage (`agencyRegistrationApi`) | — | `S/pages/AgencyRegisterPage.tsx:115` | calls the insert above |
| Pages that read via `readRows`/`readOrdered`/`read` helpers (see §3.3) | many | see §3.3 | `select(columnsCSV)` + optional `eq`/`gte`/`lte`/`in`/`is`, then `order`, optional `limit` |

Other `from()` calls outside the agency journey (not inventoried in depth): `supabaseApi.ts:269-741` (trucks, cartons, customers, drivers, shipments, routes, packing), `customerSupabaseApi.ts:101-851` (shipments, job_offers, drivers, driver_payouts, trucks), `supabaseApi.ts:1134-1191` (notifications), `supabaseApi.ts:1225-1264` (analytics_events), `supabaseApi.ts:1309-1386` (sale_orders), `contactInquiry.ts:124` (contact_inquiries insert), `driverKycApi.ts`, `DriverRegisterPage.tsx:85-91`.

### 3.3 Read helpers used by agency service modules (column CSVs and filters)

Each service has a private read helper. The column lists below are the exact `select(...)` arguments. Filters are applied in the chains shown.

**agencyOrganizationApi.ts** — `readRows` (`:250-265`) always appends `.order('created_at', {ascending:false})` after the optional filter.
- `agency_memberships` (`listMembers`, `:279`): cols `id,agency_id,user_id,scope,status,granted_at,revoked_at,invitation_id,version,created_at`
- `agency_invitations` (`listInvitations`, `:280`): cols `id,invited_email,scope,status,expires_at,created_at,revoked_at,accepted_at,version`
- `agency_client_agreements` (`listAgreements`, `:325`): cols `id,client_name,client_gstin,payment_terms_days,status,version,created_at,updated_at`
- `agency_client_sites` (`listSites`, `:328-330`): cols `id,agreement_id,site_kind,label,address_line,city,state,pincode,status,version,created_at` + `.eq('agreement_id', id)`
- `agency_client_contacts` (`listContacts`, `:333-335`): cols `id,agreement_id,site_id,full_name,phone,email,status,version,created_at` + `.eq('agreement_id')`
- `agency_tariff_versions` (`listTariffs`, `:432-434`): cols `id,agreement_id,origin_label,destination_label,vehicle_type,rate_basis,rate_amount,currency,effective_from,effective_to,version_no,supersedes_version_id,created_at` + `.eq('agreement_id')`
- `agency_driver_invitations` (`:474`): cols `id,invited_phone,status,expires_at,created_at,revoked_at,accepted_at,employment_id,version`

**agencyOrdersApi.ts** — `readOrdered` (`:159-171`) appends `.order('created_at', {ascending:false})`.
- `agency_client_agreements` (`:186`, cols `id,client_name,status,created_at`)
- `agency_client_sites` (`:190`, `SITE_COLUMNS`)
- `agency_order_batches` (`:201`, `.eq('agreement_id')`)
- `agency_orders` (`:204`, `.eq('agreement_id')`)

**agencyLoadPlansApi.ts** — `read` (`:324-332`), builder default `(q)=>q`.
- `agency_orders` (`:358`): cols `id,client_order_ref,status,version,created_at`; `.eq('status','draft').order('created_at',{ascending:false})`
- `agency_order_lines` (`:364`): cols `id,order_id,line_no,sku,description,quantity,unit,weight_per_unit_kg,pickup_site_id,drop_site_id,pickup_to,stackable,fragile`; **`.in('order_id', orderIds).order('line_no',{ascending:true})`** (flagged `in`)
- `agency_trucks` (`:376`): cols `id,vehicle_type,rc_number,payload_kg,is_available,maintenance_blocked`; `.order('created_at',{ascending:false})`
- `agency_load_plans` (`:383`): cols `id,name,status,plan_version,version,approved_at,created_at`; `.order('created_at',{ascending:false})`
- `agency_load_plan_loads` (`:389`), `agency_load_plan_lines` (`:392`), `agency_load_plan_unmet` (`:395`): `.eq('plan_id', planId)` (no order)

**agencyTrackingApi.ts** — `read` (`:175-189`), Chain type declares `eq`, `in`, `order`, `limit`.
- `agency_jobs` (`listActiveJobs`, `:208-210`): cols `id,status,driver_id,notes,created_at`; **`.in('status',['pending','accepted','in_transit']).order('created_at',{ascending:false}).limit(50)`** (flagged `in`, `limit`)
- `agency_tracking_pings` (`listPings`, `:215-218`): cols `id,job_id,recorded_at,lat,lng,speed_kmph`; **`.eq('job_id').order('recorded_at',{ascending:false}).limit(100)`** (flagged `limit`)
- `agency_incidents` (`listIncidents`, `:225-228`): cols `id,job_id,kind,status,details,version,resolution_note,created_at,updated_at`; **`.eq('job_id').order('created_at',{ascending:false}).limit(200)`** (flagged `limit`)

**agencyExpensesApi.ts** — `readOrdered` (`:204-216`).
- `agency_trucks` (`:226`): cols `id,rc_number,vehicle_type`; `.order('rc_number',{ascending:true})`
- `agency_expenses` (`:230`): `inRange('expense_date' or similar column)` = **`.gte(column,from).lte(column,to)`** (flagged `gte`/`lte`; `inRange` at `:220`)
- `agency_fuel_fills` (`:239`), `agency_maintenance_items` (`:247`): same helper pattern (`readOrdered` with `gte`/`lte` filter; exact column names in the chain at those lines)

**agencyInvoicesApi.ts** — `readOrdered` (`:240-256`), `eq` helper at `:256-258`.
- `agency_client_agreements` (`:267`): cols `id,client_name,status,created_at`; order `created_at` desc
- `agency_invoices` (`:270`): cols `id,client_id,invoice_number,status,supplier_state_code,place_of_supply_state_code,gst_rate_pct,reverse_charge,subtotal_paise,cgst_paise,sgst_paise,igst_paise,round_off_paise,total_paise,paid_paise,version,cancelled_reason,created_at`
- `agency_invoice_lines` (`:275`): cols `id,invoice_id,line_no,description,quantity,rate_paise,amount_paise`; `.eq('invoice_id')`, order `line_no` asc
- `agency_invoice_payments` (`:278`): `.eq('invoice_id')`, order `created_at` desc

**agencyPayrollApi.ts** — `readOrdered` (`:193-208`), `eq` helper `:210-211`.
- `agency_driver_rates` (`:238`): cols `driver_id,base_paise,per_km_paise,per_tonne_paise,version,updated_at`; order `updated_at` desc
- `agency_driver_employment` (`:241`): cols `driver_id,status,contact_phone,created_at`; order `created_at` **asc**
- `agency_payroll_periods` (`:264`): cols `id,period_start,period_end,status,closed_at,version,created_at`; order `period_start` desc
- `agency_payroll_lines` (`:268`): cols `id,period_id,driver_id,base_paise,trips_paise,advances_paise,deductions_paise,net_paise,shortfall_paise,carried_in_paise,trip_count`; `.eq('period_id')`, order `driver_id` asc
- `agency_payroll_adjustments` (`:273`): cols `id,period_id,driver_id,kind,amount_paise,reason,created_at`; `.eq('period_id')`, order `created_at` desc

**agencyConsignmentsApi.ts** — `readOrdered` (`:136-148`), order `created_at` desc, `eq` helper `:150-152`.
- `agency_orders` (`listOrders`, `:159`), `agency_consignments` (`:162`), `agency_consignment_events` (`:166`, `eq` filter on consignment id)

**agencyErpApi.ts** — `readOrdered` (`:141-158`) with optional `limit` (`:153`, applied only if a `limit` argument is passed by the caller).
- `agency_erp_connections` (`:171`, order `created_at` desc)
- `agency_client_agreements` (`:174`, order `created_at`)
- `agency_erp_events` (`:179` and `:189`, with `eq`/`limit` args from callers)

Note: `agencyErpApi` line 153 is the only place a `.limit()` call path exists in ERP; whether a caller passes `limit` must be checked before the shim decides on support (not checked in this pass).

**agencyPortalApi.ts** — no generic helper; direct chains listed in §3.2 (`:355`, `:543`, `:906`, `:970`).

---

## 4. Operators and shapes the shim would answer 501 (or must implement)

Operators beyond `eq/neq/in/is/gte/lte/order/limit/range/single/maybeSingle/count/head` are the risk list. In the agency journey the following appear:

**Flagged: operators outside the requested allow-list**
- None of `or`, `ilike`, `not`, `like`, `gt`, `lt`, `match`, `contains`, `filter`, `textSearch` appear in agency-journey files (`agency*Api.ts`, `subscriptionApi.ts`, `authStore.ts`, `AgencyLayout.tsx`). They do appear in customer/supabase paths: `S/services/supabaseApi.ts:444` (`.or(...ilike...)`), `S/services/supabaseApi.ts:319` (`.in('name')` — allowed), `S/services/customerSupabaseApi.ts:397` (`.not('driver_id','is',null)`), `:745` (`.gt('expires_at',...)`). These are out of the agency journey scope.

**Flagged: embedded relations (must be rejected or implemented)**
- `S/services/agencySupabaseApi.ts:238`, `:258`, `:274`: `select('... shipments(origin, destination, shipment_id)')`. These are on `getAll/getById/updateStatus`, which **the listed pages do not call** (AgencyJobsPage uses only `listAuthorizations` and `createJob` from this module, `AgencyJobsPage.tsx:119,140`). Verify before treating as unreachable.
- Other embeds in journey code: none found (`grep` for `select('...(...)')` over agency services returned only these three).
- Customer-path embed: `S/services/customerSupabaseApi.ts:445` `select('delivered_at, shipments(estimated_cost)')` (not agency).

**Flagged: count / head**
- `S/services/agencySupabaseApi.ts:104-108` `select('id', {count:'exact', head:true})` on `agency_jobs` with `eq`/`in`/`gte`. Used only by `agencyDashboardApi.getJobSummary` in the legacy module, not by `AgencyDashboardPage` (which uses `agencyPortalApi.agencyDashboardApi.getSnapshot`, `S/services/agencyPortalApi.ts:381-…`). Verify if anything imports `agencySupabaseApi.agencyDashboardApi`.
- Customer path `S/services/customerSupabaseApi.ts:101-131` (`count:'exact'`).

**Flagged: `in` and `is` and range operators used by agency pages**
- `in`: `S/services/agencyTrackingApi.ts:209` (`status`), `S/services/agencyLoadPlansApi.ts:365` (`order_id`), `S/services/agencySupabaseApi.ts:105` (`status`).
- `is`: `S/services/agencySupabaseApi.ts:175` (`.is('revoked_at', null)`).
- `gte`/`lte`: `S/services/agencyExpensesApi.ts:220` (expenses/fuel date range), `S/services/agencySupabaseApi.ts:107,111` (legacy).
- `limit`: `S/services/agencyTrackingApi.ts:209,218,228`; `S/services/agencyErpApi.ts:153` (conditional).

**Flagged: writes**
- `insert().select().single()` → `S/services/agencySupabaseApi.ts:215-224` (AgencyJobsPage createJob). Shim must return the inserted row with `Prefer: return=representation` and a 23505-equivalent on duplicate `(agency_id, shipment_id)`.
- `update().eq().select().single()` → `agencySupabaseApi.ts:271-276` (legacy).
- `upsert(..., {onConflict:'id'})` → `S/stores/authStore.ts:153`. **Runs on every sign-in.** Must be implemented (POST with `on_conflict`, `Prefer: resolution=merge-duplicates`).
- `insert(payload)` (no select) → `S/services/agencyPortalApi.ts:970-972` (agency registration).

**Shape requirements the shim must match**
- `single()`: 0 rows → 406 `PGRST116`. Used by `subscription_plans` with fallback (`subscriptionApi.ts:161-180`).
- `maybeSingle()`: 0 rows → 200 `null`. Used throughout auth/role resolution (`authStore.ts:91-104`).
- HEAD + `Content-Range` needed only for count (see §4 above).

---

## 5. Realtime

| Use | File:line | Channel and events | Behaviour if shim returns error |
|---|---|---|---|
| Agency new-job bell | `S/layouts/AgencyLayout.tsx:53-88` (channel at 67-79, removeChannel 85) | `supabase.channel('agency-new-jobs').on('postgres_changes', {event:'INSERT', schema:'public', table:'agency_jobs', filter:'agency_id=eq.<id>'}).subscribe()` | Runs only when `isSupabaseConfigured` and user id exists. A REST failure on `transport_agencies` (`:60-64`) returns early. Subscribe errors are not awaited; the page keeps working, the bell does not update |
| Driver job offers | `S/pages/DriverDashboardPage.tsx:285-317` | `job_offers_<driverId>` | Driver only |
| Customer tracking | `S/pages/TrackingPage.tsx:198-220` | `shipments-tracking` | Customer only |
| Notifications | `S/services/supabaseApi.ts:1199-1208` (used by `S/layouts/MobileLayout.tsx`) | `notifications:<userId>` | Not agency |
| Shipments/trucks | `S/services/supabaseApi.ts:1400-1413` | `shipments`, `trucks` | Not agency |

Realtime-js connects to a websocket derived from `${VITE_SUPABASE_URL}/realtime/v1` (path not re-read in this pass; default in realtime-js). The shim may ignore websocket upgrades: the agency journey tolerates it, as the only effect is a missing toast-less bell update.

---

## 6. Storage and direct host URLs

| Use | File:line | Bucket / path | Agency journey? |
|---|---|---|---|
| `storage.from('driver-docs').upload` / `getPublicUrl` | `S/pages/DriverRegisterPage.tsx:84-91`; `S/services/driverKycApi.ts:203` | `driver-docs` | No (driver) |
| `storage.from('trip-photos').upload` | `S/pages/DriverTripPage.tsx:395-396` | `trip-photos` | No (driver) |
| Raw signed URL string `${supabaseUrl}/storage/v1/object/sign/trip-photos/<path>` | `S/pages/DriverTripPage.tsx:406`; comment `S/services/tripPhotoUrl.ts:7`; `tripPhotoUrl.ts:33` (`storage.from(...).createSignedUrl`) | `trip-photos` | No (driver/tracking) |
| `storage.from('avatars').upload/getPublicUrl` | `S/pages/ProfilePage.tsx:105-107` | `avatars` | No (profile, not agency-only) |

No `fetch()` to the Supabase host other than the auth health probe (`S/lib/authCapabilities.ts:177`) and the raw storage URL at `DriverTripPage.tsx:406`.

### 6.1 Edge Functions (`supabase.functions.invoke`)

The shim answers 501 for all functions. Impact per agency page:

| Function | Call (file:line) | Method | Used by | What the page shows on 501 |
|---|---|---|---|---|
| `agency-portal-dashboard` | `S/services/agencyPortalApi.ts:384-387` (`getSnapshot`) | POST `{action:'snapshot'}` | `S/pages/AgencyDashboardPage.tsx:92` (via `agencyDashboardApi.getSnapshot`), `S/pages/AgencyProfilePage.tsx:76` | `toast.error('Failed to load dashboard summary')` (`AgencyDashboardPage.tsx:97`); summary stays zero; profile shows no snapshot |
| `agency-portal-jobs` (GET) | `agencyPortalApi.ts:421-424` (`agencyJobsApi.list`) | GET | `S/pages/AgencyJobsPage.tsx:160` | `toast.error('Failed to load jobs')` (`AgencyJobsPage.tsx:185`); empty job list |
| `agency-portal-jobs` (POST `assignable-drivers`) | `agencyPortalApi.ts:461-465` | POST | `AgencyJobsPage.tsx:196` | `toast.error('Failed to load drivers')` (`AgencyJobsPage.tsx:213`); assign dialog empty |
| `agency-portal-jobs` (POST `latest-driver-location`) | `agencyPortalApi.ts:486-490` | POST | `AgencyJobsPage.tsx:295,308` | tracking map shows no location |
| `agency-portal-fleet` (GET) | `agencyPortalApi.ts:514-516` (`agencyFleetApi.list`) | GET | No page call found (`AgencyFleetPage` uses `listVehicles`, table read) | Not reached |
| `agency-portal-billing` | `agencyPortalApi.ts:645-647` (`agencyBillingApi.list`) | GET | `S/pages/AgencyBillingPage.tsx:59` | `toast.error('Failed to load billing data')` (`AgencyBillingPage.tsx:64`); empty summary |
| `agency-portal-rates` (GET) | `agencyPortalApi.ts:673-676` (`list`) | GET | `S/pages/AgencyRatesPage.tsx:60` | `toast.error('Failed to load rate cards')` (`AgencyRatesPage.tsx:64`) |
| `agency-portal-rates` (POST) | `agencyPortalApi.ts:705-708` (`addRate`) | POST | `AgencyRatesPage.tsx:83` | add-rate error |
| `agency-portal-rates` (update) | `agencyPortalApi.ts:728-731` (`updateRate`) | PATCH/POST (verify) | `AgencyRatesPage.tsx:108` | toggle fails |
| `agency-portal-rates` (delete) | `agencyPortalApi.ts:749-752` (`deleteRate`) | DELETE/POST (verify) | `AgencyRatesPage.tsx:120` | delete fails |
| `agency-portal-drivers` | `agencyPortalApi.ts:797-800` (`getSnapshot`) | POST | `S/pages/AgencyDriversPage.tsx:72` | `setLoadError(true)` (`AgencyDriversPage.tsx:86`) and `toast.error('Failed to load drivers')` (`:92`); error state shown |

Other agency-adjacent functions (customer, checkout and billing paths):
- `create-razorpay-order`: `S/services/subscriptionApi.ts:395-397` (`checkoutApi.createOrder`), `S/services/razorpayPayment.ts:100`. Breaks `CheckoutPage` (`CheckoutPage.tsx:117`): shows "Unable to start payment right now".
- `verify-razorpay-payment`: `subscriptionApi.ts:416` (`verifyPayment`, swallowed in try/catch), `razorpayPayment.ts:193`. Breaks activation refetch only indirectly (`CheckoutPage.tsx:145,153`).
- `invoice-view`: `S/services/subscriptionApi.ts:462-464` (`invoicesApi.getSignedUrl`); returns `null` on error.
- `phonepe-checkout`, `phonepe-status`, `verify-payment`: `S/services/phonepePayment.ts:125,176,215` (not agency).
- `erp-ingest`: documented only in `S/pages/AgencyErpPage.tsx:664` as a display string (`POST SUPABASE_URL/functions/v1/erp-ingest`); no client call.
- `adminSupabaseApi.ts:189` (generic `invoke`), `driverKycApi.ts:130` (KYC) — admin/driver.

---

## 7. Environment and config

### 7.1 Variables read at build/dev time (`import.meta.env`)

| Variable | Read at | Effect |
|---|---|---|
| `VITE_SUPABASE_URL` | `S/lib/supabase.ts:15`, `S/vite-env.d.ts:6` | Backend URL. Must be valid https (see §7.2) |
| `VITE_SUPABASE_ANON_KEY` | `S/lib/supabase.ts:16`, `vite-env.d.ts:7` | Anon key. Placeholder → local-first |
| `VITE_AUTH_PASSWORD_ENABLED` | `S/lib/authSurfaceMethods.ts:20`; `S/lib/authCapabilities.ts` (`resolveAuthMethodCapabilities`, officePassword `flagOn` `=== 'true'`) | Office password capability only when exactly `'true'`. **If the LoginPage gates the password form on this, the agency login needs it set; LoginPage gating was not verified in this pass.** |
| `VITE_AUTH_EMAIL_OTP_ENABLED` | `authSurfaceMethods.ts:18` | OTP capability |
| `VITE_AUTH_PHONE_OTP_ENABLED` | `authSurfaceMethods.ts:19` | OTP capability |
| `VITE_APP_URL` | `S/main.tsx:30` | Canonical app URL (not verified where used) |
| `VITE_RAZORPAY_KEY_ID` | `S/services/razorpayPayment.ts:17-18` | Checkout key; missing → "Razorpay is not configured" |
| `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION` | `razorpayPayment.ts:19` | Test-mode gate |
| `VITE_SYNC_URL` | `S/lib/syncClient.ts:4` | Unrelated to Supabase; dormant when unset |
| `VITE_GOOGLE_CLIENT_ID` | `S/lib/googleAuth.ts:9` | Google device tooling |
| `VITE_GOOGLE_MAPS_API_KEY` | `S/components/MapViewWrapper.tsx:36` and others | Maps |
| `VITE_SENTRY_DSN` | `S/utils/monitoring.ts:447` | Sentry |
| `VITE_PHONEPE_MERCHANT_ID`, `VITE_PHONEPE_API_URL` | `S/services/phonepePayment.ts:17,20` | PhonePe |
| `VITE_TEST_EMAIL`, `VITE_TEST_PASSWORD` | `S/pages/TestPaymentPage.tsx:88-89` | Test page only |

Env files present in `frontend/`: `.env`, `.env.local`, `.env.example`. Names only were read; values were not printed. `.env` and `.env.local` define `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Because Vite inlines `import.meta.env` at start/build, the shim URL must be set before `vite` starts; a `.env.local` override is the normal route.

### 7.2 URL validation (`resolveSupabaseConfig`)

`S/lib/authCapabilities.ts`:
- `resolveSupabaseConfig` (~L110-156): empty URL → `local_first` (`missing`); placeholder (`isPlaceholderValue`, which matches `replace_me`, `your_`, `placeholder`, or empty) → `local_first`; `!isValidHttpsBackendUrl(url)` → `local_first` (`invalid`); empty key → `local_first`; placeholder key → `local_first`. In local-first mode `clientUrl = https://localhost.invalid` and `clientKey = local-mode-no-key` (constants ~L41-42), and `isConfigured=false`. **In local-first mode the app makes no requests to the shim.**
- `isValidHttpsBackendUrl` (~L73-88): `new URL(value)` must parse; `protocol` must be `https:`; hostname must be non-empty and must not be `localhost`, end in `.localhost`, or end in `.local`. `.invalid` is accepted on purpose (comment in source).
- Consequences for the shim:
  - `http://localhost:…` → rejected (`http:` and `localhost`).
  - `http://127.0.0.1:…` → rejected (`http:`).
  - `https://localhost:…` → rejected (`localhost`).
  - `https://127.0.0.1:<port>` → accepted (needs a certificate the browser trusts, or ignore-HTTPS-errors in the test browser).
  - `https://<name>.test:<port>` (or any non-reserved name mapped via hosts file) → accepted; `.test` is not in the reject list.
- Existing test confirms `http://` is rejected: `S/lib/supabase.test.ts:50-51`.

### 7.3 What happens at boot

1. `supabase.ts` resolves config (`supabase.ts:14-23`). Local-first → placeholder client; no auth calls.
2. Cloud mode → `createClient(url, key)`. `App.tsx:98-103` → `initialize()` → `getSession()` (`authStore.ts:213`). No network unless a stored session needs refresh.
3. `getSession()` null → no session branch (§1.5); agency routes redirect to `/login`.
4. `isSupabaseReachable()` is called from `LoginPage.tsx:161` (sets `backendDown` if the probe fails) and `GoogleSignInButton.tsx:36`. The probe is `GET <url>/auth/v1/health` with an 8 s timeout (`authCapabilities.ts:166-183`). A shim that returns 404 here shows "backend down" on the login page.

---

## 8. Page-by-page table: page → auth / data calls → shim feature needed

Legend: **auth** = auth-js endpoints; **rest** = PostgREST table or RPC; **fn** = edge function (501 on shim); **rt** = realtime; features are the shim capability required for the page's happy path.

| Page / component | Auth calls | REST (table / RPC) | Functions | Realtime / storage | Shim features needed |
|---|---|---|---|---|---|
| Boot (`App.tsx`, `authStore.ts`) | `getSession`, `onAuthStateChange` | `users` upsert+select; `transport_agencies` select; `drivers` select | — | — | auth: session from localStorage (no request); REST: `upsert` on_conflict, `maybeSingle` |
| `LoginPage.tsx` | `signInWithPassword` (`:262`) via `supabaseApi.ts:833`; OTP (`:229,238`) | `resolve_login_identifier` (only for non-`@` identifiers, `supabaseApi.ts:73`) | — | health probe (`:161`) | `POST /auth/v1/token?grant_type=password`; `/auth/v1/health`; rpc `resolve_login_identifier` if login ID used |
| `AuthCallbackPage.tsx` | `setSession`, `exchangeCodeForSession`, `getSession` (`:43,58,69`) | — | — | — | `POST /token?grant_type=pkce` if `?code=`; in-memory session |
| `AgencyLayout.tsx` (all agency pages) | `signOut` (`:91`) | `transport_agencies` `maybeSingle` (`:60-64`) | — | realtime `agency_jobs` (`:67-79`) | `POST /auth/v1/logout`; REST `maybeSingle`; WS optional |
| `AgencyDashboardPage.tsx` | — | `agencyDashboardApi.getSnapshot` | `agency-portal-dashboard` (`agencyPortalApi.ts:384`) | — | **fn 501 → error toast** (`:97`); no other data |
| `AgencyProfilePage.tsx` | — | — | `agency-portal-dashboard` (`:76`) | — | fn (same) |
| `AgencyFleetPage.tsx` | — | `agency_trucks select *` (`agencyPortalApi.ts:543`); rpc `agency_vehicle_create` (`:560`), `agency_vehicle_update` (`:585`); plan gate (`useBillingGate`, rpc entitlement `:210`) | — | — | REST select *; RPC x2; entitlement RPC |
| `AgencyDriversPage.tsx` | — | `agency_driver_employment select *` (`:906`); rpc `agency_driver_employment_end` (`:922`), `agency_truck_assign_driver` (`:827`), `agency_truck_unassign_driver` (`:838`), `agency_driver_payout_request` (`:856`); `agency_trucks` version read (`:355`) | `agency-portal-drivers` (`:797`) | — | **fn 501 → `loadError` state** (`:86`); REST select *, maybeSingle; RPC x4 |
| `DriverInvitationsPanel` (on drivers page) | — | `agency_driver_invitations` read (`agencyOrganizationApi.ts:474`), rpc create `:478`, revoke `:491` | — | — | REST readRows (order), RPC x2 |
| `AgencyJobsPage.tsx` | — | `shipment_agency_consents` select `is(revoked_at,null)` `order` (`agencySupabaseApi.ts:173-177`); `transport_agencies` `maybeSingle` (`:202`); `agency_jobs` insert+select+single (`:215-224`); rpc `agency_job_set_status` (`:443`), `agency_job_assign_driver` (`:452`) | `agency-portal-jobs` GET (`agencyPortalApi.ts:421`), POST assignable-drivers (`:461`), POST latest-driver-location (`:486`) | — | **fn 501 → "Failed to load jobs" (`:185`), "Failed to load drivers" (`:213`)**; REST `in`/`is` ops for list, insert+select+single |
| `AgencyBillingPage.tsx` | — | — | `agency-portal-billing` (`:645`) | — | **fn 501 → `toast` "Failed to load billing data" (`:64`)** |
| `AgencyRatesPage.tsx` | — | — | `agency-portal-rates` GET/POST/update/delete (`:673,705,728,749`) | — | **fn 501 → "Failed to load rate cards" (`:64`)**; add/update/delete fail |
| `AgencyTeamPage.tsx` | — | `agency_memberships` read (`agencyOrganizationApi.ts:279`); `agency_invitations` read (`:280`); rpc `agency_member_invite` (`:284`), `agency_member_invitation_revoke` (`:298`), `agency_member_revoke` (`:307`), `agency_member_change_scope` (`:316`); `buildInviteLink` (no call) | — | — | REST readRows; RPC x4; entitlement gate |
| `AgencyClientsPage.tsx` | — | `agency_client_agreements` (`:325`), `agency_client_sites` eq (`:328`), `agency_client_contacts` eq (`:333`); rpc create/update x3 pairs (`:340,354,372,390,406,422`) | — | — | REST readRows+eq; RPC x6 |
| `AgencyTariffsPage.tsx` (`/agency/clients/:agreementId/tariffs`) | — | `agency_tariff_versions` eq (`:432`); rpc `agency_tariff_version_publish` (`:453`) | — | — | REST readRows+eq; RPC |
| `AcceptInvitePage.tsx` (`/invite/:token`, ProtectedRoute) | — | rpc `agency_member_accept` (`agencyInvitesApi.ts:133`), `agency_driver_invitation_accept` (`:141`) | — | — | RPC x2 (with `invitation_invalid` envelope) |
| `AgencyOrderImportPage.tsx` | — | `agency_client_agreements` (`agencyOrdersApi.ts:186`), `agency_client_sites` (`:190`), `agency_order_batches` eq (`:201`), `agency_orders` eq (`:204`); rpc `agency_order_import` (`:214`), `agency_order_cancel` (`:253`) | — | — | REST readOrdered+eq; RPC x2; entitlement gate |
| `AgencyLoadPlanPage.tsx` | — | `agency_orders` eq status (`agencyLoadPlansApi.ts:358`); `agency_order_lines` **in** (`:364`); `agency_trucks` (`:376`); `agency_load_plans` (`:383`); `agency_load_plan_loads/lines/unmet` eq (`:389-395`); rpc `agency_load_plan_save` (`:415`), `_approve` (`:447`), `_cancel` (`:457`) | — | — | **REST `in` (flagged)**; RPC x3; entitlement gate |
| `AgencyConsignmentsPage.tsx` | — | `agency_orders` (`agencyConsignmentsApi.ts:159`); `agency_consignments` (`:162`); `agency_consignment_events` eq (`:166`); rpc `agency_consignment_create` (`:175`), `agency_consignment_event` (`:198`), `agency_consignment_qr` (`:223`) | — | — | REST readOrdered; RPC x3 |
| `AgencyInvoicesPage.tsx` | — | `agency_client_agreements` (`agencyInvoicesApi.ts:267`); `agency_invoices` (`:270`); `agency_invoice_lines` eq (`:275`); `agency_invoice_payments` eq (`:278`); rpc issue (`:287`), record payment (`:327`), cancel (`:359`) | — | — | REST readOrdered+eq; RPC x3 |
| `AgencyExpensesPage.tsx` | — | `agency_trucks` (`agencyExpensesApi.ts:226`); `agency_expenses` **gte+lte** (`:230`, `:220`); `agency_fuel_fills` (`:239`); `agency_maintenance_items` (`:247`); rpc `agency_expense_record` (`:263`), `agency_fuel_fill_record` (`:294`), `agency_maintenance_item_upsert` (`:326`), `agency_maintenance_service_done` (`:357`), `agency_expense_summary` (`:381`) | — | — | **REST gte/lte (flagged)**; RPC x5 |
| `AgencyPayrollPage.tsx` | — | `agency_driver_rates` (`agencyPayrollApi.ts:238`); `agency_driver_employment` (`:241`); `agency_payroll_periods` (`:264`); `agency_payroll_lines` eq (`:268`); `agency_payroll_adjustments` eq (`:273`); rpc `agency_driver_directory` (`:248`), `agency_driver_rate_set` (`:279`), `agency_payroll_open_period` (`:305`), `agency_payroll_close_period` (`:315`), `agency_payroll_adjust` (`:325`) | — | — | REST readOrdered+eq; RPC x5 |
| `AgencyErpPage.tsx` | — | `agency_erp_connections` (`agencyErpApi.ts:171`); `agency_client_agreements` (`:174`); `agency_erp_events` (`:179,189`); rpc `agency_erp_connection_create` (`:205`), `_set_status` (`:229`), `_rotate_secret` (`:246`) | — | — | REST readOrdered; RPC x3 |
| `AgencyTrackingPage.tsx` | — | `agency_jobs` **in + order + limit 50** (`agencyTrackingApi.ts:208-210`); `agency_tracking_pings` eq+order+**limit 100** (`:215-218`); `agency_incidents` eq+order+**limit 200** (`:225-228`); rpc `agency_trip_live` (`:235`), `agency_incident_open` (`:278`), `agency_incident_update` (`:297`) | — | — | **REST `in` and `limit` (flagged)**; RPC x3 |
| `SubscriptionPage.tsx` | — | rpc `agency_subscription_entitlement` (`subscriptionApi.ts:210`, via `useEntitlement`); rpc `agency_subscription_invoices` (`:478`); `AgencyTrialPanel` → `transport_agencies` (`:235`), rpc `agency_subscription_start_trial` (`:218`) | `invoice-view` (`:462`) on download | — | RPC x3; REST maybeSingle; `invoice-view` 501 → null URL |
| `PricingPage.tsx` | — | `subscription_plans` select `*` eq `is_active` order `price_monthly` (`subscriptionApi.ts:146-150`); `useSubscription` → entitlement rpc (`:210`) and plan `single()` (`:161,176`) | — | — | REST order+eq; `single()` 406 fallback |
| `CheckoutPage.tsx` (`/checkout`, ProtectedRoute) | — | entitlement rpc (`CheckoutPage.tsx:43`) | `create-razorpay-order` (`subscriptionApi.ts:395`), `verify-razorpay-payment` (`:416`) | Razorpay SDK loaded externally (not in shim) | **fn 501 → "Unable to start payment right now"** (`:117` path) |
| `BillingGate.tsx` / `useEntitlement.ts` (used by every gated agency page) | — | rpc `agency_subscription_entitlement` (`subscriptionApi.ts:210`) | — | — | Entitlement RPC is required for gated pages to render their gated state |

---

## 9. Summary of shim-critical findings

1. **Use an https URL.** `http://` and `localhost` hostnames make `resolveSupabaseConfig` fall back to local-first with no requests (`authCapabilities.ts`, `supabase.test.ts:50-51`). Options: `https://127.0.0.1:<port>` with ignore-HTTPS-errors in the browser, or a non-reserved hostname (for example a `.test` name) mapped by hosts file.
2. **Auth must answer:** `POST /auth/v1/token?grant_type=password` (`GoTrueClient.ts:682`), `GET /auth/v1/user` (`:1735`), `POST /auth/v1/logout` (`GoTrueAdminApi.ts:105`), `GET /auth/v1/health` (`authCapabilities.ts:177`), and `refresh_token` grant (`:2490`) if sessions expire. Session fields per §1.3.
3. **REST must answer:** `users` upsert (`authStore.ts:153`), `users`/`transport_agencies`/`drivers` `maybeSingle` (`authStore.ts:91-104`), and `transport_agencies` `maybeSingle` (`AgencyLayout.tsx:60-64`) on every agency page load. `resolveAppRole` returns `agency` only if `transport_agencies` row exists for the user.
4. **RPC envelopes** are the bulk of the work: about 60 RPC names across agency pages (§2). Most return `{ok, state|error, ...}`.
5. **Flagged for 501:** embedded `shipments(...)` (`agencySupabaseApi.ts:238,258,274`, not called by pages); `in` (`agencyTrackingApi.ts:209`, `agencyLoadPlansApi.ts:365`, `agencySupabaseApi.ts:105`); `is` (`agencySupabaseApi.ts:175`); `gte/lte` (`agencyExpensesApi.ts:220`); `limit` (`agencyTrackingApi.ts:209,218,228`); HEAD count (`agencySupabaseApi.ts:104-108`, not called by pages).
6. **Edge functions:** `agency-portal-dashboard`, `agency-portal-jobs`, `agency-portal-billing`, `agency-portal-rates`, `agency-portal-drivers` are on the agency pages (§6.1). On 501 each page shows its own error toast or error state; none crashes. `agency-portal-fleet` has no page caller.
7. **Realtime:** `agency-new-jobs` (`AgencyLayout.tsx:67-79`) is non-blocking.
8. **Storage:** not on the agency journey.

Not verified in this pass: the `LoginPage` gating on `VITE_AUTH_PASSWORD_ENABLED`; exact method verbs for `agency-portal-rates` update/delete (`agencyPortalApi.ts:728, 749`); exact column name in `agencyExpensesApi.ts:230` `inRange`; whether `agencyErpApi` callers pass `limit`; realtime-js websocket path; whether `agencySupabaseApi.agencyDashboardApi` has any importer besides `supabaseApi.ts`.
