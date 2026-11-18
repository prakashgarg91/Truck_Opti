# Customer and public-site audit, 2026-11-18

Scope: (A) public site and auth, (B) customer / default logged-in app.
Method: static reading of source, routes and migrations. Nothing was run in a browser, and no tests were executed. Line numbers are from the working tree at the time of the audit. Severity: BREAKS (blocks a user or a sale), WRONG (factually or contractually inconsistent), ROUGH (polish or copy).

Canonical plan facts used as the reference: Starter 499, Growth 1,999, Professional 4,999 rupees per month excl. GST; Starter 3 trucks / 2 staff, Growth 20 / 10, Professional 50 / 25; yearly = 10x monthly; 14-day trial; PhonePe hidden. These match the seed in `supabase/migrations/20260212000000_production_setup.sql:158-160` and the yearly fix in `supabase/migrations/20261026000000_agency_subscriptions.sql:55-60`.

---

## 1. Route and menu map

### 1a. Customer menu (`frontend/src/layouts/MobileLayout.tsx`)

| Label | Target | Page file | Route in App.tsx | Notes |
|---|---|---|---|---|
| Home (bottom bar) | `/dashboard` | `pages/Dashboard.tsx` | yes, `App.tsx:144` | |
| Orders | `/sale-orders` | `pages/SaleOrdersPage.tsx` | yes, `App.tsx:154` | |
| Pack | `/packing` | `pages/PackingPage.tsx` | yes, `App.tsx:145` | |
| Routes | `/routes` | `pages/RoutesPage.tsx` | yes, `App.tsx:146` | straight-line distance, see issues |
| Track | `/tracking` | `pages/TrackingPage.tsx` | yes, `App.tsx:147` | |
| History | `/history` | `pages/ShipmentHistoryPage.tsx` | yes, `App.tsx:157` | |
| Management (sidebar) | `/management` | `pages/ManagementPage.tsx` | yes, `App.tsx:150` | cards go to the three routes below |
| Trucks (card) | `/management/trucks` | `pages/TrucksPage.tsx` | yes, `App.tsx:151` | there is no top-level `/trucks` route |
| Cartons (card) | `/management/cartons` | `pages/CartonsPage.tsx` | yes, `App.tsx:152` | |
| Customers (card) | `/management/customers` | `pages/CustomersPage.tsx` | yes, `App.tsx:153` | |
| Subscription | `/subscription` | `pages/SubscriptionPage.tsx` | yes, `App.tsx:120` | agency-oriented, see issues |
| Company Profile | `/settings/company` | `pages/CompanyProfilePage.tsx` | yes, `App.tsx:156` | |
| Settings | `/profile` | `pages/ProfilePage.tsx` | yes, `App.tsx:149` | label says "Settings", the page is the profile |
| Help & Support | `/support` | `pages/ContactPage.tsx` (variant authenticated) | yes, `App.tsx:119` | |
| Dark Mode | toggle, no route | n/a | n/a | |
| Sign Out | `/login` | n/a | yes | |
| Notification bell | `action_url` from data | n/a | n/a | |

Reached from pages but not from the menu: `/booking/new` (`NewShipmentPage`, `App.tsx:148`, linked from `Dashboard.tsx:208,288` and `TrackingPage.tsx:823`), `/invoice/:shipmentId` (`App.tsx:155`, from `TrackingPage.tsx:316`), `/checkout` (`App.tsx:113`), `/payment/callback` and `/payment/success` (`App.tsx:114-115`). The labels "Trucks", "Shipments" and "New shipment" do not exist as routes; the real paths are listed above.

### 1b. Public routes (`frontend/src/App.tsx:110-136`)

