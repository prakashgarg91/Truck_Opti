-- =========================================================
-- TO-144-D1: agency fleet foundation.
--
-- Sorts after 20261007120000_consent_writer_and_job_command.sql and applies
-- after the full existing chain. One forward migration, PGlite-replayable,
-- no destructive ops (policy drops REPLACE policies that this same chain
-- created; column/constraint additions are additive and idempotent).
-- Local proof = scripts/agency_fleet_foundation.db.test.mjs on the full-chain
-- PGlite replay plus the four maintained batteries; hosted replay/rollout is
-- owner-gated (TO-153; no `supabase db push` without owner approval).
--
-- 1. Policy rewrite on public.agency_trucks. Postgres permissive policies
--    OR-combine, so the two existing policies are dropped EXPLICITLY first —
--    adding gated policies beside 20260305010000's agency_truck_owner_all
--    FOR ALL would keep suspended-agency writes alive and make the
--    fail-closed claim dead code. New shape (the TO-142 precedent,
--    20261006120000:29-33): owner OR admin SELECT; owner AND
--    agency_is_operational INSERT/UPDATE; ownership-only DELETE so a
--    suspended tenant's portal keeps rendering and the owner can still
--    remove rows (eligibility makes deletion moot for allocation). The same
--    shape ships on the new public.agency_driver_employment. Tenant identity
--    derives ONLY from transport_agencies.user_id = auth.uid(); no policy
--    accepts a browser-supplied org id.
--
-- 2. Catalog vs owned fleet. public.trucks is the shared catalog
--    (20260107000000:8-31, re-seeded identically by 20260212000000:28-38).
--    It gains a stable `code` key (UNIQUE NOT NULL) backfilled to the exact
--    vehicle_type values the product already uses, and agency_trucks gains a
--    NOT VALID FK to trucks(code) — NOT VALID because the PGlite chain starts
--    empty while any hosted pre-existing fleet rows are unverified; any
--    hosted violation surfaces as a replay FINDING, never invented data.
--    Eligibility reads only real columns (insurance/fitness/permit_expiry and
--    is_available exist since 20260305010000:8-11). The dispatch producer is
--    untouched (dispatch_job_to_drivers takes p_vehicle_type as an argument,
--    20261006130000:47-51).
--
-- 3. agency_trucks additive columns: payload/body dimensions, PUC expiry,
--    maintenance-block fields and an integer `version` for optimistic
--    concurrency. The version trigger bumps exactly once per UPDATE and does
--    NOT double-bump an explicitly set version. It coexists with
--    set_updated_at (20260305010000:44-56) and the one-truck guard
--    (20261006120000:195-237, messages verbatim at :213/:220/:222).
--    UNIQUE (agency_id, rc_number) is added as the idempotent-create
--    settlement key (both columns NOT NULL since 20260305010000:5-8).
--
-- 4. New public.agency_driver_employment: licence number/class/expiry,
--    contact, active/ended status, version. Partial UNIQUE index on
--    driver_id WHERE status='active' mirrors the pinned one-truck-per-driver
--    rule (one ACTIVE employment globally). RLS as in (1) plus
--    driver_is_approved_for_assignment on INSERT/UPDATE (20261006120000:69-82).
--
-- 5. Two free-standing eligibility predicates for TO-143-D2 (which pins no
--    eligibility names): agency_vehicle_allocation_eligible and
--    agency_driver_allocation_eligible. NULL expiry dates do NOT block
--    (backward compatible with existing rows); expired dates and maintenance
--    blocks do. Both STABLE SECURITY DEFINER with pinned search_path.
--
-- 6. Command RPCs (consent-writer conventions, 20261007120000:106-215):
--    SECURITY DEFINER plpgsql, SET search_path = public, RETURNS jsonb.
--    Agency resolution from auth.uid() is deterministic and fail-closed —
--    transport_agencies.user_id has NO UNIQUE (20260305000000:53-81), so
--    zero rows raise 'No agency profile found for this account.' and >1 rows
--    raise 'Multiple agency profiles found for this account.'; never a
--    LIMIT-1 pick. The wording is deliberately distinct from the Edge string
--    'Agency access is required.' (portal-auth.ts:286, maybeSingle + 500).
--    Non-operational agencies raise the established 'Agency approval is
--    required.' (20261007120000:158, portal-auth.ts:128-131). Vehicle create
--    is idempotent on UNIQUE (agency_id, rc_number); updates/end enforce
--    expected-version with {ok:false,error:'version_conflict',current_version}
--    jsonb results (never an exception) and leave the row byte-identical on
--    conflict. Expected-version is the replay guard for updates — no
--    command-log table. GRANT hygiene per 20261006120000:177-186.
--
-- 7. UNIQUE(transport_agencies.user_id) is deliberately NOT added here:
--    hosted duplicates would break replay and PG 17 lacks NOT VALID unique.
--    Recorded as a FINDING; the RPC duplicate denial is the containment.
-- =========================================================

