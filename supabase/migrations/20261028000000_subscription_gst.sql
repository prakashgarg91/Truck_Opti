-- TO-152 S6: subscription GST. Platform billing settings, gap-free invoice numbering, the
-- integer-paise tax split, place of supply, and the append-only invoice and credit-note ledgers.
--
-- Rules (docs/TO-152-rulings.md section 5):
--   * Money is integer paise (bigint) only. Same state: CGST = SGST = half-up(taxable x 18 / 200).
--     Different state: IGST = half-up(taxable x 18 / 100). No rupee round-off.
--   * Financial year starts 1 April in Asia/Kolkata. Invoice series TO and credit-note series CN count
--     independently, per financial year, gap-free: the counter row is locked inside the caller's
--     transaction, so a rolled-back activation hands the number back.
--   * subscription_invoices and subscription_credit_notes are append-only for every ordinary role
--     (service_role included; the table owner and superuser too while the triggers stay in place, but
--     a superuser or owner can still disable triggers, so that is an operational control, not a
--     cryptographic one): UPDATE/DELETE/TRUNCATE are refused by triggers, and the privileges are not
--     granted. A credit note can never take the cumulative credit above the invoice.
--   * Numbers cannot be forged: a BEFORE INSERT trigger requires the ledger row's number to equal the
--     current counter value, so gap-freeness does not rest on callers behaving (superusers exempt).
--   * Each ledger row's financial year must agree with its issued_at (Asia/Kolkata, April start).
--   * State codes 04 (Chandigarh), 26 (Dadra and Nagar Haveli and Daman and Diu), 31 (Lakshadweep),
--     35 (Andaman and Nicobar) and 38 (Ladakh) are UTGST jurisdictions in law; here that is a LABEL
--     difference only (CGST+UTGST instead of CGST+SGST). Columns and maths are identical, so the
--     sgst_paise columns carry UTGST for those codes.
--   * Everything except platform_billing_settings_update is service-only (no PUBLIC/anon/authenticated).
-- Nothing here edits an earlier migration.