| Page | Route | Linked from |
|---|---|---|
| Landing | `/` (RoleHome, `App.tsx:93`) | logo |
| Pricing | `/pricing` (`App.tsx:112`) | landing header, hero, footer; `PricingPage` CTAs |
| Terms / Privacy | `/terms`, `/privacy` (`App.tsx:116-117`) | landing footer, login, signup, checkout, subscription |
| Contact | `/contact` (`App.tsx:118`) | landing CTA, footer |
| Driver register | `/driver/register` (`App.tsx:121`) | landing header and footer |
| Agency register | `/agency/register` (`App.tsx:122`) | landing header and footer (desktop nav is `hidden md:flex`, `LandingPage.tsx:136`) |
| Login / Signup / OTP / Forgot / Reset | `App.tsx:131-135` | header, auth pages |
| `/local-start` | `App.tsx:124` | not linked publicly (only `AgencyDashboardPage.tsx:143`) |

All anchors on the landing page have targets: `#features` (`LandingPage.tsx:137-142`, id at `:289`) and `#how-it-works` (`:143-148`, id at `:357`). No `href="#"` was found in the scope.

---

## 2. Per-item trace: label, page, service, backend

| Item | Main actions | Service | Backend | Status |
|---|---|---|---|---|
| Home | stats, weekly counts | `customerDashboardApi`, `analyticsSupabaseApi` (`services/supabaseApi`) | Supabase tables | loading, error, empty states present |
| Orders | import, create, reoptimise | `services/supabaseApi` | Supabase | 13 empty-state branches, 2 error branches |
| Pack | 3D pack, book truck | `usePackingWorker`, `lib/packing`, `supabaseApi` | client worker plus Supabase save | booking requires a plan; expired users get a "View Plans" block (`PackingPage.tsx:700-718`) |
| Routes | optimise route | `supabaseApi` | Supabase | no error state (`RoutesPage.tsx`, error count 0); demo geocoding (`:98`); fuel and toll are fixed rates (`:200-201`) |
| Track | status update, share, invoice | `supabaseApi`, `tripPhotoUrl` | Supabase | cancel uses native `confirm()` (`TrackingPage.tsx:~320`) |
| History | list, paginate, open tracking | `supabaseApi` | Supabase | no error state (error count 0); row click opens `/tracking?shipment=` which is read at `TrackingPage.tsx:182` |
| Management | counts, cards | `customerDashboardApi.getManagementCounts` | Supabase | errors only toasted (`ManagementPage.tsx:36`), no error UI |
| Trucks | CRUD, seed defaults | `services/localApi` (`trucksLocalApi`) | device-local storage | data is device-local, not cloud |
| Cartons | CRUD | `services/localApi` | device-local | same |
| Customers | CRUD | `supabaseApi` | Supabase | 2 error branches, 6 empty branches |
| Subscription | entitlement, trial, invoices | `services/subscriptionApi`, `gstInvoicesApi`, `useAgencyAccess` | Supabase RPC / functions | agency-only logic, see issues |
| Company Profile | save | `lib/supabase` direct | Supabase | no error branch (error count 0); bypasses service layer |
| Profile | save, avatar | `lib/supabase` direct (`ProfilePage.tsx`) | Supabase | no error branch; bypasses service layer |
| Help and Support | contact form | `services/contactInquiry` | `contact_inquiries` table (`supabase/migrations/20260309000000_contact_inquiries.sql`), `admin-portal-contact` function | offline queue present (`ContactPage.tsx:146-157`) |
| Checkout | Razorpay order, verify | `services/razorpayPayment`, `subscriptionApi` | `create-razorpay-order`, `verify-razorpay-payment` functions (exist) | disabled when payments unavailable (`CheckoutPage.tsx:58,99-100,345-358`) |
| Payment callback | verify status | `services/phonepePayment`, `supabaseApi` (Razorpay snapshot) | `phonepe-status`, `verify-payment` (exist) | PhonePe branch at `PaymentCallbackPage.tsx:4,123-124`; hidden in UI |
| New shipment | save e-way bill | `customerSupabaseApi.updateEWayBill` (`customerSupabaseApi.ts:314`) | writes `shipments.eway_bill_data` (`supabase/migrations/20260311000002_eway_bill_column.sql`) | no NIC call, see issues |

