-- ============================================================================================
-- PRE-FLIGHT INVENTORY for the OLD production Supabase project (read-only)
-- ============================================================================================
-- Paste ONE block at a time into the production SQL editor (select the block, press "Run selected").
-- The editor shows only the result of the LAST statement it ran, so running the whole file at once
-- would hide everything except Q51.
--
-- Every statement is a plain SELECT: nothing here inserts, updates, deletes, creates or alters.
-- It is safe on the real production database. Nothing here needs the `supabase` CLI.
-- Save each result (CSV/screenshot) next to this file in evidence/prod-rehearsal/ before any push.
--
-- Why each block exists is in evidence/prod-rehearsal/README.md. Blocks marked [HAZARD] are the
-- data patterns that make a newer migration fail or silently change rows (found by scripts/prod/legacy_replay.mjs).
-- A hazard block that returns ZERO rows is good news. If a block errors with "column does not exist" or
-- "relation does not exist", that is information too (the old project is older than assumed): note it.

-- Q01 -- which migrations does production think it has applied? (decides the real cut-off)
SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version;

-- Q02 -- the last applied version, and how many versions the repo has that production lacks
--        (repo chain: 76 files, newest 20261045000000)
SELECT max(version) AS last_applied_version, count(*) AS applied_count
  FROM supabase_migrations.schema_migrations;

-- Q03 -- PostgreSQL version and server settings that matter
SELECT version() AS postgres_version, current_setting('server_version') AS server_version, current_setting('TimeZone') AS time_zone;

-- Q04 -- installed extensions (pgcrypto/uuid-ossp used by the chain; pg_cron schedules the subscription sweeps)
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- Q05 -- extensions the platform could install (is pg_cron available for the hourly sweeps?)
SELECT name, default_version, installed_version
  FROM pg_available_extensions
 WHERE name IN ('pg_cron', 'pgcrypto', 'uuid-ossp', 'pg_net', 'pgjwt')
 ORDER BY name;

-- Q06 -- exact row count of EVERY public table (keep this: it is the "before" figure for the loss check)
SELECT table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS row_count
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
 ORDER BY table_name;

-- Q07 -- public tables WITHOUT row level security (should be none, or only deliberate lookup tables)
SELECT c.relname AS table_without_rls
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
 ORDER BY 1;

-- Q08 -- tables with RLS on but no policy at all (locked to everyone except service_role)
SELECT c.relname AS rls_on_no_policy
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
 ORDER BY 1;

-- Q09 -- objects the newest migration (20261045) creates only IF MISSING: do they already exist?
SELECT to_regclass('public.agency_rate_cards') AS agency_rate_cards_table,
       (SELECT count(*) FROM storage.buckets WHERE id = 'avatars') AS avatars_bucket_exists;

-- Q10 -- every storage bucket, public or private (KYC and billing documents must NOT be public)
SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;

-- Q11 -- scheduled jobs (pg_cron). Returns a message instead of failing if pg_cron is not installed.
SELECT CASE WHEN to_regclass('cron.job') IS NULL
            THEN 'pg_cron is not installed'
            ELSE query_to_xml('SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid', false, false, '')::text
       END AS cron_jobs;

-- ----------------------------------------------------------------------------------------------
-- Subscriptions (20261026 is the riskiest file: it rewrites status, price_yearly and attaches rows to agencies)
-- ----------------------------------------------------------------------------------------------

-- Q20 -- the CHECK constraints and unique indexes that exist on subscriptions today
SELECT conname AS name, contype AS kind, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.subscriptions'::regclass
 ORDER BY contype, conname;

-- Q21 -- [HAZARD] every distinct subscriptions.status with counts.
--        Anything outside trial/active/paused/cancelled/expired makes 20261026 abort (new CHECK fails to apply).
--        'paused' rows are silently rewritten to 'cancelled'.
SELECT status, count(*) AS subscriptions
  FROM public.subscriptions
 GROUP BY status
 ORDER BY count(*) DESC, status;

-- Q22 -- distinct plan values: plan x billing cycle x status, with counts
SELECT p.tier, p.name AS plan, s.billing_cycle, s.status, count(*) AS subscriptions
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
 GROUP BY p.tier, p.name, s.billing_cycle, s.status
 ORDER BY p.tier, s.billing_cycle, s.status;

-- Q23 -- plan prices today (20261026 rewrites price_yearly to exactly 10 x monthly, in paise)
SELECT name, tier, price_monthly, price_yearly,
       price_monthly * 10 AS yearly_after_migration,
       price_monthly * 10 - price_yearly AS yearly_change_paise,
       trucks_limit, is_active
  FROM public.subscription_plans
 ORDER BY price_monthly;