-- ---------------------------------------------------------------------------
-- 1. Policy rewrite: agency_trucks (drop BEFORE create — permissive policies
--    OR-combine)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS agency_truck_owner_all ON public.agency_trucks;
DROP POLICY IF EXISTS admin_see_all_trucks ON public.agency_trucks;

CREATE POLICY agency_trucks_select ON public.agency_trucks
  FOR SELECT TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

CREATE POLICY agency_trucks_insert ON public.agency_trucks
  FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    AND public.agency_is_operational(agency_id)
  );

CREATE POLICY agency_trucks_update ON public.agency_trucks
  FOR UPDATE TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    AND public.agency_is_operational(agency_id)
  );

-- Ownership-only per the TO-142 precedent: a suspended owner keeps DELETE on
-- its own rows (portal stays usable; eligibility makes deletion moot for
-- allocation). Pinned by the battery, not an accident.
CREATE POLICY agency_trucks_delete ON public.agency_trucks
  FOR DELETE TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Catalog code key + agency_trucks additive columns and constraints
-- ---------------------------------------------------------------------------

ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill stable keys matching the existing vehicle_type vocabulary exactly.
UPDATE public.trucks
SET code = CASE name
  WHEN 'Tata Ace' THEN 'tata_ace'
  WHEN 'Tata 407' THEN 'tata_407'
  WHEN 'Eicher 14ft' THEN 'eicher_14ft'
  WHEN 'Eicher 17ft' THEN 'eicher_17ft'
  WHEN 'Ashok Leyland 19ft' THEN 'ashok_19ft'
  WHEN 'BharatBenz 24ft' THEN 'bharatbenz_24ft'
  WHEN 'BharatBenz 32ft' THEN 'bharatbenz_32ft'
  WHEN 'Volvo 40ft Container' THEN 'volvo_40ft'
END
WHERE code IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.trucks WHERE code IS NULL) THEN
    RAISE EXCEPTION 'agency_fleet_foundation: trucks catalog rows without a stable code mapping; refusing to enforce NOT NULL (hosted catalog drift must be resolved, never invented)';
  END IF;
END $$;

ALTER TABLE public.trucks ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trucks_code_key ON public.trucks (code);

ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS payload_kg NUMERIC(10,2);
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS body_length_m NUMERIC(5,2);
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS body_width_m NUMERIC(5,2);
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS body_height_m NUMERIC(5,2);
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS puc_expiry DATE;
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS maintenance_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS maintenance_block_reason TEXT;
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS maintenance_blocked_until TIMESTAMPTZ;
ALTER TABLE public.agency_trucks ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_trucks_agency_id_rc_number_key'
      AND conrelid = 'public.agency_trucks'::regclass
  ) THEN
    ALTER TABLE public.agency_trucks
      ADD CONSTRAINT agency_trucks_agency_id_rc_number_key UNIQUE (agency_id, rc_number);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_trucks_vehicle_type_catalog_fkey'
      AND conrelid = 'public.agency_trucks'::regclass
  ) THEN
    -- NOT VALID: existing (hosted) rows are unverified; new writes are checked.
    ALTER TABLE public.agency_trucks
      ADD CONSTRAINT agency_trucks_vehicle_type_catalog_fkey
      FOREIGN KEY (vehicle_type) REFERENCES public.trucks (code) NOT VALID;
  END IF;
END $$;

-- Version trigger: bumps ONLY when the statement did not set version itself
-- (NEW.version IS NOT DISTINCT FROM OLD.version), so explicit RPC/driver-set
-- versions are never double-bumped.
CREATE OR REPLACE FUNCTION public.bump_agency_truck_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_trucks_version ON public.agency_trucks;
CREATE TRIGGER trg_agency_trucks_version
  BEFORE UPDATE ON public.agency_trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_agency_truck_version();

-- ---------------------------------------------------------------------------
-- 3. agency_driver_employment: owned driver employment records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_driver_employment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE CASCADE,
  licence_number TEXT,
  licence_class TEXT,
  licence_expiry DATE,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mirrors the pinned one-truck-per-driver rule: at most ONE active employment
-- per driver globally; ended rows free the driver for re-employment.
CREATE UNIQUE INDEX IF NOT EXISTS agency_driver_employment_one_active_per_driver
  ON public.agency_driver_employment (driver_id)
  WHERE status = 'active';

