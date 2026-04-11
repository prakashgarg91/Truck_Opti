# TruckOpti Qdrant Codebase Gap & Mismatch Audit
Generated: 2026-04-11 08:46
Collection: `ws-6df6af38d373c83b` (Roo Code index, http://localhost:6335)
Embedding model: `nomic-embed-text-v2-moe` (http://localhost:11434)

> This report was produced by semantically querying the live Qdrant codebase index
> with 47 page files and 10 component files scanned.
> Checks combine structural pattern matching on code chunks + vector similarity search.

**Total issues: 44**

## 1. Auth Pattern Mismatches
- ⚠️  **AUTH MISMATCH** `InvoicePage.tsx` — local auth state instead of `useAuthStore()`: supabase.auth.getUser
- ⚠️  **AUTH MISMATCH** `TestPaymentPage.tsx` — local auth state instead of `useAuthStore()`: useState null for user, setUser call, supabase.auth.getUser
- ⚠️  **AUTH MISMATCH** `CompanyProfilePage.tsx` — local auth state instead of `useAuthStore()`: supabase.auth.getUser
- ⚠️  **AUTH MISMATCH** `PaymentCallbackPage.tsx` — local auth state instead of `useAuthStore()`: supabase.auth.getUser
- ⚠️  **AUTH MISMATCH** `DriverRegisterPage.tsx` — local auth state instead of `useAuthStore()`: supabase.auth.getUser
- ⚠️  **AUTH MISMATCH** `TrucksPage.tsx` — local auth state instead of `useAuthStore()`: supabase.auth.getUser

## 2. Raw error.message Exposure to Users
- ✅ No issues found.

## 3. Supabase Queries Without Error Check
- ⚠️  **NO ERROR CHECK** `CustomersPage.tsx` — uses Supabase but no `if (error)` or try/catch guard found
- ⚠️  **NO ERROR CHECK** `CartonsPage.tsx` — uses Supabase but no `if (error)` or try/catch guard found
- ⚠️  **NO ERROR CHECK** `Dashboard.tsx` — uses Supabase but no `if (error)` or try/catch guard found
- ⚠️  **NO ERROR CHECK** `AgencyBillingPage.tsx` — uses Supabase but no `if (error)` or try/catch guard found
- ⚠️  **NO ERROR CHECK** `AgencyFleetPage.tsx` — uses Supabase but no `if (error)` or try/catch guard found

## 4. Data-Fetching Pages Without Loading State
- ⚠️  **NO LOADING STATE** `AgencyRegisterPage.tsx` — fetches data but no loading indicator pattern found
- ⚠️  **NO LOADING STATE** `PaymentCallbackPage.tsx` — fetches data but no loading indicator pattern found
- ⚠️  **NO LOADING STATE** `ContactPage.tsx` — fetches data but no loading indicator pattern found
- ⚠️  **NO LOADING STATE** `NewShipmentPage.tsx` — fetches data but no loading indicator pattern found

## 5. Pages Without Error Fallback UI
- ⚠️  **NO ERROR UI** `DriverDashboardPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AdminSubscriptionsPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AgencyDriversPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AdminDashboardPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `LoginPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `ManagementPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `DriverDetailPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AgencyRatesPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `RoutesPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AdminUsersPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `SignupPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `PaymentCallbackPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `PackingPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AdminPayoutsPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AdminContactPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `ShipmentHistoryPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AgencyDashboardPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `NewShipmentPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AgencyBillingPage.tsx` — Supabase usage with no error fallback/return UI
- ⚠️  **NO ERROR UI** `AgencyFleetPage.tsx` — Supabase usage with no error fallback/return UI

## 6. Missing Bilingual (EN/HI) Support
- 🟡 **NO BILINGUAL** `AgencyFleetPage.tsx` — user-facing text found but no `language === 'en'` pattern
- 🟡 **NO BILINGUAL** `TermsPage.tsx` — user-facing text found but no `language === 'en'` pattern
- 🟡 **NO BILINGUAL** `MapViewWrapper.tsx` — user-facing text found but no `language === 'en'` pattern
- 🟡 **NO BILINGUAL** `ErrorBoundary.tsx` — user-facing text found but no `language === 'en'` pattern

## 7. TypeScript `any` Type Usage
- 🟡 **TYPESCRIPT `any`** `CartonsPage.tsx` — 2 occurrences of `any` type (: any)
- 🟡 **TYPESCRIPT `any`** `TrackingPage.tsx` — 2 occurrences of `any` type (: any)
- 🟡 **TYPESCRIPT `any`** `RoutesPage.tsx` — 3 occurrences of `any` type (: any)
- 🟡 **TYPESCRIPT `any`** `SaleOrdersPage.tsx` — 3 occurrences of `any` type (: any, as any)
- 🟡 **TYPESCRIPT `any`** `TrucksPage.tsx` — 3 occurrences of `any` type (: any)

## 8. console.log in Production Code
- ✅ No issues found.

## 9. Orphan Page Files (Not in Router)
- ✅ No issues found.

## 10. Unused Zustand Stores
- ✅ No issues found.

## 11. Supabase Migrations Missing RLS ENABLE
- ✅ No issues found.

## 12. Banned USING(true) RLS Policies
- ✅ No issues found.

## 13. Potential Hardcoded Secrets
- ✅ No issues found.

## 14. TODO / FIXME / Stub Code
- ✅ No issues found.

## 15. Direct DOM Manipulation (Non-React)
- ✅ No issues found.

## 16. Forms Without Validation
- ✅ No issues found.

---
*Re-run: `python tools/qdrant_gap_audit.py`*