-- ---------------------------------------------------------------------------
-- Platform billing settings (single row; edited only through the admin command)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_billing_settings (
  legal_name TEXT,
  gstin TEXT,
  address TEXT,
  state_code TEXT,
  sac_code TEXT NOT NULL DEFAULT '997331',
  enforcement_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

-- Idempotent against an earlier definition of the same table.
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS state_code TEXT;
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS sac_code TEXT NOT NULL DEFAULT '997331';
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS enforcement_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.platform_billing_settings DROP CONSTRAINT IF EXISTS platform_billing_settings_gstin_chk;
ALTER TABLE public.platform_billing_settings ADD CONSTRAINT platform_billing_settings_gstin_chk
  CHECK (gstin IS NULL OR gstin ~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
ALTER TABLE public.platform_billing_settings DROP CONSTRAINT IF EXISTS platform_billing_settings_state_chk;
ALTER TABLE public.platform_billing_settings ADD CONSTRAINT platform_billing_settings_state_chk
  CHECK (state_code IS NULL OR state_code ~ '^(0[1-9]|[12][0-9]|3[0-8])$');
ALTER TABLE public.platform_billing_settings DROP CONSTRAINT IF EXISTS platform_billing_settings_gstin_state_chk;
ALTER TABLE public.platform_billing_settings ADD CONSTRAINT platform_billing_settings_gstin_state_chk
  CHECK (gstin IS NULL OR state_code IS NULL OR left(gstin, 2) = state_code);
ALTER TABLE public.platform_billing_settings DROP CONSTRAINT IF EXISTS platform_billing_settings_sac_chk;
ALTER TABLE public.platform_billing_settings ADD CONSTRAINT platform_billing_settings_sac_chk
  CHECK (sac_code ~ '^[0-9]{6,8}$');
ALTER TABLE public.platform_billing_settings DROP CONSTRAINT IF EXISTS platform_billing_settings_text_chk;
ALTER TABLE public.platform_billing_settings ADD CONSTRAINT platform_billing_settings_text_chk
  CHECK ((legal_name IS NULL OR btrim(legal_name) <> '') AND (address IS NULL OR btrim(address) <> ''));

-- Exactly one row: a unique index over a constant.
CREATE UNIQUE INDEX IF NOT EXISTS platform_billing_settings_single ON public.platform_billing_settings ((TRUE));

INSERT INTO public.platform_billing_settings (sac_code, enforcement_enabled)
SELECT '997331', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.platform_billing_settings);

-- The row can never be deleted or truncated, by any role.
CREATE OR REPLACE FUNCTION public.platform_billing_settings_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'platform_billing_settings_protected: % is not allowed.', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS platform_billing_settings_no_delete ON public.platform_billing_settings;
CREATE TRIGGER platform_billing_settings_no_delete
  BEFORE DELETE ON public.platform_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.platform_billing_settings_no_delete();
DROP TRIGGER IF EXISTS platform_billing_settings_no_truncate ON public.platform_billing_settings;
CREATE TRIGGER platform_billing_settings_no_truncate
  BEFORE TRUNCATE ON public.platform_billing_settings
  FOR EACH STATEMENT EXECUTE FUNCTION public.platform_billing_settings_no_delete();

ALTER TABLE public.platform_billing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_billing_settings_admin_select ON public.platform_billing_settings;
CREATE POLICY platform_billing_settings_admin_select ON public.platform_billing_settings
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.platform_billing_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.platform_billing_settings TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_billing_settings_update(
  p_legal_name text,
  p_gstin text,
  p_address text,
  p_state_code text,
  p_sac_code text,
  p_enforcement_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_legal_name IS NULL OR btrim(p_legal_name) = '' THEN
    RAISE EXCEPTION 'invalid_legal_name' USING ERRCODE = '22023';
  END IF;
  IF p_gstin IS NULL OR p_gstin !~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'invalid_gstin' USING ERRCODE = '22023';
  END IF;
  IF p_address IS NULL OR btrim(p_address) = '' THEN
    RAISE EXCEPTION 'invalid_address' USING ERRCODE = '22023';
  END IF;
  IF p_state_code IS NULL OR p_state_code !~ '^(0[1-9]|[12][0-9]|3[0-8])$' THEN
    RAISE EXCEPTION 'invalid_state_code' USING ERRCODE = '22023';
  END IF;
  IF left(p_gstin, 2) <> p_state_code THEN
    RAISE EXCEPTION 'gstin_state_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_sac_code IS NULL OR p_sac_code !~ '^[0-9]{6,8}$' THEN
    RAISE EXCEPTION 'invalid_sac_code' USING ERRCODE = '22023';
  END IF;
  IF p_enforcement_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_enforcement_enabled' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_billing_settings
     SET legal_name = btrim(p_legal_name),
         gstin = p_gstin,
         address = btrim(p_address),
         state_code = p_state_code,
         sac_code = p_sac_code,
         enforcement_enabled = p_enforcement_enabled,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE TRUE;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ---------------------------------------------------------------------------
-- Invoice number counters (gap-free per series per financial year)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_invoice_counters (
  series TEXT NOT NULL CHECK (series IN ('TO', 'CN')),
  fy TEXT NOT NULL CHECK (fy ~ '^[0-9]{2}-[0-9]{2}$'),
  last_no BIGINT NOT NULL CHECK (last_no >= 1 AND last_no <= 999999),
  PRIMARY KEY (series, fy)
);

ALTER TABLE public.subscription_invoice_counters ENABLE ROW LEVEL SECURITY;

-- A counter only ever moves forward by exactly one; it cannot be rewound, deleted or truncated.
CREATE OR REPLACE FUNCTION public.subscription_invoice_counters_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.series IS DISTINCT FROM OLD.series OR NEW.fy IS DISTINCT FROM OLD.fy OR NEW.last_no <> OLD.last_no + 1 THEN
      RAISE EXCEPTION 'invoice_counter_protected: a counter only advances by one.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invoice_counter_protected: % is not allowed.', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS subscription_invoice_counters_guard ON public.subscription_invoice_counters;
CREATE TRIGGER subscription_invoice_counters_guard
  BEFORE UPDATE OR DELETE ON public.subscription_invoice_counters
  FOR EACH ROW EXECUTE FUNCTION public.subscription_invoice_counters_guard();
DROP TRIGGER IF EXISTS subscription_invoice_counters_no_truncate ON public.subscription_invoice_counters;
CREATE TRIGGER subscription_invoice_counters_no_truncate
  BEFORE TRUNCATE ON public.subscription_invoice_counters
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_invoice_counters_guard();

-- Read-only to service_role: numbers are minted only by subscription_next_invoice_number.
REVOKE ALL ON public.subscription_invoice_counters FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscription_invoice_counters TO service_role;

CREATE OR REPLACE FUNCTION public.subscription_next_invoice_number(p_series text, p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local timestamp;
  v_start integer;
  v_fy text;
  v_no bigint;
BEGIN
  IF p_series IS NULL OR p_series NOT IN ('TO', 'CN') THEN
    RAISE EXCEPTION 'invalid_series' USING ERRCODE = '22023';
  END IF;
  IF p_at IS NULL OR NOT isfinite(p_at) THEN
    RAISE EXCEPTION 'invalid_timestamp' USING ERRCODE = '22023';
  END IF;

  -- Financial year: 1 April 00:00 Asia/Kolkata (UTC+5:30), never the UTC date.
  v_local := p_at AT TIME ZONE 'Asia/Kolkata';
  v_start := CASE WHEN extract(month FROM v_local) >= 4 THEN extract(year FROM v_local)::integer ELSE extract(year FROM v_local)::integer - 1 END;
  IF v_start < 2017 OR v_start > 2098 THEN
    RAISE EXCEPTION 'invalid_timestamp' USING ERRCODE = '22023';
  END IF;
  v_fy := lpad((v_start % 100)::text, 2, '0') || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');

  -- The upsert takes the counter row lock; concurrent callers queue on it, and a rollback of the
  -- caller's transaction returns the number, so the series stays gap-free.
  INSERT INTO public.subscription_invoice_counters AS c (series, fy, last_no)
  VALUES (p_series, v_fy, 1)
  ON CONFLICT (series, fy) DO UPDATE SET last_no = c.last_no + 1
  RETURNING c.last_no INTO v_no;

  IF v_no > 999999 THEN
    RAISE EXCEPTION 'invoice_sequence_exhausted' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  RETURN p_series || '/' || v_fy || '/' || lpad(v_no::text, 6, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Place of supply
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_place_of_supply(p_gstin text, p_agency_state text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gstin text := upper(btrim(coalesce(p_gstin, '')));
  v_name text;
  v_code text;
BEGIN
  IF v_gstin ~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RETURN left(v_gstin, 2);
  END IF;

  v_name := btrim(regexp_replace(replace(lower(coalesce(p_agency_state, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g'));
  v_code := CASE v_name
    WHEN 'jammu and kashmir' THEN '01'
    WHEN 'himachal pradesh' THEN '02'
    WHEN 'punjab' THEN '03'
    WHEN 'chandigarh' THEN '04'
    WHEN 'uttarakhand' THEN '05'
    WHEN 'uttaranchal' THEN '05'
    WHEN 'haryana' THEN '06'
    WHEN 'delhi' THEN '07'
    WHEN 'new delhi' THEN '07'
    WHEN 'nct of delhi' THEN '07'
    WHEN 'national capital territory of delhi' THEN '07'
    WHEN 'rajasthan' THEN '08'
    WHEN 'uttar pradesh' THEN '09'
    WHEN 'bihar' THEN '10'
    WHEN 'sikkim' THEN '11'
    WHEN 'arunachal pradesh' THEN '12'
    WHEN 'nagaland' THEN '13'
    WHEN 'manipur' THEN '14'
    WHEN 'mizoram' THEN '15'
    WHEN 'tripura' THEN '16'
    WHEN 'meghalaya' THEN '17'
    WHEN 'assam' THEN '18'
    WHEN 'west bengal' THEN '19'
    WHEN 'jharkhand' THEN '20'
    WHEN 'odisha' THEN '21'
    WHEN 'orissa' THEN '21'
    WHEN 'chhattisgarh' THEN '22'
    WHEN 'chattisgarh' THEN '22'
    WHEN 'madhya pradesh' THEN '23'
    WHEN 'gujarat' THEN '24'
    WHEN 'dadra and nagar haveli and daman and diu' THEN '26'
    WHEN 'dadra and nagar haveli' THEN '26'
    WHEN 'daman and diu' THEN '26'
    WHEN 'maharashtra' THEN '27'
    WHEN 'karnataka' THEN '29'
    WHEN 'goa' THEN '30'
    WHEN 'lakshadweep' THEN '31'
    WHEN 'kerala' THEN '32'
    WHEN 'tamil nadu' THEN '33'
    WHEN 'puducherry' THEN '34'
    WHEN 'pondicherry' THEN '34'
    WHEN 'andaman and nicobar islands' THEN '35'
    WHEN 'andaman and nicobar' THEN '35'
    WHEN 'telangana' THEN '36'
    WHEN 'andhra pradesh' THEN '37'
    WHEN 'ladakh' THEN '38'
    ELSE NULL
  END;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'BILLING_STATE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tax split (pure; typed refusals come from the checked helper)
-- ---------------------------------------------------------------------------
-- Largest taxable amount the split accepts: 1e15 paise (1e13 rupees). 18 x this still fits bigint
-- with a wide margin, so no intermediate can overflow.
CREATE OR REPLACE FUNCTION public.subscription_tax_checked(p_taxable_paise bigint, p_supplier_state text, p_pos_state text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_taxable_paise IS NULL OR p_taxable_paise <= 0 THEN
    RAISE EXCEPTION 'invalid_taxable' USING ERRCODE = '22023';
  END IF;
  IF p_taxable_paise > 1000000000000000 THEN
    RAISE EXCEPTION 'amount_overflow' USING ERRCODE = '22003';
  END IF;
  IF p_supplier_state IS NULL OR p_supplier_state !~ '^(0[1-9]|[12][0-9]|3[0-8])$'
     OR p_pos_state IS NULL OR p_pos_state !~ '^(0[1-9]|[12][0-9]|3[0-8])$' THEN
    RAISE EXCEPTION 'invalid_state_code' USING ERRCODE = '22023';
  END IF;
  RETURN p_taxable_paise;
END;
$$;

-- The checked taxable value feeds every computation, so validation always runs before arithmetic.
CREATE OR REPLACE FUNCTION public.subscription_tax_split(p_taxable_paise bigint, p_supplier_state text, p_pos_state text)
RETURNS TABLE (cgst_paise bigint, sgst_paise bigint, igst_paise bigint, total_paise bigint)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE WHEN p_supplier_state = p_pos_state THEN s.half_up_same ELSE 0::bigint END,
    CASE WHEN p_supplier_state = p_pos_state THEN s.half_up_same ELSE 0::bigint END,
    CASE WHEN p_supplier_state = p_pos_state THEN 0::bigint ELSE s.half_up_inter END,
    s.t + CASE WHEN p_supplier_state = p_pos_state THEN 2 * s.half_up_same ELSE s.half_up_inter END
  FROM (
    SELECT c.t,
           (18 * c.t + 100) / 200 AS half_up_same,
           (18 * c.t + 50) / 100 AS half_up_inter
      FROM (SELECT public.subscription_tax_checked(p_taxable_paise, p_supplier_state, p_pos_state) AS t) c
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- Invoices (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT 'TO' CHECK (series = 'TO'),
  fy TEXT NOT NULL,
  supplier_legal_name TEXT CHECK (supplier_legal_name IS NULL OR btrim(supplier_legal_name) <> ''),
  supplier_address TEXT CHECK (supplier_address IS NULL OR btrim(supplier_address) <> ''),
  supplier_gstin TEXT NOT NULL CHECK (supplier_gstin ~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  supplier_state_code TEXT NOT NULL CHECK (supplier_state_code ~ '^(0[1-9]|[12][0-9]|3[0-8])$'),
  recipient_name TEXT CHECK (recipient_name IS NULL OR btrim(recipient_name) <> ''),
  recipient_address TEXT CHECK (recipient_address IS NULL OR btrim(recipient_address) <> ''),
  recipient_gstin TEXT CHECK (recipient_gstin IS NULL OR recipient_gstin ~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  place_of_supply_state_code TEXT NOT NULL CHECK (place_of_supply_state_code ~ '^(0[1-9]|[12][0-9]|3[0-8])$'),
  sac_code TEXT NOT NULL CHECK (sac_code ~ '^[0-9]{6,8}$'),
  gst_rate_pct INTEGER NOT NULL DEFAULT 18 CHECK (gst_rate_pct = 18),
  taxable_paise BIGINT NOT NULL CHECK (taxable_paise > 0 AND taxable_paise <= 1000000000000000),
  cgst_paise BIGINT NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise BIGINT NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise BIGINT NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  total_paise BIGINT NOT NULL CHECK (total_paise > 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_invoices_number_key UNIQUE (invoice_number),
  CONSTRAINT subscription_invoices_tenant_key UNIQUE (id, agency_id),
  CONSTRAINT subscription_invoices_fy_chk CHECK (
    CASE WHEN fy ~ '^[0-9]{2}-[0-9]{2}$' THEN (substr(fy, 1, 2)::integer + 1) % 100 = substr(fy, 4, 2)::integer ELSE FALSE END
  ),
  -- fy is the Asia/Kolkata financial year (1 April start) of issued_at.
  CONSTRAINT subscription_invoices_fy_issued_chk CHECK (
    fy = lpad((extract(year FROM (issued_at AT TIME ZONE 'Asia/Kolkata' - interval '3 months'))::int % 100)::text, 2, '0')
      || '-' || lpad(((extract(year FROM (issued_at AT TIME ZONE 'Asia/Kolkata' - interval '3 months'))::int + 1) % 100)::text, 2, '0')
  ),
  CONSTRAINT subscription_invoices_number_chk CHECK (invoice_number ~ ('^' || series || '/' || fy || '/[0-9]{6}$')),
  CONSTRAINT subscription_invoices_supplier_state_chk CHECK (left(supplier_gstin, 2) = supplier_state_code),
  CONSTRAINT subscription_invoices_recipient_state_chk CHECK (recipient_gstin IS NULL OR left(recipient_gstin, 2) = place_of_supply_state_code),
  -- Same state: CGST = SGST = half-up(taxable x rate / 200), no IGST. Else IGST = half-up(taxable x rate / 100).
  -- Computed in numeric so a bad row can never raise an overflow before the rule is judged.
  CONSTRAINT subscription_invoices_tax_rule CHECK (
    CASE WHEN supplier_state_code = place_of_supply_state_code
      THEN igst_paise = 0 AND cgst_paise = sgst_paise
           AND cgst_paise = trunc((gst_rate_pct::numeric * taxable_paise + 100) / 200)
      ELSE cgst_paise = 0 AND sgst_paise = 0
           AND igst_paise = trunc((gst_rate_pct::numeric * taxable_paise + 50) / 100)
    END
  ),
  CONSTRAINT subscription_invoices_total_chk CHECK (total_paise = taxable_paise + cgst_paise + sgst_paise + igst_paise)
);

CREATE INDEX IF NOT EXISTS subscription_invoices_by_agency ON public.subscription_invoices (agency_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_credit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  credit_note_number TEXT NOT NULL CHECK (credit_note_number ~ '^CN/[0-9]{2}-[0-9]{2}/[0-9]{6}$'),
  refund_id TEXT NOT NULL CHECK (btrim(refund_id) <> ''),
  taxable_paise BIGINT NOT NULL CHECK (taxable_paise > 0 AND taxable_paise <= 1000000000000000),
  cgst_paise BIGINT NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise BIGINT NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise BIGINT NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  total_paise BIGINT NOT NULL CHECK (total_paise > 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_credit_notes_invoice_fk
    FOREIGN KEY (invoice_id, agency_id)
    REFERENCES public.subscription_invoices (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT subscription_credit_notes_number_key UNIQUE (credit_note_number),
  -- The FY inside the number (CN/yy-yy/nnnnnn) is the Asia/Kolkata financial year of issued_at.
  CONSTRAINT subscription_credit_notes_fy_issued_chk CHECK (
    substr(credit_note_number, 4, 5) =
      lpad((extract(year FROM (issued_at AT TIME ZONE 'Asia/Kolkata' - interval '3 months'))::int % 100)::text, 2, '0')
      || '-' || lpad(((extract(year FROM (issued_at AT TIME ZONE 'Asia/Kolkata' - interval '3 months'))::int + 1) % 100)::text, 2, '0')
  ),
  CONSTRAINT subscription_credit_notes_refund_key UNIQUE (refund_id),
  CONSTRAINT subscription_credit_notes_tax_shape CHECK (cgst_paise = sgst_paise AND (cgst_paise = 0 OR igst_paise = 0)),
  CONSTRAINT subscription_credit_notes_total_chk CHECK (total_paise = taxable_paise + cgst_paise + sgst_paise + igst_paise)
);

CREATE INDEX IF NOT EXISTS subscription_credit_notes_by_invoice ON public.subscription_credit_notes (invoice_id);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_credit_notes ENABLE ROW LEVEL SECURITY;

-- Tenant read: the agency owner and finance scope (and platform admins); nobody writes through the API.
DROP POLICY IF EXISTS subscription_invoices_select ON public.subscription_invoices;
CREATE POLICY subscription_invoices_select ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[]))
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS subscription_credit_notes_select ON public.subscription_credit_notes;
CREATE POLICY subscription_credit_notes_select ON public.subscription_credit_notes
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[]))
    OR public.is_admin_user()
  );

-- service_role may only read and insert: no UPDATE, DELETE or TRUNCATE privilege for any API role.
REVOKE ALL ON public.subscription_invoices, public.subscription_credit_notes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscription_invoices, public.subscription_credit_notes TO authenticated;
GRANT SELECT, INSERT ON public.subscription_invoices, public.subscription_credit_notes TO service_role;

-- Append-only for every role while these triggers exist (owner and superuser can still disable them).
CREATE OR REPLACE FUNCTION public.subscription_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ledger_append_only: % is append-only, % is not allowed.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS subscription_invoices_append_only ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.subscription_ledger_append_only();
DROP TRIGGER IF EXISTS subscription_invoices_no_truncate ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_no_truncate
  BEFORE TRUNCATE ON public.subscription_invoices
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_ledger_append_only();

DROP TRIGGER IF EXISTS subscription_credit_notes_append_only ON public.subscription_credit_notes;
CREATE TRIGGER subscription_credit_notes_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.subscription_ledger_append_only();
DROP TRIGGER IF EXISTS subscription_credit_notes_no_truncate ON public.subscription_credit_notes;
CREATE TRIGGER subscription_credit_notes_no_truncate
  BEFORE TRUNCATE ON public.subscription_credit_notes
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_ledger_append_only();

-- Number guard: the row's number must be exactly the counter's current value for its series and FY,
-- so a caller with INSERT cannot skip, reuse or invent a number. The minting call and the insert must
-- share a transaction (the counter row stays locked until then); minting two numbers before inserting
-- either is refused on purpose. Superusers (migrations, break-glass repair) are exempt.
CREATE OR REPLACE FUNCTION public.subscription_ledger_number_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_series text;
  v_fy text;
  v_number text;
  v_last bigint;
BEGIN
  IF coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), FALSE) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'subscription_invoices' THEN
    v_series := NEW.series; v_fy := NEW.fy; v_number := NEW.invoice_number;
  ELSE
    v_series := 'CN'; v_fy := substr(NEW.credit_note_number, 4, 5); v_number := NEW.credit_note_number;
  END IF;
  SELECT last_no INTO v_last FROM public.subscription_invoice_counters WHERE series = v_series AND fy = v_fy;
  IF NOT FOUND OR v_number IS DISTINCT FROM v_series || '/' || v_fy || '/' || lpad(v_last::text, 6, '0') THEN
    RAISE EXCEPTION 'invoice_number_not_minted: % must be the number just minted for % %.', v_number, v_series, v_fy
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_invoices_number_guard ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_number_guard
  BEFORE INSERT ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.subscription_ledger_number_guard();
DROP TRIGGER IF EXISTS subscription_credit_notes_number_guard ON public.subscription_credit_notes;
CREATE TRIGGER subscription_credit_notes_number_guard
  BEFORE INSERT ON public.subscription_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.subscription_ledger_number_guard();

-- Credit-note guard: the agency comes from the invoice (never the caller); the invoice row is locked so
-- concurrent notes serialise; every component and the total stay within the invoice; a note that uses
-- up the full taxable amount must also use up the full tax, so a fully credited invoice nets to zero.
CREATE OR REPLACE FUNCTION public.subscription_credit_note_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv public.subscription_invoices%ROWTYPE;
  v_taxable numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_total numeric;
  v_expect numeric;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_ISOLATION: credit notes must be issued under READ COMMITTED.' USING ERRCODE = 'invalid_transaction_state';
  END IF;
  SELECT * INTO v_inv FROM public.subscription_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_NOTE_INVOICE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.agency_id IS NOT NULL AND NEW.agency_id <> v_inv.agency_id THEN
    RAISE EXCEPTION 'CREDIT_NOTE_AGENCY_MISMATCH' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.agency_id := v_inv.agency_id;
  IF NEW.issued_at < v_inv.issued_at THEN
    RAISE EXCEPTION 'CREDIT_NOTE_BEFORE_INVOICE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(taxable_paise), 0), coalesce(sum(cgst_paise), 0), coalesce(sum(sgst_paise), 0),
         coalesce(sum(igst_paise), 0), coalesce(sum(total_paise), 0)
    INTO v_taxable, v_cgst, v_sgst, v_igst, v_total
    FROM public.subscription_credit_notes WHERE invoice_id = NEW.invoice_id;

  v_taxable := v_taxable + NEW.taxable_paise;
  v_cgst := v_cgst + NEW.cgst_paise;
  v_sgst := v_sgst + NEW.sgst_paise;
  v_igst := v_igst + NEW.igst_paise;
  v_total := v_total + NEW.total_paise;

  IF v_total > v_inv.total_paise OR v_taxable > v_inv.taxable_paise
     OR v_cgst > v_inv.cgst_paise OR v_sgst > v_inv.sgst_paise OR v_igst > v_inv.igst_paise THEN
    RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_INVOICE' USING ERRCODE = 'check_violation';
  END IF;
  IF v_taxable = v_inv.taxable_paise
     AND (v_cgst <> v_inv.cgst_paise OR v_sgst <> v_inv.sgst_paise OR v_igst <> v_inv.igst_paise) THEN
    RAISE EXCEPTION 'CREDIT_NOTE_TAX_INCOMPLETE' USING ERRCODE = 'check_violation';
  END IF;
  -- A note's own tax is within 1 paise of half-up 18% of its own taxable amount (CGST = SGST is
  -- already enforced by the table); only the closing note, which must exhaust the invoice, is exempt.
  IF v_taxable <> v_inv.taxable_paise THEN
    IF v_inv.supplier_state_code = v_inv.place_of_supply_state_code THEN
      v_expect := trunc((18 * NEW.taxable_paise::numeric + 100) / 200);
      IF abs(NEW.cgst_paise - v_expect) > 1 OR abs(NEW.sgst_paise - v_expect) > 1 OR NEW.igst_paise <> 0 THEN
        RAISE EXCEPTION 'CREDIT_NOTE_TAX_MISMATCH' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      v_expect := trunc((18 * NEW.taxable_paise::numeric + 50) / 100);
      IF abs(NEW.igst_paise - v_expect) > 1 OR NEW.cgst_paise <> 0 OR NEW.sgst_paise <> 0 THEN
        RAISE EXCEPTION 'CREDIT_NOTE_TAX_MISMATCH' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_credit_notes_guard ON public.subscription_credit_notes;
CREATE TRIGGER subscription_credit_notes_guard
  BEFORE INSERT ON public.subscription_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.subscription_credit_note_guard();

-- ---------------------------------------------------------------------------
-- Function privileges: explicit; nothing inherited from PUBLIC or the default grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.platform_billing_settings_update(text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_billing_settings_update(text, text, text, text, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.subscription_next_invoice_number(text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_next_invoice_number(text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_place_of_supply(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_place_of_supply(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_tax_checked(bigint, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_tax_checked(bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_tax_split(bigint, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_tax_split(bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_ledger_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.subscription_ledger_number_guard() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_ledger_number_guard() TO service_role;
REVOKE ALL ON FUNCTION public.subscription_credit_note_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.subscription_invoice_counters_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_billing_settings_no_delete() FROM PUBLIC, anon, authenticated, service_role;