ALTER TABLE public.agency_driver_employment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_employment_select ON public.agency_driver_employment;
DROP POLICY IF EXISTS agency_employment_insert ON public.agency_driver_employment;
DROP POLICY IF EXISTS agency_employment_update ON public.agency_driver_employment;
DROP POLICY IF EXISTS agency_employment_delete ON public.agency_driver_employment;

CREATE POLICY agency_employment_select ON public.agency_driver_employment
  FOR SELECT TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

CREATE POLICY agency_employment_insert ON public.agency_driver_employment
  FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    AND public.agency_is_operational(agency_id)
    AND public.driver_is_approved_for_assignment(driver_id)
  );

CREATE POLICY agency_employment_update ON public.agency_driver_employment
  FOR UPDATE TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    AND public.agency_is_operational(agency_id)
    AND public.driver_is_approved_for_assignment(driver_id)
  );

CREATE POLICY agency_employment_delete ON public.agency_driver_employment
  FOR DELETE TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'agency_driver_employment'
      AND trigger_name = 'agency_employment_updated_at'
  ) THEN
    CREATE TRIGGER agency_employment_updated_at
      BEFORE UPDATE ON public.agency_driver_employment
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bump_agency_employment_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_employment_version ON public.agency_driver_employment;
CREATE TRIGGER trg_agency_employment_version
  BEFORE UPDATE ON public.agency_driver_employment
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_agency_employment_version();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agency_driver_employment'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_driver_employment;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Deterministic fail-closed agency resolution (auth.uid() only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_caller_agency_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_agency_id uuid;
BEGIN
  SELECT count(*)::int
    INTO v_count
  FROM public.transport_agencies
  WHERE user_id = auth.uid();

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No agency profile found for this account.';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Multiple agency profiles found for this account.';
  END IF;

  -- Exactly one row is guaranteed by the count check (no min() over uuid —
  -- Postgres ships no such aggregate).
  SELECT id INTO v_agency_id
  FROM public.transport_agencies
  WHERE user_id = auth.uid();

  RETURN v_agency_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Eligibility predicates (consumed by TO-143-D2; NULL expiry never blocks)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_vehicle_allocation_eligible(
  p_vehicle_id uuid,
  p_as_of timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_trucks t
    WHERE t.id = p_vehicle_id
      AND t.is_available
      AND NOT t.maintenance_blocked
      AND (t.maintenance_blocked_until IS NULL OR t.maintenance_blocked_until <= p_as_of)
      AND (t.insurance_expiry IS NULL OR t.insurance_expiry > p_as_of::date)
      AND (t.fitness_expiry IS NULL OR t.fitness_expiry > p_as_of::date)
      AND (t.permit_expiry IS NULL OR t.permit_expiry > p_as_of::date)
      AND (t.puc_expiry IS NULL OR t.puc_expiry > p_as_of::date)
      AND public.agency_is_operational(t.agency_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_allocation_eligible(
  p_driver_id uuid,
  p_agency_id uuid,
  p_as_of timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_driver_employment e
    WHERE e.driver_id = p_driver_id
      AND e.agency_id = p_agency_id
      AND e.status = 'active'
      AND (e.licence_expiry IS NULL OR e.licence_expiry > p_as_of::date)
  )
  AND public.driver_is_approved_for_assignment(p_driver_id);
$$;

-- ---------------------------------------------------------------------------
-- 6. Command RPCs (typed jsonb envelopes; caller-bound; expected-version)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_vehicle_create(
  p_rc_number text,
  p_vehicle_type text,
  p_insurance_expiry date DEFAULT NULL,
  p_fitness_expiry date DEFAULT NULL,
  p_permit_expiry date DEFAULT NULL,
  p_puc_expiry date DEFAULT NULL,
  p_payload_kg numeric DEFAULT NULL,
  p_body_length_m numeric DEFAULT NULL,
  p_body_width_m numeric DEFAULT NULL,
  p_body_height_m numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_catalog public.trucks%ROWTYPE;
  v_inserted public.agency_trucks%ROWTYPE;
  v_existing public.agency_trucks%ROWTYPE;
BEGIN
  IF p_rc_number IS NULL OR btrim(p_rc_number) = '' THEN
    RAISE EXCEPTION 'RC number is required.';
  END IF;

  IF p_vehicle_type IS NULL OR btrim(p_vehicle_type) = '' THEN
    RAISE EXCEPTION 'Vehicle type is required.';
  END IF;

  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_catalog FROM public.trucks WHERE code = p_vehicle_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown vehicle type.';
  END IF;

  -- ONE atomic write; a replayed (agency_id, rc_number) conflicts on the
  -- settlement key and writes nothing.
  INSERT INTO public.agency_trucks (
    agency_id, vehicle_type, rc_number,
    insurance_expiry, fitness_expiry, permit_expiry, puc_expiry,
    payload_kg, body_length_m, body_width_m, body_height_m, notes
  ) VALUES (
    v_agency_id, p_vehicle_type, btrim(p_rc_number),
    p_insurance_expiry, p_fitness_expiry, p_permit_expiry, p_puc_expiry,
    p_payload_kg,
    COALESCE(p_body_length_m, v_catalog.length),
    COALESCE(p_body_width_m, v_catalog.width),
    COALESCE(p_body_height_m, v_catalog.height),
    p_notes
  )
  ON CONFLICT (agency_id, rc_number) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'created',
      'vehicle', to_jsonb(v_inserted),
      'version', v_inserted.version
    );
  END IF;

  -- Idempotent replay: return the existing row unchanged.
  SELECT * INTO v_existing
  FROM public.agency_trucks
  WHERE agency_id = v_agency_id AND rc_number = btrim(p_rc_number);

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'idempotent_replay',
    'vehicle', to_jsonb(v_existing),
    'version', v_existing.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_vehicle_update(
  p_vehicle_id uuid,
  p_expected_version integer,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_owned boolean;
  v_updated public.agency_trucks%ROWTYPE;
  v_current_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.agency_trucks
    WHERE id = p_vehicle_id AND agency_id = v_agency_id
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'Vehicle not found or access denied.';
  END IF;

  -- The version trigger bumps exactly once; the WHERE clause is the atomic
  -- expected-version check. A zero-row update IS the conflict (no write).
  UPDATE public.agency_trucks t SET
    is_available = CASE WHEN p_patch ? 'is_available' THEN COALESCE((p_patch->>'is_available')::boolean, t.is_available) ELSE t.is_available END,
    notes = CASE WHEN p_patch ? 'notes' THEN p_patch->>'notes' ELSE t.notes END,
    insurance_expiry = CASE WHEN p_patch ? 'insurance_expiry' THEN (p_patch->>'insurance_expiry')::date ELSE t.insurance_expiry END,
    fitness_expiry = CASE WHEN p_patch ? 'fitness_expiry' THEN (p_patch->>'fitness_expiry')::date ELSE t.fitness_expiry END,
    permit_expiry = CASE WHEN p_patch ? 'permit_expiry' THEN (p_patch->>'permit_expiry')::date ELSE t.permit_expiry END,
    puc_expiry = CASE WHEN p_patch ? 'puc_expiry' THEN (p_patch->>'puc_expiry')::date ELSE t.puc_expiry END,
    payload_kg = CASE WHEN p_patch ? 'payload_kg' THEN (p_patch->>'payload_kg')::numeric ELSE t.payload_kg END,
    body_length_m = CASE WHEN p_patch ? 'body_length_m' THEN (p_patch->>'body_length_m')::numeric ELSE t.body_length_m END,
    body_width_m = CASE WHEN p_patch ? 'body_width_m' THEN (p_patch->>'body_width_m')::numeric ELSE t.body_width_m END,
    body_height_m = CASE WHEN p_patch ? 'body_height_m' THEN (p_patch->>'body_height_m')::numeric ELSE t.body_height_m END,
    maintenance_blocked = CASE WHEN p_patch ? 'maintenance_blocked' THEN COALESCE((p_patch->>'maintenance_blocked')::boolean, t.maintenance_blocked) ELSE t.maintenance_blocked END,
    maintenance_block_reason = CASE WHEN p_patch ? 'maintenance_block_reason' THEN p_patch->>'maintenance_block_reason' ELSE t.maintenance_block_reason END,
    maintenance_blocked_until = CASE WHEN p_patch ? 'maintenance_blocked_until' THEN (p_patch->>'maintenance_blocked_until')::timestamptz ELSE t.maintenance_blocked_until END
  WHERE t.id = p_vehicle_id
    AND t.agency_id = v_agency_id
    AND t.version = p_expected_version
  RETURNING * INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'updated',
      'vehicle', to_jsonb(v_updated),
      'version', v_updated.version
    );
  END IF;

  SELECT version INTO v_current_version
  FROM public.agency_trucks
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'version_conflict',
    'current_version', v_current_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_employment_create(
  p_driver_id uuid,
  p_licence_number text DEFAULT NULL,
  p_licence_class text DEFAULT NULL,
  p_licence_expiry date DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_inserted public.agency_driver_employment%ROWTYPE;
  v_existing public.agency_driver_employment%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF NOT public.driver_is_approved_for_assignment(p_driver_id) THEN
    RAISE EXCEPTION 'Driver is not approved for assignment.';
  END IF;

  INSERT INTO public.agency_driver_employment (
    agency_id, driver_id, licence_number, licence_class, licence_expiry, contact_phone
  ) VALUES (
    v_agency_id, p_driver_id, p_licence_number, p_licence_class, p_licence_expiry, p_contact_phone
  )
  ON CONFLICT (driver_id) WHERE status = 'active' DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'created',
      'employment', to_jsonb(v_inserted),
      'version', v_inserted.version
    );
  END IF;

  -- Active employment already exists: replay for the SAME agency, denial for
  -- a foreign one (mirrors the one-truck cross-agency posture).
  SELECT * INTO v_existing
  FROM public.agency_driver_employment
  WHERE driver_id = p_driver_id AND status = 'active';

  IF v_existing.agency_id = v_agency_id THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'idempotent_replay',
      'employment', to_jsonb(v_existing),
      'version', v_existing.version
    );
  END IF;

  RAISE EXCEPTION 'Driver already has an active employment record.';
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_employment_update(
  p_employment_id uuid,
  p_expected_version integer,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_owned boolean;
  v_updated public.agency_driver_employment%ROWTYPE;
  v_current_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.agency_driver_employment
    WHERE id = p_employment_id AND agency_id = v_agency_id
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'Employment record not found or access denied.';
  END IF;

  UPDATE public.agency_driver_employment e SET
    licence_number = CASE WHEN p_patch ? 'licence_number' THEN p_patch->>'licence_number' ELSE e.licence_number END,
    licence_class = CASE WHEN p_patch ? 'licence_class' THEN p_patch->>'licence_class' ELSE e.licence_class END,
    licence_expiry = CASE WHEN p_patch ? 'licence_expiry' THEN (p_patch->>'licence_expiry')::date ELSE e.licence_expiry END,
    contact_phone = CASE WHEN p_patch ? 'contact_phone' THEN p_patch->>'contact_phone' ELSE e.contact_phone END
  WHERE e.id = p_employment_id
    AND e.agency_id = v_agency_id
    AND e.version = p_expected_version
  RETURNING * INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'updated',
      'employment', to_jsonb(v_updated),
      'version', v_updated.version
    );
  END IF;

  SELECT version INTO v_current_version
  FROM public.agency_driver_employment
  WHERE id = p_employment_id;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'version_conflict',
    'current_version', v_current_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_employment_end(
  p_employment_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_owned boolean;
  v_current public.agency_driver_employment%ROWTYPE;
  v_updated public.agency_driver_employment%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.agency_driver_employment
    WHERE id = p_employment_id AND agency_id = v_agency_id
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'Employment record not found or access denied.';
  END IF;

  -- Exactly-once end: an already-ended row with the matching expected version
  -- replays as already_ended WITHOUT a second write (version stays put).
  SELECT * INTO v_current
  FROM public.agency_driver_employment
  WHERE id = p_employment_id;

  IF v_current.status = 'ended' THEN
    IF v_current.version = p_expected_version THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'already_ended',
        'employment', to_jsonb(v_current),
        'version', v_current.version
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'version_conflict',
      'current_version', v_current.version
    );
  END IF;

  UPDATE public.agency_driver_employment e SET
    status = 'ended'
  WHERE e.id = p_employment_id
    AND e.agency_id = v_agency_id
    AND e.version = p_expected_version
  RETURNING * INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'ended',
      'employment', to_jsonb(v_updated),
      'version', v_updated.version
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'version_conflict',
    'current_version', v_current.version
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. GRANT hygiene (20261006120000:177-186): no PUBLIC/anon EXECUTE. Command
--    RPCs are interactive-client commands -> authenticated only (consent-writer
--    parity; the service path uses BYPASSRLS direct writes). The eligibility
--    predicates serve both the authenticated portal and the service dispatch
--    path (TO-143-D2) -> authenticated + service_role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.resolve_caller_agency_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_vehicle_create(text, text, date, date, date, date, numeric, numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_vehicle_update(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_employment_create(uuid, text, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_employment_update(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_employment_end(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_vehicle_allocation_eligible(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_allocation_eligible(uuid, uuid, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resolve_caller_agency_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_vehicle_create(text, text, date, date, date, date, numeric, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_vehicle_update(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_driver_employment_create(uuid, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_driver_employment_update(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_driver_employment_end(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_vehicle_allocation_eligible(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_driver_allocation_eligible(uuid, uuid, timestamptz) TO authenticated, service_role;