-- Q24 -- [HAZARD] users who own MORE THAN ONE agency (the backfill picks the oldest APPROVED one, else the oldest)
SELECT ta.user_id, u.email, count(*) AS agencies,
       string_agg(ta.company_name || ' [' || ta.status || ', created ' || ta.created_at::date || ']', ' | ' ORDER BY ta.created_at) AS agencies_detail
  FROM public.transport_agencies ta
  LEFT JOIN public.users u ON u.id = ta.user_id
 GROUP BY ta.user_id, u.email
HAVING count(*) > 1
 ORDER BY count(*) DESC;

-- Q25 -- [HAZARD] subscriptions whose user owns NO agency (they are kept but NEVER entitle after 20261026)
SELECT s.id AS subscription_id, s.status, p.tier, s.billing_cycle, s.current_period_end, u.email, u.role
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  LEFT JOIN public.users u ON u.id = s.user_id
 WHERE NOT EXISTS (SELECT 1 FROM public.transport_agencies ta WHERE ta.user_id = s.user_id)
 ORDER BY (s.status = 'active') DESC, s.current_period_end DESC;

-- Q26 -- [HAZARD] agencies that share a GSTIN or a phone once normalised the way the trial-claim table does
--        (upper+trim GSTIN; last 10 digits of phone). Only the first agency gets a trial claim row.
SELECT 'gstin' AS shared_on, upper(btrim(gstin)) AS value, count(*) AS agencies, string_agg(company_name, ' | ') AS names
  FROM public.transport_agencies
 WHERE nullif(upper(btrim(coalesce(gstin, ''))), '') IS NOT NULL
 GROUP BY upper(btrim(gstin))
HAVING count(*) > 1
UNION ALL
SELECT 'phone', right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10), count(*), string_agg(company_name, ' | ')
  FROM public.transport_agencies
 WHERE length(regexp_replace(coalesce(contact_phone, ''), '[^0-9]', '', 'g')) >= 10
 GROUP BY right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10)
HAVING count(*) > 1;

-- Q27 -- [HAZARD] subscriptions with a zero or negative billing period (the new period CHECK is added NOT VALID,
--        and then EVERY run of run_subscription_sweeps fails on such a row, so no subscription is ever swept)
SELECT s.id, s.status, s.current_period_start, s.current_period_end, u.email
  FROM public.subscriptions s
  LEFT JOIN public.users u ON u.id = s.user_id
 WHERE s.current_period_end <= s.current_period_start;

-- Q28 -- [HAZARD] live subscriptions that the first hourly sweep will move immediately
--        (trial past trial_end -> expired; active/past_due past period end -> grace, then expired 7 days later)
SELECT s.id, s.status, s.trial_end, s.current_period_end, u.email,
       CASE WHEN s.status = 'trial' AND s.trial_end IS NOT NULL AND s.trial_end <= now() THEN 'trial -> expired'
            WHEN s.status IN ('active', 'past_due') AND s.current_period_end <= now() THEN 'active -> grace'
            WHEN s.status = 'trial' AND s.trial_end IS NULL THEN 'trial with NO trial_end: never swept'
       END AS first_sweep_outcome
  FROM public.subscriptions s
  LEFT JOIN public.users u ON u.id = s.user_id
 WHERE s.status IN ('trial', 'active', 'past_due')
   AND ((s.status = 'trial' AND (s.trial_end IS NULL OR s.trial_end <= now()))
     OR (s.status IN ('active', 'past_due') AND s.current_period_end <= now()))
 ORDER BY s.current_period_end;

-- Q29 -- legacy billing rows that are NOT carried over to the new tenant ledger (they keep working as history only)
SELECT (SELECT count(*) FROM public.invoices) AS legacy_invoices,
       (SELECT count(*) FROM public.payment_history) AS legacy_payment_history,
       (SELECT count(*) FROM public.payment_history WHERE status = 'success') AS successful_payments,
       (SELECT coalesce(sum(total_amount), 0) FROM public.invoices WHERE status = 'paid') AS paid_invoice_total_paise,
       (SELECT count(*) FROM public.addon_purchases) AS addon_purchases;

-- Q30 -- trial / razorpay linkage in use (are real Razorpay subscriptions attached?)
SELECT count(*) FILTER (WHERE razorpay_subscription_id IS NOT NULL) AS with_razorpay_subscription,
       count(*) FILTER (WHERE razorpay_customer_id IS NOT NULL) AS with_razorpay_customer,
       count(*) AS total
  FROM public.subscriptions;

-- ----------------------------------------------------------------------------------------------
-- Fleet and driver data (20261008, 20261015, 20260601, 20261003, 20261017)
-- ----------------------------------------------------------------------------------------------