Backend functions present in `supabase/functions`: agency-portal-*, admin-portal-*, create-razorpay-order, verify-razorpay-payment, razorpay-webhook, phonepe-checkout, phonepe-status, verify-payment, invoice-view, driver-kyc, erp-ingest. There is no function named for e-way bill / NIC.

---

## 3. Issues, customer app (B)

**B-1 BREAKS, Upgrade dead end for non-agency customers.** The sidebar shows "Free Plan · Upgrade" to a non-trial user (`MobileLayout.tsx:477-483`), and it routes to `/subscription`. That page is built around the agency owner: `AgencyTrialPanel` shows "Only the agency owner can start the free trial. Ask the owner of your agency to start it from this page." when `isOwner` is false (`components/billing/AgencyTrialPanel.tsx:46-56`). A normal customer has no agency, so the copy tells them to ask someone who does not exist. Fix: when there is no agency profile, show "Choose a plan" to the checkout, or hide the Subscription item for role `user`. Effort S.

**B-2 WRONG, "Free Plan" label.** `MobileLayout.tsx:482` says "Free Plan". The approved model has no free plan: it is a 14-day trial then expired. Fix copy to "No active plan · Start trial" for agency, "No active plan · View plans" otherwise. Effort S.

**B-3 WRONG, e-way bill toast overstates.** `NewShipmentPage.tsx:163` shows "E-way bill saved — NIC API integration coming soon" and navigates after 1.5 s (`:164`). Only the local column is written (`customerSupabaseApi.ts:314-317`). Change to "E-way bill details saved. Government e-way bill generation is not connected yet." Effort S.

**B-4 WRONG, route cost is a rough estimate.** `RoutesPage.tsx:200-201` uses a fixed Rs 12/km fuel and Rs 1.5/km toll. The landing and pricing copy promise "Route Optimization with Tolls" and "Rate-aware routes with toll logic" (`config/pricing.ts:160`, `LandingPage.tsx:24-26,70-71`). Fix copy to "Estimated route cost (straight-line, fixed per-km rates)". Effort S.

**B-5 ROUGH, Settings label.** `MobileLayout.tsx:598-607` labels `/profile` "Settings" while "Company Profile" and "Subscription" sit beside it. Rename to "My profile". Effort S.

**B-6 ROUGH, device-local data.** Trucks and cartons use `services/localApi` (`TrucksPage.tsx`, `CartonsPage.tsx`). Data does not follow the user across devices, and the Starter catalogue seed (`TrucksPage.tsx:28-99`) is written to the device. Confirm this is intended before selling multi-device teams. Effort M to investigate.

**B-7 ROUGH, missing error states.** `RoutesPage`, `ShipmentHistoryPage`, `CompanyProfilePage`, `ProfilePage`, `InvoicePage` have no error branch (error counts 0). `ManagementPage.tsx:21-36` shows only a toast on failure. Add an error card with Retry. Effort S each.

**B-8 ROUGH, layer bypass.** `ProfilePage.tsx` and `CompanyProfilePage.tsx` import `lib/supabase` directly instead of a service. Move to `services/supabaseApi`. Effort M.

**B-9 ROUGH, mobile bottom bar labels.** `MobileLayout.tsx:40-45` defines `labelHi` for every item but the bar renders only `item.label` (`:696`). Either render Hindi or remove the field. Pricing promises "Hindi/English UI" (see C-2). Effort S.

**B-10 ROUGH, native confirm.** `TrackingPage.tsx` cancel uses `confirm()`, and the copy says "This cannot be undone" (`~:320`). Use the app's modal. Effort S.

