-- =========================================================
-- TO-144-D2: agency memberships/invitations, client agreements (bill-to and
-- ship-to sites and contacts), tariff effective versions and driver invitations.
--
-- Sorts after 20261010000000_fleet_assignment_reservations.sql. One forward
-- migration, PGlite-replayable, additive only (no destructive operations).
-- Proof: scripts/agency_members_clients_tariffs.db.test.mjs on the full-chain
-- PGlite replay; the maintained batteries re-run in-chain. Hosted rollout is
-- owner-gated (TO-153; no `supabase db push` without owner approval).
--
-- Reused authority, not duplicated: transport_agencies.user_id is the owner
-- (20260305000000_phase1_drivers.sql), resolve_caller_agency_id() (D1),
-- agency_is_operational() and driver_is_approved_for_assignment()
-- (20261006120000), is_admin_user() (20260418003000), set_updated_at(),
-- agency_driver_employment (D1) and trucks.code (D1). The legacy public.customers
-- table has no tenant column, so client parties are agency-owned rows here, not
-- links to it.
--
-- Conventions (D1 / reservations precedent):
--   * SECURITY DEFINER command RPCs, SET search_path = public, RETURNS jsonb.
--   * Caller-bound tenant from auth.uid() only; no command takes an agency or
--     org id. Non-owners and foreign agencies fail closed.
--   * Authority/ownership denials RAISE fixed messages. Business outcomes return
--     {ok:false,error:...} jsonb: version_conflict, idempotency_key_reused,
--     invitation_* and the tariff/agreement state codes. Nothing partial is written
--     before an ok:false return.
--   * Every create is idempotent per agency on (agency_id, idempotency_key).
--   * Every mutation of an existing row takes expected_version (version_conflict
--     returns the current version; the row is byte-identical on conflict).
--   * RLS: owner (or admin) SELECT only. Authenticated holds no direct write
--     privilege, so every write goes through the RPCs.
--
-- 1. Staff memberships and invitations. Scopes are dispatcher, fleet_manager,
--    finance and viewer. 'owner' is NOT a membership scope; ownership is
--    transport_agencies.user_id only. Invitations store SHA-256 of a 64-hex token
--    (the raw token is returned exactly once, on create). Accept requires the
--    caller's auth email to equal the invited email, rejects expired, revoked and
--    reused tokens, and never changes the scope of an existing active member.
--    An agency owner can neither be invited to nor accept into its own agency.
--    Membership helper agency_member_has_scope(agency, scope) is caller-bound
--    and fails closed on suspended agencies and revoked members.
--
-- 2. Client agreements per agency with versioned bill-to/ship-to sites and
--    contacts. One ACTIVE bill-to per agreement (partial unique). Sites and
--    contacts reference their agreement through composite (id, agency_id) FKs, so
--    a cross-agency reference cannot be written even by a superuser.
--
-- 3. Tariff effective versions per agreement lane (origin, destination, vehicle
--    key). Rows are immutable: a trigger rejects UPDATE and DELETE for every role.
--    Effective ranges are [effective_from, effective_to), with effective_to NULL
--    meaning open. The head is the greatest version_no. A new version must pass
--    the current head's id as supersedes (expected head, else version_conflict),
--    must start after the head's start, and must not start before a bounded head's
--    end (else tariff_overlap). A superseded open-ended version is never
--    mutated: its end is the successor's start. Rates are NUMERIC(12,2) INR,
--    rounded by rejection (no silent rounding), so sub-paise input is refused.
--    agency_tariff_rate_at() is a service-only lookup for the invoice path.
--
-- 4. Driver invitations: token-hashed, phone-bound, expiring, one-use. Accepting
--    requires a caller-owned driver profile whose phone matches, an approved
--    driver, and no active employment with another agency. It creates or reuses
--    the D1 agency_driver_employment row and links it from the invitation.
--
-- GRANT hygiene: no PUBLIC/anon EXECUTE on any function; helpers are not granted
-- to authenticated; the rate lookup is service_role only.
-- =========================================================

-- ---------------------------------------------------------------------------
-- 0. Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_random_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

