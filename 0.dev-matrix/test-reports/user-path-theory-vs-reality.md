# User Path Theory Vs Reality Audit

Generated: 2026-05-01

## Scope

This report compares the current local route graph and routing code against the latest practical production probes.

- Theory surface:
  - `npm run graph:update` refreshed Graphify to `422 nodes`, `484 edges`, `74 communities`
  - code-review graph incremental refresh updated `450 nodes` and `3882 edges`
  - route source of truth: `frontend/src/App.tsx`
  - role-home source of truth: `frontend/src/components/ProtectedRoute.tsx`
- Reality surface:
  - `logs/frontend_launch_smoke_report.json` -> `50/50` checks passed against `https://www.truckopti.in`
  - `0.dev-matrix/test-reports/live-auth-proof.json` -> authenticated driver, agency, and customer proof passed
  - `0.dev-matrix/test-reports/live-admin-proof.json` -> authenticated admin proof passed

Important comparison rule:

- Graphify and CRG describe the current local workspace.
- The smoke and proof artifacts describe the currently deployed production app.
- Any difference between those two surfaces is release drift until the current local bundle is deployed.

## What Graphify Says Matters Most

The refreshed graph still concentrates user-risk around a small set of path-critical abstractions:

- Community 2: auth return-to and callback handling (`storeAuthReturnTo`, `consumeAuthReturnTo`, `handleGoogleLogin`)
- Community 4: contact form retry and fallback ownership (`normalizeInquiry`, `queuePendingContactInquiry`)
- Community 5: Razorpay checkout initiation (`initiateRazorpayPayment`)
- Community 7: PhonePe redirect/status validation (`initiatePhonePePayment`, redirect validation helpers)
- Community 8: driver trip execution (`persistJobProgress`, journey and proof-photo handlers)
- Community 10: route optimization (`calculateRouteDistance`, `fetchRoutes`, `handleOptimize`)

Interpretation:

- Public route shells are not the main structural risk anymore.
- Payment, auth return-to, contact fallback, and driver trip state are still the highest-value end-to-end paths to prove.

## Coverage Legend

- `PROVED`: route or flow is exercised in production with a passing artifact.
- `PARTIAL`: some steps are proved, but at least one important authenticated or completion step is still missing.
- `GATE-ONLY`: route is only proved to redirect correctly or show its gate state when unauthenticated.
- `LOCAL-ONLY`: logic exists in the workspace but is not yet reflected in production.
- `HUMAN-BLOCKED`: full proof depends on a launch blocker outside AI control.

## Flow Matrix