**B-11 ROUGH, pricing feature list shows raw slugs.** Plan features come from the DB and are rendered as-is (`PricingPage.tsx:53`, `:238-241`). The seed strings are `basic_3d_packing`, `route_planning`, `shipment_tracking`, `basic_reports` (`20260212000000_production_setup.sql:158-160`). Nothing maps them to labels (grep for `basic_3d_packing` finds only the seed). Visitors who reach `/pricing` with the DB loaded see snake_case text. This is listed as BREAKS for the sales page under C-4.

**B-12 ROUGH, support level shows raw values.** `PricingPage.tsx:63` passes `plan.support_level` (`email`, `chat`, `priority`) straight into the comparison row, so the page shows lowercase codes. Map to labels.

---

## 4. Issues, public site (A)

**A-1 BREAKS, agency signup path is a loop for a new agency.** Walk-through:
1. Landing "Agencies" (`LandingPage.tsx:155-160`, footer `:471`) goes to `/agency/register`.
2. Not logged in, the page shows "Log In To Register Your Agency" with "Continue To Agency Login" (`AgencyRegisterPage.tsx:147-165`), which goes to `/login?mode=agency`.
3. On the agency login surface, the sign-up link is "New transport agency? Register Agency" pointing back to `/agency/register` (`LoginPage.tsx:72-74`, render at `:754-759`).
4. The OTP send uses `shouldCreateUser: false` (`services/supabaseApi.ts:791`), so a brand-new email cannot get a code. The only sign-up call with `shouldCreateUser: true` is `signUpWithEmail` (`:810`), used by `/signup`.
5. `/signup` has no role choice and no agency link (`SignupPage.tsx`), and `MobileLayout` has no link to `/agency/register`.
Result: a new transport agency cannot create an account from the agency surface, and after signing up as a customer it cannot find the registration form. Existing agencies are fine. This is from code reading; I did not test it against the live project, so confirm with one real attempt. Fix: on `/login?mode=agency`, when the email is unknown, offer "Create agency account" that calls `signUpWithEmail`; and add a "Register your agency" card in the customer `Management` or `Help` page. Effort M.

**A-2 BREAKS (sales), landing promises a trial that customers cannot start.** `LandingPage.tsx` CTA "Start Free" goes to `/signup`. The pricing page says "Free trial, no card required" (`PricingPage.tsx:83,97`). The trial is started only by an agency owner (`AgencyTrialPanel.tsx`, `TRIAL_CONFIG` in `pricing.ts:372-378`). A plain customer who signs up gets no trial. Fix: word the public CTA as "Start your free agency trial" and send to `/agency/register`, or write customer trial copy honestly ("Create an account, then book your first truck"). Effort S for copy.

**A-3 BREAKS (sales), checkout is unavailable in pilot.** Every paid "Get Started" button on `/pricing` leads to `/checkout`, which disables payment when `isCheckoutEnabled` is false (`CheckoutPage.tsx:58,99-100,345-358`, `services/razorpayPayment.ts:75-78`). This is consistent with the pilot status in `docs/sales/LANDING-COPY.md:121` but a visitor sees a dead end. Fix: when payments are unavailable, change the CTA to "Talk to sales" (`/contact`). Effort S.

**A-4 WRONG, forgot password copy.** `ForgotPasswordPage.tsx:103` placeholder "your@email.com or demo.driver"; `:116` "Reset links work for seeded email addresses and login IDs." These expose internal demo wording to the public. Replace with "your@email.com". Replace `:116` with "Enter the email on your account. We will send a reset link if password sign-in is enabled." Also `LoginPage.tsx:50,63,76,88,89` say "seeded email address". Replace "seeded" with "registered". Effort S.

**A-5 WRONG, refund link goes to a page with no refund terms.** `CheckoutPage.tsx:286` and `SubscriptionPage.tsx:222` link "refund policy" to `/terms`. `TermsPage.tsx:70` says only "Refunds are issued at our discretion within 7 days of payment." The approved draft (`docs/legal/SUBSCRIPTION-POLICY-DRAFT.md:53-66`) says pro-rata within 7 days of first purchase, no renewal refunds (owner to confirm), cancellation stops renewal. Publish the policy as its own page (see Section 5).