CREATE OR REPLACE FUNCTION public.agency_token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.agency_caller_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 1. Invitation tables (created before memberships, which reference them)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL
    CHECK (invited_email = lower(invited_email)
      AND invited_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  scope TEXT NOT NULL CHECK (scope IN ('dispatcher', 'fleet_manager', 'finance', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_invitations_idempotency_key UNIQUE (agency_id, idempotency_key)
);

-- An expired or revoked pending invitation does not block a fresh one; the
-- invite command marks stale pendings expired before this index is checked.
CREATE UNIQUE INDEX IF NOT EXISTS agency_invitations_one_pending_per_email
  ON public.agency_invitations (agency_id, invited_email)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.agency_driver_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  invited_phone TEXT NOT NULL CHECK (invited_phone ~ '^\+?[0-9]{10,15}$'),
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_driver_id UUID REFERENCES public.drivers (id) ON DELETE SET NULL,
  employment_id UUID REFERENCES public.agency_driver_employment (id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_driver_invitations_idempotency_key UNIQUE (agency_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_driver_invitations_one_pending_per_phone
  ON public.agency_driver_invitations (agency_id, invited_phone)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Memberships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('dispatcher', 'fleet_manager', 'finance', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  invitation_id UUID REFERENCES public.agency_invitations (id) ON DELETE SET NULL,
  invited_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_memberships_revoked_consistent CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

-- At most one ACTIVE membership per user per agency. Revoked rows free the pair.
CREATE UNIQUE INDEX IF NOT EXISTS agency_memberships_one_active_per_user
  ON public.agency_memberships (agency_id, user_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Client agreements, sites and contacts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_client_agreements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  client_name TEXT NOT NULL CHECK (btrim(client_name) <> ''),
  client_gstin TEXT CHECK (client_gstin IS NULL OR client_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  payment_terms_days INTEGER CHECK (payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_client_agreements_idempotency_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_client_agreements_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_client_sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  site_kind TEXT NOT NULL CHECK (site_kind IN ('bill_to', 'ship_to')),
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  address_line TEXT NOT NULL CHECK (btrim(address_line) <> ''),
  city TEXT NOT NULL CHECK (btrim(city) <> ''),
  state TEXT NOT NULL CHECK (btrim(state) <> ''),
  pincode TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_client_sites_agreement_fk
    FOREIGN KEY (agreement_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_client_sites_tenant_key UNIQUE (id, agency_id),
  CONSTRAINT agency_client_sites_idempotency_key UNIQUE (agency_id, idempotency_key)
);

-- One ACTIVE bill-to per agreement; any number of ship-to sites.
CREATE UNIQUE INDEX IF NOT EXISTS agency_client_sites_one_active_bill_to
  ON public.agency_client_sites (agreement_id)
  WHERE site_kind = 'bill_to' AND status = 'active';

CREATE TABLE IF NOT EXISTS public.agency_client_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  site_id UUID,
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  phone TEXT NOT NULL CHECK (phone ~ '^\+?[0-9]{10,15}$'),
  email TEXT CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_client_contacts_agreement_fk
    FOREIGN KEY (agreement_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_client_contacts_site_fk
    FOREIGN KEY (site_id, agency_id)
    REFERENCES public.agency_client_sites (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_client_contacts_idempotency_key UNIQUE (agency_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- 4. Tariff effective versions (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_tariff_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  origin_label TEXT NOT NULL CHECK (btrim(origin_label) <> ''),
  origin_key TEXT NOT NULL CHECK (origin_key <> '' AND origin_key = lower(btrim(origin_key))),
  destination_label TEXT NOT NULL CHECK (btrim(destination_label) <> ''),
  destination_key TEXT NOT NULL CHECK (destination_key <> '' AND destination_key = lower(btrim(destination_key))),
  vehicle_type TEXT REFERENCES public.trucks (code),
  vehicle_key TEXT NOT NULL CHECK (vehicle_key = coalesce(vehicle_type, '*')),
  rate_basis TEXT NOT NULL CHECK (rate_basis IN ('per_trip', 'per_tonne', 'per_km')),
  rate_amount NUMERIC(12,2) NOT NULL CHECK (rate_amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  effective_from DATE NOT NULL,
  effective_to DATE,
  CONSTRAINT agency_tariff_versions_range_valid CHECK (effective_to IS NULL OR effective_to > effective_from),
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  supersedes_version_id UUID REFERENCES public.agency_tariff_versions (id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_tariff_versions_agreement_fk
    FOREIGN KEY (agreement_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_tariff_versions_lane_version_key
    UNIQUE (agreement_id, origin_key, destination_key, vehicle_key, version_no),
  CONSTRAINT agency_tariff_versions_idempotency_key UNIQUE (agency_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS agency_tariff_versions_lane_idx
  ON public.agency_tariff_versions (agreement_id, origin_key, destination_key, vehicle_key, version_no DESC);

CREATE OR REPLACE FUNCTION public.prevent_agency_tariff_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Tariff versions are immutable; publish a superseding version instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_tariff_versions_immutable ON public.agency_tariff_versions;
CREATE TRIGGER trg_agency_tariff_versions_immutable
  BEFORE UPDATE OR DELETE ON public.agency_tariff_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_agency_tariff_mutation();

-- ---------------------------------------------------------------------------
-- 5. updated_at triggers (shared set_updated_at from phase1_drivers)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS agency_invitations_updated_at ON public.agency_invitations;
CREATE TRIGGER agency_invitations_updated_at
  BEFORE UPDATE ON public.agency_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_driver_invitations_updated_at ON public.agency_driver_invitations;
CREATE TRIGGER agency_driver_invitations_updated_at
  BEFORE UPDATE ON public.agency_driver_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_memberships_updated_at ON public.agency_memberships;
CREATE TRIGGER agency_memberships_updated_at
  BEFORE UPDATE ON public.agency_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_client_agreements_updated_at ON public.agency_client_agreements;
CREATE TRIGGER agency_client_agreements_updated_at
  BEFORE UPDATE ON public.agency_client_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_client_sites_updated_at ON public.agency_client_sites;
CREATE TRIGGER agency_client_sites_updated_at
  BEFORE UPDATE ON public.agency_client_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_client_contacts_updated_at ON public.agency_client_contacts;
CREATE TRIGGER agency_client_contacts_updated_at
  BEFORE UPDATE ON public.agency_client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Row-level security: owner (or admin) read only; no direct writes
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_driver_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_tariff_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_invitations_select ON public.agency_invitations;
CREATE POLICY agency_invitations_select ON public.agency_invitations
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS agency_driver_invitations_select ON public.agency_driver_invitations;
CREATE POLICY agency_driver_invitations_select ON public.agency_driver_invitations
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR public.is_admin_user()
  );

-- An active member may read its own membership while the agency is operational;
-- a revoked or suspended member's old session reads nothing.
DROP POLICY IF EXISTS agency_memberships_select ON public.agency_memberships;
CREATE POLICY agency_memberships_select ON public.agency_memberships
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR (user_id = auth.uid() AND status = 'active' AND public.agency_is_operational(agency_id))
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS agency_client_agreements_select ON public.agency_client_agreements;
CREATE POLICY agency_client_agreements_select ON public.agency_client_agreements
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS agency_client_sites_select ON public.agency_client_sites;
CREATE POLICY agency_client_sites_select ON public.agency_client_sites
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS agency_client_contacts_select ON public.agency_client_contacts;
CREATE POLICY agency_client_contacts_select ON public.agency_client_contacts
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS agency_tariff_versions_select ON public.agency_tariff_versions;
CREATE POLICY agency_tariff_versions_select ON public.agency_tariff_versions
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
    OR public.is_admin_user()
  );

-- Writes: no table privilege for the API roles (RPC-only). The invitation
-- token_hash column is not granted to authenticated at all.
REVOKE ALL ON public.agency_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, agency_id, invited_email, scope, status, expires_at, idempotency_key,
              created_by, accepted_by, accepted_at, revoked_at, version, created_at, updated_at)
  ON public.agency_invitations TO authenticated;

REVOKE ALL ON public.agency_driver_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, agency_id, invited_phone, status, expires_at, idempotency_key,
              created_by, accepted_by, accepted_driver_id, employment_id, accepted_at,
              revoked_at, version, created_at, updated_at)
  ON public.agency_driver_invitations TO authenticated;

REVOKE ALL ON public.agency_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_memberships TO authenticated;

REVOKE ALL ON public.agency_client_agreements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_client_agreements TO authenticated;

REVOKE ALL ON public.agency_client_sites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_client_sites TO authenticated;

REVOKE ALL ON public.agency_client_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_client_contacts TO authenticated;

REVOKE ALL ON public.agency_tariff_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_tariff_versions TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Read predicates
-- ---------------------------------------------------------------------------

-- Caller-bound: true when the caller is this agency's owner, or holds an ACTIVE
-- membership with the scope, and the agency is operational. Fail closed.
CREATE OR REPLACE FUNCTION public.agency_member_has_scope(p_agency_id uuid, p_scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.transport_agencies ta
      WHERE ta.id = p_agency_id AND ta.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.agency_id = p_agency_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.scope = p_scope
    )
  )
  AND public.agency_is_operational(p_agency_id);
$$;

-- Service-only effective-rate lookup. The latest version starting on or before
-- the date is chosen; it applies only if the date is before its end.
CREATE OR REPLACE FUNCTION public.agency_tariff_rate_at(
  p_agreement_id uuid,
  p_origin text,
  p_destination text,
  p_vehicle_type text,
  p_as_of date
)
RETURNS SETOF public.agency_tariff_versions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT t.*
    FROM public.agency_tariff_versions t
    WHERE t.agreement_id = p_agreement_id
      AND t.origin_key = lower(btrim(p_origin))
      AND t.destination_key = lower(btrim(p_destination))
      AND t.vehicle_key = coalesce(p_vehicle_type, '*')
      AND t.effective_from <= p_as_of
    ORDER BY t.effective_from DESC
    LIMIT 1
  )
  SELECT l.* FROM latest l
  WHERE l.effective_to IS NULL OR p_as_of < l.effective_to;
$$;

-- ---------------------------------------------------------------------------
-- 8. Membership command RPCs (owner-only; caller-bound)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_member_invite(
  p_invited_email text,
  p_scope text,
  p_expires_in_days integer DEFAULT 7,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_owner_email text;
  v_token text;
  v_existing public.agency_invitations%ROWTYPE;
  v_inserted public.agency_invitations%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Invited email is invalid.';
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('dispatcher', 'fleet_manager', 'finance', 'viewer') THEN
    RAISE EXCEPTION 'Unknown membership scope.';
  END IF;

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 OR p_expires_in_days > 30 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 30 days.';
  END IF;

  SELECT lower(btrim(u.email)) INTO v_owner_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_owner_email IS NOT NULL AND v_owner_email = v_email THEN
    RAISE EXCEPTION 'An agency owner cannot be invited to its own agency.';
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_invitations
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.invited_email = v_email AND v_existing.scope = p_scope THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'idempotent_replay',
        'invitation', to_jsonb(v_existing) - 'token_hash'
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  -- Stale pending invitations for this email stop blocking a fresh one.
  UPDATE public.agency_invitations
  SET status = 'expired', version = version + 1
  WHERE agency_id = v_agency_id
    AND invited_email = v_email
    AND status = 'pending'
    AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.agency_invitations
    WHERE agency_id = v_agency_id AND invited_email = v_email AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending');
  END IF;

  v_token := public.agency_random_token();

  INSERT INTO public.agency_invitations (
    agency_id, invited_email, scope, token_hash, status, expires_at, idempotency_key, created_by
  ) VALUES (
    v_agency_id, v_email, p_scope, public.agency_token_hash(v_token), 'pending',
    now() + make_interval(days => p_expires_in_days), v_key, auth.uid()
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'created',
    'token', v_token,
    'invitation', to_jsonb(v_inserted) - 'token_hash'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_member_invitation_revoke(
  p_invitation_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_current public.agency_invitations%ROWTYPE;
  v_updated public.agency_invitations%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_invitations
  WHERE id = p_invitation_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or access denied.';
  END IF;

  IF v_current.status = 'revoked' THEN
    IF v_current.version = p_expected_version THEN
      RETURN jsonb_build_object('ok', true, 'state', 'already_revoked', 'invitation', to_jsonb(v_current) - 'token_hash');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  IF v_current.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  UPDATE public.agency_invitations
  SET status = 'revoked', revoked_at = now(), version = version + 1
  WHERE id = p_invitation_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'revoked', 'invitation', to_jsonb(v_updated) - 'token_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_member_accept(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inv public.agency_invitations%ROWTYPE;
  v_membership public.agency_memberships%ROWTYPE;
  v_email text;
  v_state text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign-in is required.';
  END IF;

  IF btrim(coalesce(p_token, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  SELECT * INTO v_inv
  FROM public.agency_invitations
  WHERE token_hash = public.agency_token_hash(btrim(p_token))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  -- No self-escalation: an owner cannot take a staff seat in its own agency.
  IF EXISTS (
    SELECT 1 FROM public.transport_agencies ta
    WHERE ta.id = v_inv.agency_id AND ta.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'An agency owner cannot accept a membership for its own agency.';
  END IF;

  IF NOT public.agency_is_operational(v_inv.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_inv.status = 'accepted' THEN
    IF v_inv.accepted_by = v_caller THEN
      SELECT * INTO v_membership
      FROM public.agency_memberships m
      WHERE m.agency_id = v_inv.agency_id AND m.user_id = v_caller AND m.status = 'active';
      IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'membership', to_jsonb(v_membership));
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_revoked');
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  v_email := public.agency_caller_email();
  IF v_email IS NULL OR v_email <> v_inv.invited_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_recipient_mismatch');
  END IF;

  -- An existing active member keeps its scope: a fresh invitation never escalates.
  SELECT * INTO v_membership
  FROM public.agency_memberships m
  WHERE m.agency_id = v_inv.agency_id AND m.user_id = v_caller AND m.status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    v_state := 'already_member';
  ELSE
    INSERT INTO public.agency_memberships (agency_id, user_id, scope, invitation_id, invited_by)
    VALUES (v_inv.agency_id, v_caller, v_inv.scope, v_inv.id, v_inv.created_by)
    RETURNING * INTO v_membership;
    v_state := 'accepted';
  END IF;

  UPDATE public.agency_invitations
  SET status = 'accepted', accepted_by = v_caller, accepted_at = now(), version = version + 1
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'membership', to_jsonb(v_membership));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_member_revoke(
  p_membership_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_current public.agency_memberships%ROWTYPE;
  v_updated public.agency_memberships%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_memberships
  WHERE id = p_membership_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or access denied.';
  END IF;

  IF v_current.status = 'revoked' THEN
    IF v_current.version = p_expected_version THEN
      RETURN jsonb_build_object('ok', true, 'state', 'already_revoked', 'membership', to_jsonb(v_current));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  UPDATE public.agency_memberships
  SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), version = version + 1
  WHERE id = p_membership_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'revoked', 'membership', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_member_change_scope(
  p_membership_id uuid,
  p_expected_version integer,
  p_scope text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_current public.agency_memberships%ROWTYPE;
  v_updated public.agency_memberships%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('dispatcher', 'fleet_manager', 'finance', 'viewer') THEN
    RAISE EXCEPTION 'Unknown membership scope.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_memberships
  WHERE id = p_membership_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or access denied.';
  END IF;

  IF v_current.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'membership_not_active');
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  IF v_current.scope = p_scope THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unchanged', 'membership', to_jsonb(v_current));
  END IF;

  UPDATE public.agency_memberships
  SET scope = p_scope, version = version + 1
  WHERE id = p_membership_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'scope_changed', 'membership', to_jsonb(v_updated));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Client agreement, site and contact command RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_client_agreement_create(
  p_client_name text,
  p_client_gstin text DEFAULT NULL,
  p_payment_terms_days integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_name text := btrim(coalesce(p_client_name, ''));
  v_gstin text := nullif(upper(btrim(coalesce(p_client_gstin, ''))), '');
  v_existing public.agency_client_agreements%ROWTYPE;
  v_inserted public.agency_client_agreements%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Client name is required.';
  END IF;

  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'GSTIN format is invalid.';
  END IF;

  IF p_payment_terms_days IS NOT NULL AND (p_payment_terms_days < 0 OR p_payment_terms_days > 365) THEN
    RAISE EXCEPTION 'Payment terms must be between 0 and 365 days.';
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_client_agreements
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.client_name = v_name THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'agreement', to_jsonb(v_existing));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  INSERT INTO public.agency_client_agreements (
    agency_id, client_name, client_gstin, payment_terms_days, status, idempotency_key, created_by
  ) VALUES (
    v_agency_id, v_name, v_gstin, p_payment_terms_days, 'active', v_key, auth.uid()
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object('ok', true, 'state', 'created', 'agreement', to_jsonb(v_inserted));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_client_agreement_update(
  p_agreement_id uuid,
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
  v_current public.agency_client_agreements%ROWTYPE;
  v_updated public.agency_client_agreements%ROWTYPE;
  v_name text;
  v_gstin text;
  v_terms integer;
  v_status text;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client agreement not found or access denied.';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  v_name := v_current.client_name;
  v_gstin := v_current.client_gstin;
  v_terms := v_current.payment_terms_days;
  v_status := v_current.status;

  IF p_patch ? 'client_name' THEN
    v_name := btrim(coalesce(p_patch->>'client_name', ''));
    IF v_name = '' THEN
      RAISE EXCEPTION 'Client name is required.';
    END IF;
  END IF;

  IF p_patch ? 'client_gstin' THEN
    v_gstin := nullif(upper(btrim(coalesce(p_patch->>'client_gstin', ''))), '');
    IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
      RAISE EXCEPTION 'GSTIN format is invalid.';
    END IF;
  END IF;

  IF p_patch ? 'payment_terms_days' THEN
    v_terms := nullif(p_patch->>'payment_terms_days', '')::integer;
    IF v_terms IS NOT NULL AND (v_terms < 0 OR v_terms > 365) THEN
      RAISE EXCEPTION 'Payment terms must be between 0 and 365 days.';
    END IF;
  END IF;

  IF p_patch ? 'status' THEN
    v_status := p_patch->>'status';
    IF v_status IS NULL OR v_status NOT IN ('active', 'ended') THEN
      RAISE EXCEPTION 'Unknown agreement status.';
    END IF;
  END IF;

  UPDATE public.agency_client_agreements
  SET client_name = v_name,
      client_gstin = v_gstin,
      payment_terms_days = v_terms,
      status = v_status,
      version = version + 1
  WHERE id = p_agreement_id AND agency_id = v_agency_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'updated', 'agreement', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_client_site_create(
  p_agreement_id uuid,
  p_site_kind text,
  p_label text,
  p_address_line text,
  p_city text,
  p_state text,
  p_pincode text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_existing public.agency_client_sites%ROWTYPE;
  v_inserted public.agency_client_sites%ROWTYPE;
  v_pincode text := btrim(coalesce(p_pincode, ''));
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client agreement not found or access denied.';
  END IF;

  IF p_site_kind IS NULL OR p_site_kind NOT IN ('bill_to', 'ship_to') THEN
    RAISE EXCEPTION 'Unknown site kind.';
  END IF;

  IF btrim(coalesce(p_label, '')) = '' OR btrim(coalesce(p_address_line, '')) = ''
     OR btrim(coalesce(p_city, '')) = '' OR btrim(coalesce(p_state, '')) = '' THEN
    RAISE EXCEPTION 'Site label, address, city and state are required.';
  END IF;

  IF v_pincode !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Pincode must be six digits.';
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_client_sites
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.agreement_id = p_agreement_id
       AND v_existing.site_kind = p_site_kind
       AND v_existing.label = btrim(p_label) THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'site', to_jsonb(v_existing));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  IF p_site_kind = 'bill_to' AND EXISTS (
    SELECT 1 FROM public.agency_client_sites s
    WHERE s.agreement_id = p_agreement_id AND s.site_kind = 'bill_to' AND s.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_bill_to_exists');
  END IF;

  INSERT INTO public.agency_client_sites (
    agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key
  ) VALUES (
    v_agency_id, p_agreement_id, p_site_kind, btrim(p_label), btrim(p_address_line),
    btrim(p_city), btrim(p_state), v_pincode, 'active', v_key
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object('ok', true, 'state', 'created', 'site', to_jsonb(v_inserted));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_client_site_update(
  p_site_id uuid,
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
  v_current public.agency_client_sites%ROWTYPE;
  v_updated public.agency_client_sites%ROWTYPE;
  v_label text;
  v_address text;
  v_city text;
  v_state text;
  v_pincode text;
  v_status text;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_client_sites
  WHERE id = p_site_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client site not found or access denied.';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  v_label := v_current.label;
  v_address := v_current.address_line;
  v_city := v_current.city;
  v_state := v_current.state;
  v_pincode := v_current.pincode;
  v_status := v_current.status;

  IF p_patch ? 'label' THEN
    v_label := btrim(coalesce(p_patch->>'label', ''));
    IF v_label = '' THEN RAISE EXCEPTION 'Site label, address, city and state are required.'; END IF;
  END IF;
  IF p_patch ? 'address_line' THEN
    v_address := btrim(coalesce(p_patch->>'address_line', ''));
    IF v_address = '' THEN RAISE EXCEPTION 'Site label, address, city and state are required.'; END IF;
  END IF;
  IF p_patch ? 'city' THEN
    v_city := btrim(coalesce(p_patch->>'city', ''));
    IF v_city = '' THEN RAISE EXCEPTION 'Site label, address, city and state are required.'; END IF;
  END IF;
  IF p_patch ? 'state' THEN
    v_state := btrim(coalesce(p_patch->>'state', ''));
    IF v_state = '' THEN RAISE EXCEPTION 'Site label, address, city and state are required.'; END IF;
  END IF;
  IF p_patch ? 'pincode' THEN
    v_pincode := btrim(coalesce(p_patch->>'pincode', ''));
    IF v_pincode !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Pincode must be six digits.'; END IF;
  END IF;
  IF p_patch ? 'status' THEN
    v_status := p_patch->>'status';
    IF v_status IS NULL OR v_status NOT IN ('active', 'inactive') THEN
      RAISE EXCEPTION 'Unknown site status.';
    END IF;
  END IF;

  IF v_status = 'active' AND v_current.site_kind = 'bill_to' AND EXISTS (
    SELECT 1 FROM public.agency_client_sites s
    WHERE s.agreement_id = v_current.agreement_id
      AND s.site_kind = 'bill_to'
      AND s.status = 'active'
      AND s.id <> p_site_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_bill_to_exists');
  END IF;

  UPDATE public.agency_client_sites
  SET label = v_label,
      address_line = v_address,
      city = v_city,
      state = v_state,
      pincode = v_pincode,
      status = v_status,
      version = version + 1
  WHERE id = p_site_id AND agency_id = v_agency_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'updated', 'site', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_client_contact_create(
  p_agreement_id uuid,
  p_full_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_site_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := regexp_replace(btrim(coalesce(p_phone, '')), '[[:space:]]', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_existing public.agency_client_contacts%ROWTYPE;
  v_inserted public.agency_client_contacts%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client agreement not found or access denied.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Contact name is required.';
  END IF;

  IF v_phone !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Contact phone is invalid.';
  END IF;

  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Contact email is invalid.';
  END IF;

  IF p_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agency_client_sites s
    WHERE s.id = p_site_id AND s.agreement_id = p_agreement_id AND s.agency_id = v_agency_id
  ) THEN
    RAISE EXCEPTION 'Site not found for this agreement.';
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_client_contacts
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.agreement_id = p_agreement_id AND v_existing.full_name = v_name THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'contact', to_jsonb(v_existing));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  INSERT INTO public.agency_client_contacts (
    agency_id, agreement_id, site_id, full_name, phone, email, status, idempotency_key
  ) VALUES (
    v_agency_id, p_agreement_id, p_site_id, v_name, v_phone, v_email, 'active', v_key
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object('ok', true, 'state', 'created', 'contact', to_jsonb(v_inserted));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_client_contact_update(
  p_contact_id uuid,
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
  v_current public.agency_client_contacts%ROWTYPE;
  v_updated public.agency_client_contacts%ROWTYPE;
  v_name text;
  v_phone text;
  v_email text;
  v_status text;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_client_contacts
  WHERE id = p_contact_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client contact not found or access denied.';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  v_name := v_current.full_name;
  v_phone := v_current.phone;
  v_email := v_current.email;
  v_status := v_current.status;

  IF p_patch ? 'full_name' THEN
    v_name := btrim(coalesce(p_patch->>'full_name', ''));
    IF v_name = '' THEN RAISE EXCEPTION 'Contact name is required.'; END IF;
  END IF;

  IF p_patch ? 'phone' THEN
    v_phone := regexp_replace(btrim(coalesce(p_patch->>'phone', '')), '[[:space:]]', '', 'g');
    IF v_phone !~ '^\+?[0-9]{10,15}$' THEN RAISE EXCEPTION 'Contact phone is invalid.'; END IF;
  END IF;

  IF p_patch ? 'email' THEN
    v_email := nullif(lower(btrim(coalesce(p_patch->>'email', ''))), '');
    IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Contact email is invalid.';
    END IF;
  END IF;

  IF p_patch ? 'status' THEN
    v_status := p_patch->>'status';
    IF v_status IS NULL OR v_status NOT IN ('active', 'inactive') THEN
      RAISE EXCEPTION 'Unknown contact status.';
    END IF;
  END IF;

  UPDATE public.agency_client_contacts
  SET full_name = v_name,
      phone = v_phone,
      email = v_email,
      status = v_status,
      version = version + 1
  WHERE id = p_contact_id AND agency_id = v_agency_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'updated', 'contact', to_jsonb(v_updated));
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Tariff publish RPC (supersede by new version; expected head; no overlap)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_tariff_version_publish(
  p_agreement_id uuid,
  p_origin text,
  p_destination text,
  p_rate_basis text,
  p_rate_amount numeric,
  p_effective_from date,
  p_vehicle_type text DEFAULT NULL,
  p_effective_to date DEFAULT NULL,
  p_supersedes_version_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_origin_key text := lower(btrim(coalesce(p_origin, '')));
  v_destination_key text := lower(btrim(coalesce(p_destination, '')));
  v_vehicle_key text := coalesce(p_vehicle_type, '*');
  v_head public.agency_tariff_versions%ROWTYPE;
  v_existing public.agency_tariff_versions%ROWTYPE;
  v_inserted public.agency_tariff_versions%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client agreement not found or access denied.';
  END IF;

  IF v_origin_key = '' OR v_destination_key = '' THEN
    RAISE EXCEPTION 'Lane origin and destination are required.';
  END IF;

  IF p_rate_basis IS NULL OR p_rate_basis NOT IN ('per_trip', 'per_tonne', 'per_km') THEN
    RAISE EXCEPTION 'Unknown rate basis.';
  END IF;

  IF p_rate_amount IS NULL OR p_rate_amount <= 0 THEN
    RAISE EXCEPTION 'Rate amount must be greater than zero.';
  END IF;

  -- Documented rounding policy: amounts are stored at two decimals and never
  -- silently rounded; a finer amount is refused.
  IF p_rate_amount <> round(p_rate_amount, 2) THEN
    RAISE EXCEPTION 'Rate amount must have at most two decimal places.';
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Effective start is required.';
  END IF;

  IF p_effective_to IS NOT NULL AND p_effective_to <= p_effective_from THEN
    RAISE EXCEPTION 'Effective end must be after effective start.';
  END IF;

  IF p_vehicle_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trucks t WHERE t.code = p_vehicle_type
  ) THEN
    RAISE EXCEPTION 'Unknown vehicle type.';
  END IF;

  -- Serialise writers per lane (transaction-scoped advisory lock).
  PERFORM pg_advisory_xact_lock(hashtext(
    p_agreement_id::text || '|' || v_origin_key || '|' || v_destination_key || '|' || v_vehicle_key
  ));

  SELECT * INTO v_existing
  FROM public.agency_tariff_versions
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.agreement_id = p_agreement_id
       AND v_existing.origin_key = v_origin_key
       AND v_existing.destination_key = v_destination_key
       AND v_existing.vehicle_key = v_vehicle_key
       AND v_existing.rate_basis = p_rate_basis
       AND v_existing.rate_amount = p_rate_amount
       AND v_existing.effective_from = p_effective_from
       AND v_existing.effective_to IS NOT DISTINCT FROM p_effective_to
       AND v_existing.supersedes_version_id IS NOT DISTINCT FROM p_supersedes_version_id THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'tariff', to_jsonb(v_existing));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  SELECT * INTO v_head
  FROM public.agency_tariff_versions
  WHERE agreement_id = p_agreement_id
    AND origin_key = v_origin_key
    AND destination_key = v_destination_key
    AND vehicle_key = v_vehicle_key
  ORDER BY version_no DESC
  LIMIT 1;

  -- Expected head: the caller must name the current head (NULL when none).
  IF p_supersedes_version_id IS DISTINCT FROM v_head.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version_id', v_head.id);
  END IF;

  IF v_head.id IS NOT NULL THEN
    IF p_effective_from <= v_head.effective_from THEN
      RETURN jsonb_build_object('ok', false, 'error', 'tariff_overlap');
    END IF;
    IF v_head.effective_to IS NOT NULL AND p_effective_from < v_head.effective_to THEN
      RETURN jsonb_build_object('ok', false, 'error', 'tariff_overlap');
    END IF;
  END IF;

  INSERT INTO public.agency_tariff_versions (
    agency_id, agreement_id, origin_label, origin_key, destination_label, destination_key,
    vehicle_type, vehicle_key, rate_basis, rate_amount, currency,
    effective_from, effective_to, version_no, supersedes_version_id, idempotency_key, created_by
  ) VALUES (
    v_agency_id, p_agreement_id, btrim(p_origin), v_origin_key, btrim(p_destination), v_destination_key,
    p_vehicle_type, v_vehicle_key, p_rate_basis, p_rate_amount, 'INR',
    p_effective_from, p_effective_to, coalesce(v_head.version_no, 0) + 1, v_head.id, v_key, auth.uid()
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object('ok', true, 'state', 'published', 'tariff', to_jsonb(v_inserted));
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Driver invitation RPCs (link to D1 agency_driver_employment on accept)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_driver_invitation_create(
  p_invited_phone text,
  p_expires_in_days integer DEFAULT 7,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_phone text := regexp_replace(btrim(coalesce(p_invited_phone, '')), '[[:space:]]', '', 'g');
  v_token text;
  v_existing public.agency_driver_invitations%ROWTYPE;
  v_inserted public.agency_driver_invitations%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  IF v_phone !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Driver phone is invalid.';
  END IF;

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 OR p_expires_in_days > 30 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 30 days.';
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_driver_invitations
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.invited_phone = v_phone THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'invitation', to_jsonb(v_existing) - 'token_hash');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  UPDATE public.agency_driver_invitations
  SET status = 'expired', version = version + 1
  WHERE agency_id = v_agency_id
    AND invited_phone = v_phone
    AND status = 'pending'
    AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.agency_driver_invitations
    WHERE agency_id = v_agency_id AND invited_phone = v_phone AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending');
  END IF;

  v_token := public.agency_random_token();

  INSERT INTO public.agency_driver_invitations (
    agency_id, invited_phone, token_hash, status, expires_at, idempotency_key, created_by
  ) VALUES (
    v_agency_id, v_phone, public.agency_token_hash(v_token), 'pending',
    now() + make_interval(days => p_expires_in_days), v_key, auth.uid()
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'created',
    'token', v_token,
    'invitation', to_jsonb(v_inserted) - 'token_hash'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_invitation_revoke(
  p_invitation_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_current public.agency_driver_invitations%ROWTYPE;
  v_updated public.agency_driver_invitations%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.agency_driver_invitations
  WHERE id = p_invitation_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver invitation not found or access denied.';
  END IF;

  IF v_current.status = 'revoked' THEN
    IF v_current.version = p_expected_version THEN
      RETURN jsonb_build_object('ok', true, 'state', 'already_revoked', 'invitation', to_jsonb(v_current) - 'token_hash');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  IF v_current.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_current.version);
  END IF;

  UPDATE public.agency_driver_invitations
  SET status = 'revoked', revoked_at = now(), version = version + 1
  WHERE id = p_invitation_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'revoked', 'invitation', to_jsonb(v_updated) - 'token_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_invitation_accept(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_driver_count integer;
  v_driver public.drivers%ROWTYPE;
  v_inv public.agency_driver_invitations%ROWTYPE;
  v_emp public.agency_driver_employment%ROWTYPE;
  v_state text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign-in is required.';
  END IF;

  SELECT count(*)::int INTO v_driver_count FROM public.drivers d WHERE d.user_id = v_caller;

  IF v_driver_count = 0 THEN
    RAISE EXCEPTION 'No driver profile found for this account.';
  END IF;

  IF v_driver_count > 1 THEN
    RAISE EXCEPTION 'Multiple driver profiles found for this account.';
  END IF;

  SELECT * INTO v_driver FROM public.drivers d WHERE d.user_id = v_caller;

  IF btrim(coalesce(p_token, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  SELECT * INTO v_inv
  FROM public.agency_driver_invitations
  WHERE token_hash = public.agency_token_hash(btrim(p_token))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  IF NOT public.agency_is_operational(v_inv.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_inv.status = 'accepted' THEN
    IF v_inv.accepted_by = v_caller THEN
      SELECT * INTO v_emp FROM public.agency_driver_employment e WHERE e.id = v_inv.employment_id;
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'employment', to_jsonb(v_emp));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_revoked');
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  IF regexp_replace(v_driver.phone, '[[:space:]]', '', 'g') <> v_inv.invited_phone THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_recipient_mismatch');
  END IF;

  IF NOT public.driver_is_approved_for_assignment(v_driver.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_approved');
  END IF;

  SELECT * INTO v_emp
  FROM public.agency_driver_employment e
  WHERE e.driver_id = v_driver.id AND e.status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_emp.agency_id <> v_inv.agency_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'driver_already_employed_elsewhere');
    END IF;
    v_state := 'already_employed';
  ELSE
    INSERT INTO public.agency_driver_employment (agency_id, driver_id, status)
    VALUES (v_inv.agency_id, v_driver.id, 'active')
    RETURNING * INTO v_emp;
    v_state := 'accepted';
  END IF;

  UPDATE public.agency_driver_invitations
  SET status = 'accepted',
      accepted_by = v_caller,
      accepted_at = now(),
      accepted_driver_id = v_driver.id,
      employment_id = v_emp.id,
      version = version + 1
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'employment', to_jsonb(v_emp));
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. GRANT hygiene (no PUBLIC/anon EXECUTE; helpers stay internal)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.agency_random_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_token_hash(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_caller_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_agency_tariff_mutation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agency_member_has_scope(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_tariff_rate_at(uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agency_member_invite(text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_member_invitation_revoke(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_member_accept(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_member_revoke(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_member_change_scope(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_client_agreement_create(text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_client_agreement_update(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_client_site_create(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_client_site_update(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_client_contact_create(uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_client_contact_update(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_tariff_version_publish(uuid, text, text, text, numeric, date, text, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_invitation_create(text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_invitation_revoke(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_driver_invitation_accept(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.agency_member_has_scope(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_tariff_rate_at(uuid, text, text, text, date) TO service_role;

GRANT EXECUTE ON FUNCTION public.agency_member_invite(text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_member_invitation_revoke(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_member_accept(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_member_revoke(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_member_change_scope(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_client_agreement_create(text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_client_agreement_update(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_client_site_create(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_client_site_update(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_client_contact_create(uuid, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_client_contact_update(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_tariff_version_publish(uuid, text, text, text, numeric, date, text, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_driver_invitation_create(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_driver_invitation_revoke(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_driver_invitation_accept(text) TO authenticated;
