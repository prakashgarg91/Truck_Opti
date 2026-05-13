# Design Gap Register

Purpose: keep one shared design-review artifact for missing screens, broken navigation paths, and ambiguous route contracts in the shipped TruckOpti app.

Scope rules:
- `Broken path` means a live navigation or share path currently points to an unowned route or drops required context.
- `Missing current screen` means the shipped UI clearly needs a route or state view, but the current app only has a placeholder, redirect, or toast.
- `Planned future surface` means the screen exists in Stitch or the platform plan, but it is not part of the current shipped route tree yet.
- `Ambiguous contract` means the code and docs disagree about who owns or should reach a route group.

Evidence sources:
- `graphify-out/GRAPH_REPORT.md`
- `frontend/src/App.tsx`
- `frontend/src/layouts/AgencyLayout.tsx`
- `frontend/src/layouts/MobileLayout.tsx`
- `frontend/src/utils/whatsappShare.ts`
- `frontend/src/pages/TrackingPage.tsx`
- `frontend/src/pages/ShipmentHistoryPage.tsx`
- `frontend/src/pages/InvoicePage.tsx`
- `frontend/src/components/ProtectedRoute.tsx`
- `docs/MODULES.md`
- `docs/ARCHITECTURE.md`
- `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md`
- `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md`

## Summary

| Type | Count | Notes |
|---|---:|---|
| Confirmed broken paths | 0 open / 3 fixed | The initial route/share-path defects were fixed in the current tree on 2026-05-13 |
| Missing current screens/state views | 1 open / 2 fixed | Support and permission-denied now have shipped surfaces in the current tree; subscription management remains open |
| Planned future surfaces not route-backed yet | 4 | Already present in plan/Stitch, not current launch blockers |
| Ambiguous contracts | 1 | Docs and route guards disagree |

## 1. Recently Resolved Broken Paths

| Gap | Current resolution | Evidence |
|---|---|---|---|
| Agency profile dead link | Added `/agency/profile` to the agency protected route group so the existing layout link now resolves to `ProfilePage` inside `AgencyLayout`. | `frontend/src/layouts/AgencyLayout.tsx`, `frontend/src/App.tsx` |
| Invoice WhatsApp share used an unowned payment URL | `shareInvoice(...)` now emits the owned invoice route `/invoice/:shipmentId` instead of an unowned `/payment/:shipmentId` path. | `frontend/src/utils/whatsappShare.ts`, `frontend/src/pages/InvoicePage.tsx`, `frontend/src/App.tsx` |
| Tracking WhatsApp share lost shipment context | `shareTrackingLink(...)` and the generic tracking share text now preserve `?shipment=<id>` when the shipment id is available, matching `TrackingPage` and `ShipmentHistoryPage`. | `frontend/src/utils/whatsappShare.ts`, `frontend/src/pages/TrackingPage.tsx`, `frontend/src/pages/ShipmentHistoryPage.tsx` |

## 2. Current Screens Or State Views

| Gap | Current status | Evidence |
|---|---|---|
| Authenticated help/support flow | Fixed: the main shell help action now routes to protected `/support`, which reuses `ContactPage` in authenticated mode instead of showing a toast-only placeholder. | `frontend/src/layouts/MobileLayout.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/ContactPage.tsx`, `docs/MODULES.md` |
| Self-serve subscription management | Open: `/subscription` still redirects straight to `/pricing`, so the app still lacks a user-facing current-plan management surface. | `frontend/src/App.tsx`, `docs/MODULES.md` |
| Permission denied state view | Fixed: `ProtectedRoute` now renders a reusable `PermissionDeniedState` with requested-path context and safe navigation instead of silently redirecting away on a role mismatch. | `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/components/PermissionDeniedState.tsx`, `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md` |

## 3. Planned Future Surfaces Not Yet Backed By Routes

These are not current launch blockers, but they are real design gaps between the future-state plan/Stitch reference and the current route tree.

| Surface | Current repo status | Source of truth |
|---|---|---|
| Partner console | No `/partner/*` routes or page files in the shipped app | `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md` |
| Demo / reviewer workspace | Planned identities and Stitch references exist, but no dedicated workspace routes exist yet | `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md`, `0.dev-matrix/AI-HANDOFF.md` |
| Cancellation center | Exists in the Stitch/design backlog, not in the current route tree | `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md` |
| Refund & dispute center | Exists in the Stitch/design backlog, not in the current route tree | `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md` |

## 4. Ambiguous Route Contract

| Contract | Current code | Current docs | Why it matters |
|---|---|---|---|
| Customer-shell role boundary | `/dashboard`, `/packing`, `/routes`, `/tracking`, `/booking/new`, `/profile`, `/management`, and related routes sit behind bare `ProtectedRoute`, which allows any authenticated role | `docs/MODULES.md` describes the customer/logistics-manager portal as role `user`, while `docs/ARCHITECTURE.md` describes these routes as `ProtectedRoute (any role)` | Future AI edits can easily mis-harden or over-open the shell unless one contract becomes canonical. |

## 5. What Should Not Be Treated As Missing Routes

These are already intended to live inside existing route/state machines and should not be duplicated as top-level route work:

- `Customer: Live Shipment Tracking - Mobile` and `Customer Tracking Control Center - TruckOpti` should remain responsive variants of `/tracking`.
- Driver pickup, in-transit, delivery, and proof states should remain inside `/driver/trip/:jobId` rather than new top-level routes.
- Admin KYC detail and settlement reconciliation should remain detail/drill-down states inside the existing admin route family until a dedicated route is justified.

## Review Order

1. Fix the three confirmed broken paths first because they are live user-facing defects.
2. Decide whether authenticated help/support and subscription management need full routes or state views inside existing pages.
3. Resolve the customer-shell role contract so docs and guards say the same thing.
4. Keep partner/demo/reviewer/cancellation/refund surfaces in backlog unless they are intentionally promoted into the shipped route tree.

## Best Next Follow-Up Artifact Use

Use this file as the single review surface when discussing:
- what is broken today,
- what is intentionally still backlog,
- and which Stitch screens should map to existing routes versus stay as future-state references.

If a gap is fixed, update this file first and then sync any durable route truth into `docs/MODULES.md`, `docs/ARCHITECTURE.md`, or `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md` as needed.