**A-6 WRONG, Terms and Privacy are stale.** `TermsPage.tsx:35` and `PrivacyPage.tsx:35` say "Last updated: June 2025". `PrivacyPage.tsx:77` lists "Razorpay, PhonePe" as processors; PhonePe is hidden in the product, so list only the processor in use, after the owner confirms. Effort S.

**A-7 WRONG, contact email is a personal mailbox.** `config/support.ts:14` sets `SUPPORT_EMAIL = 'prakashgarg91@gmail.com'`, shown on `ContactPage.tsx:251` and in the error boundary (`ErrorBoundary.tsx:141-144`). The legal pages use `legal@truckopti.in` (`TermsPage.tsx:116`) and `privacy@truckopti.in` (`PrivacyPage.tsx:95,131`). Two different contacts; the company domain mailboxes may not be monitored. Confirm the domain mailboxes are live, then set `SUPPORT_EMAIL` to a company address. Effort S.

**A-8 WRONG, landing feature claims.** `LandingPage.tsx:10` "3D Bin Packing / AI-powered cargo optimization"; `:85`, `:378`, `:386` say "AI-optimized". The packing algorithms are Skyline BL, Extreme Points and Genetic (`PackingPage.tsx:82-86`). Use "3D bin packing with three optimisation methods". Effort S.

**A-9 ROUGH, empty proof section.** `LandingPage.tsx:99-112` and `:336-350` show "Plan / Before Loading", "Dispatch / In One Flow", "Track / During Trips" under "Operational Gains". There are no gains or numbers. Replace with one measurable claim you can back, or remove the section.

**A-10 ROUGH, headline and SEO wording conflict.** `index.html:14` og:title "India's Smartest Truck Booking Platform"; `:20` Twitter "Truck Booking"; `index.html:39` title "TruckOpti - Smart Logistics"; `LandingPage.tsx:35` h1 "Smart Logistics Control for Indian Fleets"; `:36` "AI-powered 3D packing...". Pick one positioning and align title, og and h1.

**A-11 ROUGH, landing "How it works" step 1.** `LandingPage.tsx:378` "Sign up as a business, agency, or driver." There is no role choice on `/signup`. Change to "Create an account, then register your agency or driver profile." (Also `LandingPage.tsx:367` "Book your first truck in minutes" should match the actual signup-to-booking path.)

**A-12 ROUGH, mobile nav.** `LandingPage.tsx:136` hides Features, How It Works, Drivers, Agencies and Pricing below `md`. On a phone the only links are Login and Sign Up, plus the hero "View Pricing" button and the footer. Add a simple mobile menu or put Agencies in the hero row.

**A-13 ROUGH, unlinked local setup page.** `/local-start` (`App.tsx:124`) is public and unlinked in the public site. Restrict to dev or device mode, or add noindex.

**A-14 ROUGH, 404 title.** `NotFoundPage.tsx` sets "404 - Page Not Found" with no site name; fine, but the landing page sets no title at all (see SEO).

---

## 5. Missing legal pages and links

- **No refund or cancellation page.** No route in `App.tsx`. The approved draft (`docs/legal/SUBSCRIPTION-POLICY-DRAFT.md`) has open owner questions: lines 56 (renewal refunds), 63 (support channel), 82-90 (nine questions). Publish it as `/refund` after the owner answers, and link it from the landing footer (`LandingPage.tsx:468-475`), pricing page, checkout (`CheckoutPage.tsx:286`) and subscription (`SubscriptionPage.tsx:222`).
- **Terms section 4 contradicts the draft** (A-5). Replace `TermsPage.tsx:70` with a link to `/refund`.
- **No cancellation text anywhere in the app.** The draft's section 6 says cancellation stops renewal and data is kept.
- **Terms and Privacy footer present** (`LandingPage.tsx:473-474`), login and signup present (`LoginPage.tsx:765-770`, `SignupPage.tsx:380-385`). Good.
- **Terms has no contact action parity:** `TermsPage.tsx:112-116` is a button that navigates to `/contact` but reads as an email address. Make it a real `mailto:` or a link with the same text.