-- Q40 -- [HAZARD] two trucks with the same RC number in the SAME agency (20261008 adds UNIQUE (agency_id, rc_number): it aborts)
SELECT agency_id, rc_number, count(*) AS trucks, array_agg(id) AS truck_ids
  FROM public.agency_trucks
 GROUP BY agency_id, rc_number
HAVING count(*) > 1;

-- Q41 -- [HAZARD] the same driver attached to more than one agency truck (20261015 raises and aborts)
SELECT driver_id, count(*) AS trucks, array_agg(id) AS truck_ids
  FROM public.agency_trucks
 WHERE driver_id IS NOT NULL
 GROUP BY driver_id
HAVING count(*) > 1;

-- Q42 -- [HAZARD] truck catalogue rows (20261008 maps these 8 names to codes and REFUSES to continue if any other name exists)
SELECT id, name,
       name IN ('Tata Ace', 'Tata 407', 'Eicher 14ft', 'Eicher 17ft', 'Ashok Leyland 19ft', 'BharatBenz 24ft', 'BharatBenz 32ft', 'Volvo 40ft Container') AS has_code_mapping
  FROM public.trucks
 ORDER BY has_code_mapping, name;

-- Q43 -- agency truck vehicle_type values (the new catalogue FK is added NOT VALID: values that are not codes stay unchecked)
SELECT vehicle_type, count(*) AS trucks FROM public.agency_trucks GROUP BY vehicle_type ORDER BY count(*) DESC;

-- Q44 -- [HAZARD, silent] job offers whose OTP the 4-digit migration will REPLACE with a random one (NULL, blank, or not 4 digits)
SELECT status,
       count(*) FILTER (WHERE pickup_otp IS NULL OR pickup_otp = '' OR pickup_otp !~ '^[0-9]{4}$') AS pickup_otp_will_change,
       count(*) FILTER (WHERE delivery_otp IS NULL OR delivery_otp = '' OR delivery_otp !~ '^[0-9]{4}$') AS delivery_otp_will_change,
       count(*) AS offers
  FROM public.job_offers
 GROUP BY status
 ORDER BY status;

-- Q45 -- [HAZARD, silent] driver document URLs that 20261003 sets to NULL (they pointed at the old PUBLIC driver-docs bucket)
SELECT count(*) FILTER (WHERE dl_url LIKE '%/storage/v1/object/public/driver-docs/%') AS dl_url_nulled,
       count(*) FILTER (WHERE rc_url LIKE '%/storage/v1/object/public/driver-docs/%') AS rc_url_nulled,
       count(*) FILTER (WHERE insurance_url LIKE '%/storage/v1/object/public/driver-docs/%') AS insurance_url_nulled,
       count(*) FILTER (WHERE selfie_url LIKE '%/storage/v1/object/public/driver-docs/%') AS selfie_url_nulled,
       count(*) AS drivers
  FROM public.drivers;

-- Q46 -- payouts that stay outside the new "amount > 0" rule (added NOT VALID: old rows are left, new ones are checked)
SELECT id, driver_id, amount, status, type FROM public.driver_payouts WHERE amount <= 0;

-- Q47 -- PAN gaps (a trigger demands a valid PAN on every INSERT and on approval)
SELECT 'customers' AS tbl, count(*) FILTER (WHERE pan_number IS NULL OR pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$') AS without_valid_pan, count(*) AS total FROM public.customers
UNION ALL
SELECT 'drivers', count(*) FILTER (WHERE pan_number IS NULL OR pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'), count(*) FROM public.drivers
UNION ALL
SELECT 'transport_agencies', count(*) FILTER (WHERE pan_number IS NULL OR pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'), count(*) FROM public.transport_agencies;

-- Q48 -- agencies by status and drivers by status (what the new approval/status guards will see)
SELECT 'agency' AS kind, status, count(*) FROM public.transport_agencies GROUP BY status
UNION ALL
SELECT 'driver', status, count(*) FROM public.drivers GROUP BY status
 ORDER BY 1, 2;

-- Q49 -- users by role (the role guard rejects values outside admin/manager/driver/user)
SELECT role, count(*) AS users FROM public.users GROUP BY role ORDER BY role;

-- Q50 -- NOT VALID constraints and any non-trivial CHECK already on production tables (drift against the repo)
SELECT conrelid::regclass::text AS tbl, conname, contype, convalidated, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace AND contype IN ('c', 'u', 'f') AND (NOT convalidated OR contype = 'c')
 ORDER BY 1, 2;

-- Q51 -- functions in public that the migrations will REPLACE (look for hand-edited production versions: compare the owner and dates)
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, md5(pg_get_functiondef(p.oid)) AS body_md5
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
 ORDER BY p.proname;