| Flow | Theory path | Production proof | Verdict | Notes |
| --- | --- | --- | --- | --- |
| Guest marketing and trust | `/` -> `/pricing` -> `/contact` -> `/terms` -> `/privacy` | Public smoke passes on all public shells. Contact fallback probe also passes. | `PROVED` | The visitor-facing entry and support surfaces are healthy in production. |
| Guest to auth entry | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/otp`, `/auth/callback` -> role home | Public shell routes pass. Auth fallback under Supabase outage passes. Real Google admin sign-in was proved separately. | `PARTIAL` | `/otp` and scripted `/auth/callback` are not part of the current route-level smoke artifact. |
| Driver onboarding gate | `/driver/register` -> `/login?mode=driver` -> `/driver/dashboard` | Driver register gate probe passes. Driver dashboard, earnings, and history live proof passes. | `PARTIAL` | The gated entry is correct, but the actual driver registration submission flow is still not live-proofed. |
| Agency onboarding gate | `/agency/register` -> `/login?mode=agency` -> `/agency/dashboard` | Agency register gate probe passes. Agency dashboard, fleet, jobs, drivers, and billing live proof pass. | `PARTIAL` | The gated entry is correct, but the actual agency registration submission flow is still not live-proofed. |
| Shared customer portal | `/login` -> `/dashboard` -> `/management/customers` -> `/history` plus the shared office routes | Customer live proof passes on `/management/customers`, `/dashboard`, `/management`, `/settings/company`, `/booking/new`, and `/history`, including customer create/delete proof. | `PARTIAL` | The core shared-office slice is now authenticated-proved, but `/packing`, `/routes`, `/tracking`, and the management leaf catalogs are still only gate-tested. |
| Driver operational loop | `/driver/dashboard` -> `/driver/trip/:jobId` -> `/driver/earnings` -> `/driver/history` -> `/driver/profile` | Driver live proof passes on dashboard, earnings, history, and profile. | `PARTIAL` | `/driver/trip/:jobId` is still only gate-tested and needs a live job-backed proof. |
| Agency operational loop | `/agency/dashboard` -> `/agency/fleet` -> `/agency/drivers` -> `/agency/jobs` -> `/agency/billing` -> `/agency/rates` | Agency live proof passes on dashboard, fleet, drivers, jobs, billing, and rates. | `PROVED` | Route-level agency portal coverage is now complete in production. |
| Admin operational loop | `/admin` -> `/admin/drivers` -> `/admin/drivers/:id` -> `/admin/agencies` -> `/admin/payouts` -> `/admin/contact` -> `/admin/users` -> `/admin/subscriptions` | Live admin proof now passes on all 7 static admin routes plus a real `/admin/drivers/:id` detail page. Real Google-authenticated admin proof also exists. | `PROVED` | The dynamic driver-detail route is now authenticated end-to-end proved. |
| Payment and subscription | `/pricing` -> `/checkout` -> Razorpay order -> `/payment/callback` or `/payment/success` -> active subscription | Public shells for pricing, callback, success, and subscription redirect pass. `/checkout` redirect gate passes. | `GATE-ONLY`, `HUMAN-BLOCKED` | No live successful production payment proof exists because T-110 live Razorpay credentials remain the hard blocker. |
| Resilience and fallback | Contact retry queue, auth fallback, Supabase auth reachability | Contact fallback passes. Email OTP fallback passes. Auth service reachability probe passes. | `PROVED` | Failure-mode UX is better covered than some happy-path business flows. |

## Routes Authenticated-Proved In Production

These protected routes currently have authenticated production proof, not just redirect proof:

- `/dashboard`
- `/management`
- `/management/customers`
- `/settings/company`
- `/booking/new`
- `/history`
- `/driver/dashboard`
- `/driver/earnings`
- `/driver/history`
- `/driver/profile`
- `/agency/dashboard`
- `/agency/fleet`
- `/agency/jobs`
- `/agency/billing`
- `/agency/drivers`
- `/agency/rates`
- `/admin`
- `/admin/drivers`
- `/admin/drivers/:id`
- `/admin/agencies`
- `/admin/payouts`
- `/admin/contact`
- `/admin/users`
- `/admin/subscriptions`

Result:

- `24` authenticated in-portal routes are currently proved in production.
- Production route protection is broad, and the authenticated proof surface is now meaningfully closer to the real route graph than the earlier `18-route` snapshot.

## Protected Routes Still Only Gate-Tested

These protected routes currently only have redirect or gate proof in production:

- `/packing`
- `/routes`
- `/tracking`
- `/profile`
- `/management/trucks`
- `/management/cartons`
- `/sale-orders`
- `/invoice/:shipmentId`
- `/checkout`
- `/driver/trip/:jobId`

Interpretation:

- Route protection itself is healthy.
- The missing proof is now mostly on authenticated workflows inside those screens, not on public availability.

## Routes Present In App But Missing From Current Route-Level Smoke Inventory

- `/auth/callback`
- `/otp`
- `/driver/profile`

Notes:

- `/auth/callback` has manual real-world proof through the Google admin session, but it is not currently covered by the route-level smoke artifact.
- `/otp` is a stateful auth step and should not be treated as a simple direct-load public shell because it redirects to `/login` when no pending contact exists.
- `/driver/profile` is now authenticated-proved through `npm run test:live-auth`, but it is still absent from the route-level smoke artifact.

## Local Vs Production Drift That Affects Path Truth

These path-level fixes exist in the workspace but are not yet guaranteed in production:

- `/driver/earnings`
  - local logic now separates available balance, in-process payouts, and withdrawn totals
  - current production proof only confirms the page renders and authenticates
- `/checkout` and `/payment/callback`
  - local logic now carries `order_id` through pending Razorpay flows and resolves callback status by order when payment ID is delayed
  - current production proof only covers route shells, not a real payment completion path
- `/pricing`
  - local logic now normalizes `subscription_plans.features` when Supabase returns a JSON string instead of an array
  - current production proof only confirms the page loads without current smoke errors

## Bottom Line

Current reality is strong on three things:

- public route health
- auth and support fallback behavior
- a core authenticated slice for customer, agency, driver, and admin portals

Current reality is still weak on four things:

- full payment completion proof
- driver trip execution proof
- authenticated proof for the remaining shared office and catalog tools (`/packing`, `/routes`, `/tracking`, `/management/trucks`, `/management/cartons`, `/sale-orders`)
- state-aware coverage for the special auth routes (`/auth/callback`, `/otp`) inside the route-level smoke story

This means the app is not in a "broken route shell" state. It is in a "partially proved business-flow" state.

## Safest Next Deploy And Verification Step

Do not do a blind repo-wide production release from the current worktree.

Reason:

- the git worktree currently contains unrelated backend, desktop, admin, security, and Supabase-function changes alongside the frontend path fixes
- that makes a full-tree Heroku release larger and riskier than necessary if the immediate goal is just to align production with the recently fixed frontend user paths

Safest path:

1. Create a narrow frontend release candidate that contains only the intended path-facing fixes.
2. Keep the first release slice focused on these user-path files:
   - `frontend/src/pages/DriverEarningsPage.tsx`
   - `frontend/src/pages/CheckoutPage.tsx`
   - `frontend/src/pages/PaymentCallbackPage.tsx`
   - `frontend/src/pages/PricingPage.tsx`
3. Run the narrow validations before release:
   - `cd frontend && npm run build`
   - `npm run test:frontend-smoke`
4. Deploy that frontend slice.
5. Re-run practical post-deploy proof:
   - `npm run test:frontend-smoke`
   - `npm run test:live-auth`
   - `npm run test:live-admin`
6. Only after that, tackle live payment proof. `npm run test:prod-config` will remain meaningfully blocked until T-110 is cleared with live Razorpay credentials.

Recommended next proof queue after the frontend slice is live:

1. add a job-backed proof for `/driver/trip/:jobId`
2. add authenticated proofs for the remaining office-tool and catalog routes (`/packing`, `/routes`, `/tracking`, `/management/trucks`, `/management/cartons`, `/sale-orders`)
3. decide whether `/auth/callback` and `/otp` belong in smoke as explicit special-case checks rather than naive direct-load routes
4. finish live Razorpay proof once T-110 is removed