---

## 6. Pricing and limits mismatches

Reference (approved): Starter 499 / 4,990 per year, 3 trucks, 2 staff, 6 drivers; Growth 1,999 / 19,990, 20 trucks, 10 staff, 40 drivers; Professional 4,999 / 49,990, 50 trucks, 25 staff, 100 drivers; 14-day trial on Starter limits; no free forever tier. Source: `docs/legal/SUBSCRIPTION-POLICY-DRAFT.md:15-33`, DB seed `20260212000000_production_setup.sql:158-160`.

| # | Location | Currently says | Should say |
|---|---|---|---|
| P-1 | `frontend/src/config/pricing.ts:140` | Starter `trucksManaged: 5` | `trucksManaged: 3` |
| P-2 | `config/pricing.ts:169` | Growth `users: 5` | `users: 10` |
| P-3 | `config/pricing.ts:170` | Growth `trucksManaged: 20` | correct, keep |
| P-4 | `config/pricing.ts:200` | Professional `users: 15` | `users: 25` |
| P-5 | `config/pricing.ts:172` | Growth `shipmentsPerMonth: 200` | `500` (DB `20260212000000_production_setup.sql:159`) |
| P-6 | `config/pricing.ts:202` | Professional `shipmentsPerMonth: 500` | `2000` (DB line 160) |
| P-7 | `config/pricing.ts:177` | Growth `supportLevel: 'email'` | `'chat'` (DB line 159) |
| P-8 | `config/pricing.ts:164` | Growth feature "Priority Email Support" | "Chat support" |
| P-9 | `config/pricing.ts:194` | Professional "Priority Phone Support" | "Priority support" unless phone is staffed |
| P-10 | `config/pricing.ts:189` | Professional "Advanced 3D Algorithms (10 types)" | "Three 3D packing methods" (only 3 in `PackingPage.tsx:82-86`) |
| P-11 | `config/pricing.ts:131` | Starter "Basic Truck Catalog (8 types)" | seeded catalogue has 11 types (`TrucksPage.tsx:28-99`); say "Truck catalogue (11 types)" |
| P-12 | `config/pricing.ts:159` | Growth "Full Indian Truck Catalog (17+ types)" | "Full Indian truck catalogue" (no count, or 11) |
| P-13 | `config/pricing.ts:191` | Professional "WhatsApp OTP & Notifications" | remove; only a WhatsApp share link exists (`DriverInvitationsPanel.tsx`) |
| P-14 | `config/pricing.ts:196` | Professional "API Access for Integrations" | DB puts `api_access` in Growth (`20260212000000_production_setup.sql:159`) and no public API is documented; move or remove |
| P-15 | `config/pricing.ts:136` and `:197` | "Hindi/English UI" (Starter), "Multi-language Support" (Pro) | say "English UI; Hindi on selected pages" unless translated |
| P-16 | `config/pricing.ts:375-377` | 14-day trial "tier: 'growth', Full Growth plan features" | "The trial has Starter limits" (draft line 31) |
| P-17 | `config/pricing.ts:379-399` | "Free Forever" freemium tier, 2 trucks, 1 user | remove or mark unused; the policy has no free forever tier |
| P-18 | `frontend/src/layouts/MobileLayout.tsx:482` | "Free Plan" | see B-2 |
| P-19 | `docs/sales/LANDING-COPY.md:80` | "Paid plans begin at ₹500/month (Starter, launch price)" | "Starter at ₹499 per month, excl. GST" |
| P-20 | `LANDING-COPY.md:80` | "Growth ... ₹19,999/year" | "₹19,990 per year" |
| P-21 | `LANDING-COPY.md:80` | "covers up to 20 trucks and 5 users" | "20 trucks and 10 staff users" |
| P-22 | `LANDING-COPY.md:52` and `:95` | "Start on the free tier — no card required" | "Start a 14-day free trial, no card required (agency owners)" |
| P-23 | `docs/sales/SALES-CHECKLIST.md:53` | Starter "₹500 (₹5,000 a year)" | "₹499 (₹4,990 a year)" |
| P-24 | `SALES-CHECKLIST.md:53` | Growth "₹19,999" | "₹19,990" |
| P-25 | `SALES-CHECKLIST.md:53` | Professional "₹49,999" | "₹49,990" |
| P-26 | `SALES-CHECKLIST.md:53` | Enterprise "₹1,49,999" | "₹1,49,990" |
| P-27 | `SALES-CHECKLIST.md:80` (verification map in LANDING-COPY line 116) | "Growth ₹1,999/mo covering 20 trucks/5 users" | "20 trucks / 10 staff" |
| P-28 | `pricing.ts:127-128`, `:150-152` comment values | "~17% discount" | "two months free (16.7%)" — matches the page's "Two months free" label; drop "17%" in copy |
| P-29 | `LANDING-COPY.md:39` | GST 5% on freight in billing copy | keep, but state clearly this is the agency's freight GST, not TruckOpti's 18% subscription GST |

Also the fallback when the DB does not load: `PricingPage.tsx:36-40` uses `pricing.ts` limits, so visitors on a slow network see P-1, P-2, P-4 to P-7 values, not the DB values. Fixing `pricing.ts` fixes both paths.

On the page itself:
- `PricingPage.tsx:58` maps `packingOptimizations` to `shipments_monthly`, so the "Packing Opts" row duplicates "Shipments/mo".
- `PricingPage.tsx:117` shows "Unlimited" for any value of 0, so a plan with 0 routes or 0 SMS reads as unlimited.
- `PricingPage.tsx:238` silently truncates features to 5 (`slice(0, 5)`), so Professional's 11 features show 5 with no "and more".
- Correct yearly values: the DB migration already sets yearly = 10x monthly (`20261026000000_agency_subscriptions.sql:55-60`), and `pricing.ts` already shows 4,990 / 19,990 / 49,990. Only the sales copy (P-23 to P-26) was wrong.

---

## 7. SEO basics

- `frontend/index.html:39` sets one title for the whole SPA: "TruckOpti - Smart Logistics". `index.html:8` description is fine. Canonical is fixed to `https://www.truckopti.in` (`:9`), so every page canonicalises to the home page. Fix: set canonical per route at runtime, or prerender the public pages.
- Titles per page: Pricing (`PricingPage.tsx:264`), Terms (`TermsPage.tsx:9`), Privacy (`PrivacyPage.tsx:9`), Contact (`ContactPage.tsx:57`), auth pages set titles. **Landing page sets no title** (`LandingPage.tsx`), so `/` is indexed with the generic title.
- No per-page `<meta name="description">`. Only one in `index.html:8`.
- og:title (`index.html:14`) and Twitter title (`:20`) disagree with the h1 (A-10).
- `public/sitemap.xml` lists `/`, `/pricing`, `/contact`, `/terms`, `/privacy`, `/login`, `/signup`. It omits `/agency/register` and `/driver/register`, which are the two public acquisition pages. Add them, and drop `/login` (not useful for search).
- `public/robots.txt` allows all and disallows `/api/` and `/auth/`. Acceptable.
- `public/manifest.webmanifest:2-9` name "TruckOpti - Logistics Solution" with description "Advanced 3D Bin Packing & Route Optimization for India". Fine but differs from the index title; align.
- H1 on landing: one `<h1>` (`LandingPage.tsx:194-196`). Good.

---

## 8. Agency signup path, summary

Discoverability: from the landing page, the Agencies link exists in the desktop header (`LandingPage.tsx:155-160`) and footer (`:471`). Not on mobile header (A-12). Not in the customer menu.
Sign-up: broken for new agencies (A-1). Existing customers who become agencies can reach `/agency/register` only by typing the URL.
Approval, trial and billing: trial is for the owner only (A-2, B-1).
Recommended order: fix A-1 first, then make the landing "Agencies" CTA the second primary button in the hero.

---

## 9. Top-10 fix list (smallest safe first)

1. **Copy fix for pricing features and limits** — `frontend/src/config/pricing.ts` lines 127-200 (P-1, P-2, P-4 to P-15), `docs/sales/LANDING-COPY.md:52,80,95`, `docs/sales/SALES-CHECKLIST.md:53,80`. Effort S. Largest sales-risk reduction.
2. **Map DB feature slugs to labels** — `frontend/src/pages/PricingPage.tsx:53` plus a small label map. Effort S (B-11).
3. **Remove the "Free Plan / Free Forever" wording and the freemium tier** — `MobileLayout.tsx:482`, `pricing.ts:379-399`. Effort S (B-2, P-17).
4. **Honest e-way bill toast and route cost copy** — `NewShipmentPage.tsx:163`, `RoutesPage.tsx` copy (B-3, B-4). Effort S.
5. **Replace "seeded/demo" wording on auth** — `ForgotPasswordPage.tsx:103,116`, `LoginPage.tsx:50,63,76,88,89` (A-4). Effort S.
6. **Publish refund/cancellation page and fix Terms section 4** — new `/refund` route in `App.tsx`, `TermsPage.tsx:70`, links at `CheckoutPage.tsx:286`, `SubscriptionPage.tsx:222`. Effort M (needs owner answers in the draft).
7. **Company support email** — `frontend/src/config/support.ts:14` (A-7). Effort S, after the mailboxes are confirmed.
8. **Agency sign-up loop** — `pages/auth/LoginPage.tsx` (agency surface) and `services/supabaseApi.ts:791` path, plus a "Create agency account" action calling `signUpWithEmail` (A-1). Effort M. Test with a real new email first.
9. **Customer Upgrade dead end and trial wording** — `MobileLayout.tsx:477-483`, `AgencyTrialPanel.tsx:46-56` (B-1, A-2). Effort S for copy, M for role-aware page.
10. **Public SEO and sitemap** — per-route title on the landing page (`LandingPage.tsx`), align `index.html:14,20,39`, add `/agency/register` and `/driver/register` to `public/sitemap.xml` (Section 7). Effort S.

---

## 10. Feature ideas buildable in under an hour each

1. Mobile menu on the landing page (reuse the existing header links) — `LandingPage.tsx:136`.
2. "Book a demo" button on the landing and pricing pages that opens `/contact?subject=Sales` (the subject list exists: `ContactPage.tsx:17`).
3. Per-route `document.title` helper for landing and legal pages.
4. Plan-card badge "Most popular" already exists for Growth; add a "14-day trial" tag for Starter when the viewer is not signed in.
5. Live "trucks left in your plan" meter on `/management/trucks` using `trucks_limit` from the DB (`PricingPage.tsx` already fetches limits).
6. Empty-state card on Dashboard that links to Book Truck when there are no shipments (copy exists in `Dashboard.tsx`).
7. Copy-to-clipboard "Share tracking link" button on History rows, reusing `shareTrackingLink` (`TrackingPage.tsx`).
8. Read-only "Pricing FAQ" accordion on `/pricing` using the approved draft answers (no new backend).

---

## Evidence limits

- Static reading only. No browser run, no test run, no call to the live Supabase project. A-1 (agency loop) and A-2 are inferred from code and should be confirmed with one real attempt on staging.
- Route existence was checked in `App.tsx`; backend function presence was checked by file name in `supabase/functions`, not by deployment status.
- Legal and pricing text reflects the repository at this commit, not what is published on truckopti.in.
