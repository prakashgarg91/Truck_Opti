-- =========================================================
-- TO-143-D2: actual fleet assignment and transactional reservations.
--
-- Sorts after 20261008000000_agency_fleet_foundation.sql. One forward migration,
-- PGlite-replayable, additive only (no destructive operations).
-- Proof: scripts/fleet_assignment_reservations.db.test.mjs on the full-chain
-- PGlite replay; the four maintained batteries re-run in-chain. Hosted rollout
-- is owner-gated (TO-153).
--
-- 1. public.fleet_assignment_reservations: agency-scoped reservation of an
--    eligible vehicle and an active driver employment against one agency job
--    and its job offer, for a [window_start, window_end) interval. Status is
--    active / released / consumed. Version + idempotency key per agency.
--    RLS: owner (or admin) SELECT only; authenticated has no direct write
--    privilege, so every write goes through the command RPCs or triggers.
--
-- 2. Overlap guard (BEFORE INSERT/UPDATE trigger, database-level): no two ACTIVE
--    reservations may hold the same vehicle or the same driver for overlapping
--    windows. The trigger takes row locks on the vehicle then the driver (fixed
--    order), then checks tstzrange overlap; under READ COMMITTED each statement
--    takes a fresh snapshot after the lock wait, so the concurrent loser sees
--    the committed winner and raises exclusion_violation. This avoids a
--    btree_gist dependency that the other maintained batteries do not load.
--    One ACTIVE reservation per agency job is a partial UNIQUE index.
--
-- 3. reserve_fleet_assignment(...) jsonb command (consent-writer conventions):
--    SECURITY DEFINER, SET search_path = public, caller-bound agency from
--    auth.uid() via resolve_caller_agency_id (fail-closed), operational gate,
--    expected VEHICLE version (version_conflict jsonb, never an exception),
--    idempotency-key replay per agency, BOTH TO-144-D1 eligibility predicates
--    evaluated at window start AND end (maintenance and availability blocks
--    included), and an offer that is still live (pending and unexpired, or
--    accepted) for the same shipment and driver. Overlap races are caught and
--    returned as typed vehicle_reserved / driver_reserved results.
--
-- 4. release_fleet_assignment(id, expected_version) jsonb: manual release with
--    expected-version and an exactly-once replay (already_released).
--
-- 5. Automatic release (existing transitions are hooked, not rewritten):
--    - job_offers status -> declined | expired | cancelled releases the offer's
--      active reservation;
--    - job_offers status -> delivered consumes the active reservation and keeps
--      the assignment (single-load behaviour unchanged; accept keeps it active);
--    - agency_jobs status -> cancelled releases the job's active reservation;
--    - release_stale_fleet_reservations(agency, as_of) (service_role only) marks
--      pending offers past expires_at that hold an active reservation as expired,
--      which the offer trigger then releases. reserve also runs it for the
--      caller's own agency so a stale offer never blocks a new assignment.
--
-- 7. Authority note (deliberate). agency_jobs.truck_id / driver_id are NOT
--    written by this migration. The reservation table is the authority for
--    vehicle and driver allocation. trg_agency_jobs_driver_assignment
--    (20261006120000:270-274) admits a driver only when agency_trucks.driver_id
--    already links that driver to the agency (the legacy one-truck model). The
--    D1 agency_driver_employment relationship does not satisfy that guard, and
--    the guard is NOT weakened here. Reconciling the two driver-to-agency models
--    and projecting reservations onto agency_jobs is open for TO-143-D3 / owner.
--
-- Out of scope (not authored here): dispatch_job_to_drivers and the consent
-- writer are reused unchanged; no tax, payroll or ERP.
-- =========================================================

-- ---------------------------------------------------------------------------
-- 1. Reservations table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fleet_assignment_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  agency_job_id UUID NOT NULL REFERENCES public.agency_jobs (id) ON DELETE CASCADE,
  job_offer_id UUID NOT NULL REFERENCES public.job_offers (id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.agency_trucks (id) ON DELETE CASCADE,
  driver_employment_id UUID NOT NULL REFERENCES public.agency_driver_employment (id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
  released_reason TEXT,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fleet_reservation_window_valid CHECK (window_end > window_start),
  CONSTRAINT fleet_reservation_idempotency_key UNIQUE (agency_id, idempotency_key)
);

-- At most one ACTIVE reservation per agency job (a job holds one assignment).
CREATE UNIQUE INDEX IF NOT EXISTS fleet_reservations_one_active_per_job
  ON public.fleet_assignment_reservations (agency_job_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS fleet_reservations_vehicle_active_idx
  ON public.fleet_assignment_reservations (vehicle_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS fleet_reservations_driver_active_idx
  ON public.fleet_assignment_reservations (driver_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS fleet_reservations_offer_idx
  ON public.fleet_assignment_reservations (job_offer_id);

ALTER TABLE public.fleet_assignment_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_reservations_select ON public.fleet_assignment_reservations;

CREATE POLICY fleet_reservations_select ON public.fleet_assignment_reservations
  FOR SELECT TO authenticated
  USING (
    agency_id IN (
      SELECT ta.id
      FROM public.transport_agencies ta
      WHERE ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

-- No INSERT/UPDATE/DELETE policy and no table write privilege for the API
-- roles: writes happen only inside the SECURITY DEFINER commands and triggers.
REVOKE ALL ON public.fleet_assignment_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_assignment_reservations TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Row-level triggers: version bump, updated_at, overlap guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_fleet_reservation_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_reservations_version ON public.fleet_assignment_reservations;
CREATE TRIGGER trg_fleet_reservations_version
  BEFORE UPDATE ON public.fleet_assignment_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_fleet_reservation_version();

DROP TRIGGER IF EXISTS trg_fleet_reservations_updated_at ON public.fleet_assignment_reservations;
CREATE TRIGGER trg_fleet_reservations_updated_at
  BEFORE UPDATE ON public.fleet_assignment_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_fleet_reservation_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Serialize writers per resource in a fixed order (vehicle, then driver).
  -- The statements below run after any lock wait, so a concurrent winner's
  -- committed reservation is visible to them (READ COMMITTED).
  PERFORM 1 FROM public.agency_trucks WHERE id = NEW.vehicle_id FOR UPDATE;
  PERFORM 1 FROM public.drivers WHERE id = NEW.driver_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.fleet_assignment_reservations r
    WHERE r.id <> NEW.id
      AND r.status = 'active'
      AND r.vehicle_id = NEW.vehicle_id
      AND tstzrange(r.window_start, r.window_end, '[)')
          && tstzrange(NEW.window_start, NEW.window_end, '[)')
  ) THEN
    RAISE EXCEPTION 'Vehicle reservation overlaps an active reservation.'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fleet_assignment_reservations r
    WHERE r.id <> NEW.id
      AND r.status = 'active'
      AND r.driver_id = NEW.driver_id
      AND tstzrange(r.window_start, r.window_end, '[)')
          && tstzrange(NEW.window_start, NEW.window_end, '[)')
  ) THEN
    RAISE EXCEPTION 'Driver reservation overlaps an active reservation.'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_reservations_overlap_guard ON public.fleet_assignment_reservations;
CREATE TRIGGER trg_fleet_reservations_overlap_guard
  BEFORE INSERT OR UPDATE ON public.fleet_assignment_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fleet_reservation_overlap();

-- ---------------------------------------------------------------------------
-- 3. Automatic release / consume hooks on existing transitions
-- ---------------------------------------------------------------------------

-- job_offers: declined / expired / cancelled release; delivered consumes.
-- Only the status transition is observed; the OTP and trip writers are unchanged.
CREATE OR REPLACE FUNCTION public.release_fleet_reservations_on_offer_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('declined', 'expired', 'cancelled') THEN
    UPDATE public.fleet_assignment_reservations r
    SET status = 'released',
        released_reason = 'offer_' || NEW.status
    WHERE r.job_offer_id = NEW.id
      AND r.status = 'active';
  ELSIF NEW.status = 'delivered' THEN
    UPDATE public.fleet_assignment_reservations r
    SET status = 'consumed'
    WHERE r.job_offer_id = NEW.id
      AND r.status = 'active';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_offer_reservation_release ON public.job_offers;
CREATE TRIGGER trg_fleet_offer_reservation_release
  AFTER UPDATE OF status ON public.job_offers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.release_fleet_reservations_on_offer_transition();

CREATE OR REPLACE FUNCTION public.release_fleet_reservations_on_job_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.fleet_assignment_reservations r
  SET status = 'released',
      released_reason = 'agency_job_cancelled'
  WHERE r.agency_job_id = NEW.id
    AND r.status = 'active';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_job_reservation_release ON public.agency_jobs;
CREATE TRIGGER trg_fleet_job_reservation_release
  AFTER UPDATE OF status ON public.agency_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.release_fleet_reservations_on_job_cancel();

-- ---------------------------------------------------------------------------
-- 4. Expiry sweep (service_role; reserve also calls it for the caller agency)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_stale_fleet_reservations(
  p_agency_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired integer;
BEGIN
  -- Pending offers past expires_at that still hold an active reservation become
  -- 'expired'; the offer trigger then releases the reservation. Returns the
  -- number of offers expired.
  WITH expired AS (
    UPDATE public.job_offers jo
    SET status = 'expired'
    WHERE jo.status = 'pending'
      AND jo.expires_at <= p_as_of
      AND EXISTS (
        SELECT 1
        FROM public.fleet_assignment_reservations r
        WHERE r.job_offer_id = jo.id
          AND r.status = 'active'
          AND (p_agency_id IS NULL OR r.agency_id = p_agency_id)
      )
    RETURNING jo.id
  )
  SELECT count(*)::integer INTO v_expired FROM expired;

  RETURN v_expired;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Command RPCs (typed jsonb envelopes; caller-bound; expected-version)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_fleet_assignment(
  p_agency_job_id uuid,
  p_job_offer_id uuid,
  p_vehicle_id uuid,
  p_driver_employment_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_expected_vehicle_version integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_now timestamptz := NOW();
  v_job public.agency_jobs%ROWTYPE;
  v_employment public.agency_driver_employment%ROWTYPE;
  v_vehicle public.agency_trucks%ROWTYPE;
  v_offer public.job_offers%ROWTYPE;
  v_existing public.fleet_assignment_reservations%ROWTYPE;
  v_inserted public.fleet_assignment_reservations%ROWTYPE;
  v_message text;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'Reservation window is required.';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'Reservation window must end after it starts.';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  -- (a) Idempotent replay, scoped to the caller agency. Same key + same request
  --     returns the stored reservation; same key + different request is refused.
  SELECT * INTO v_existing
  FROM public.fleet_assignment_reservations
  WHERE agency_id = v_agency_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.agency_job_id = p_agency_job_id
       AND v_existing.job_offer_id = p_job_offer_id
       AND v_existing.vehicle_id = p_vehicle_id
       AND v_existing.driver_employment_id = p_driver_employment_id
       AND v_existing.window_start = p_window_start
       AND v_existing.window_end = p_window_end THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'idempotent_replay',
        'reservation', to_jsonb(v_existing),
        'version', v_existing.version
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  -- (b) Settle this agency's stale offers first, so an expired hold never blocks.
  PERFORM public.release_stale_fleet_reservations(v_agency_id, v_now);

  -- (c) Caller-owned job, employment and vehicle. Foreign ids fail closed as
  --     not found, never as a different denial.
  SELECT * INTO v_job
  FROM public.agency_jobs
  WHERE id = p_agency_job_id
    AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency job not found or access denied.';
  END IF;

  SELECT * INTO v_employment
  FROM public.agency_driver_employment
  WHERE id = p_driver_employment_id
    AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employment record not found or access denied.';
  END IF;

  SELECT * INTO v_vehicle
  FROM public.agency_trucks
  WHERE id = p_vehicle_id
    AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found or access denied.';
  END IF;

  IF v_job.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_job_not_open');
  END IF;

  -- (d) Expected vehicle version: the caller acted on a stale vehicle state.
  IF v_vehicle.version <> p_expected_vehicle_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'version_conflict',
      'current_version', v_vehicle.version
    );
  END IF;

  -- (e) TO-144-D1 eligibility, evaluated at BOTH window edges. The vehicle
  --     predicate covers availability, maintenance flag and blocked-until,
  --     and document expiry; the driver predicate covers active employment for
  --     this agency, approval and licence validity.
  IF NOT (
    public.agency_vehicle_allocation_eligible(p_vehicle_id, p_window_start)
    AND public.agency_vehicle_allocation_eligible(p_vehicle_id, p_window_end)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vehicle_not_eligible');
  END IF;

  IF NOT (
    public.agency_driver_allocation_eligible(v_employment.driver_id, v_agency_id, p_window_start)
    AND public.agency_driver_allocation_eligible(v_employment.driver_id, v_agency_id, p_window_end)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_eligible');
  END IF;

  -- (f) The offer must be live for this job's shipment and this driver:
  --     pending and unexpired, or already accepted.
  SELECT * INTO v_offer
  FROM public.job_offers
  WHERE id = p_job_offer_id;

  IF NOT FOUND
     OR v_offer.shipment_id IS DISTINCT FROM v_job.shipment_id
     OR v_offer.driver_id IS DISTINCT FROM v_employment.driver_id
     OR NOT (
       v_offer.status = 'accepted'
       OR (v_offer.status = 'pending' AND v_offer.expires_at > v_now)
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_active');
  END IF;

  -- (g) One active assignment per agency job (the partial unique index is the
  --     backstop for a concurrent insert, handled below).
  IF EXISTS (
    SELECT 1
    FROM public.fleet_assignment_reservations r
    WHERE r.agency_job_id = p_agency_job_id
      AND r.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_job_already_assigned');
  END IF;

  -- (h) Write. The reservation is the authority for vehicle/driver allocation.
  --     agency_jobs.truck_id / driver_id are NOT written here: the TO-142 guard
  --     trg_agency_jobs_driver_assignment only admits a driver already on the
  --     legacy agency_trucks.driver_id model, which is a separate relationship
  --     from agency_driver_employment (see the header, section 7). The overlap
  --     guard raises inside the INSERT; the EXCEPTION block turns that into a
  --     typed result with nothing written.
  BEGIN
    INSERT INTO public.fleet_assignment_reservations (
      agency_id, agency_job_id, job_offer_id, vehicle_id, driver_employment_id, driver_id,
      window_start, window_end, status, idempotency_key
    ) VALUES (
      v_agency_id, p_agency_job_id, p_job_offer_id, p_vehicle_id, v_employment.id, v_employment.driver_id,
      p_window_start, p_window_end, 'active', p_idempotency_key
    )
    RETURNING * INTO v_inserted;
  EXCEPTION
    WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message LIKE 'Vehicle reservation%' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'vehicle_reserved');
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', 'driver_reserved');
    WHEN unique_violation THEN
      SELECT * INTO v_existing
      FROM public.fleet_assignment_reservations
      WHERE agency_id = v_agency_id
        AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF v_existing.agency_job_id = p_agency_job_id
           AND v_existing.job_offer_id = p_job_offer_id
           AND v_existing.vehicle_id = p_vehicle_id
           AND v_existing.driver_employment_id = p_driver_employment_id
           AND v_existing.window_start = p_window_start
           AND v_existing.window_end = p_window_end THEN
          RETURN jsonb_build_object(
            'ok', true,
            'state', 'idempotent_replay',
            'reservation', to_jsonb(v_existing),
            'version', v_existing.version
          );
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
      END IF;

      RETURN jsonb_build_object('ok', false, 'error', 'agency_job_already_assigned');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'created',
    'reservation', to_jsonb(v_inserted),
    'version', v_inserted.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_fleet_assignment(
  p_reservation_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_current public.fleet_assignment_reservations%ROWTYPE;
  v_updated public.fleet_assignment_reservations%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_id();

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_current
  FROM public.fleet_assignment_reservations
  WHERE id = p_reservation_id
    AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found or access denied.';
  END IF;

  -- Exactly-once replay: an already released row, checked with the version the
  -- caller got back from its release, returns without a second write.
  IF v_current.status = 'released' AND v_current.version = p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'already_released',
      'reservation', to_jsonb(v_current),
      'version', v_current.version
    );
  END IF;

  IF v_current.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'version_conflict',
      'current_version', v_current.version
    );
  END IF;

  IF v_current.status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'reservation_not_active',
      'current_version', v_current.version
    );
  END IF;

  UPDATE public.fleet_assignment_reservations
  SET status = 'released',
      released_reason = 'manual_release'
  WHERE id = p_reservation_id
    AND version = p_expected_version
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'released',
    'reservation', to_jsonb(v_updated),
    'version', v_updated.version
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. GRANT hygiene (TO-144-D1 precedent): no PUBLIC/anon EXECUTE. The command
--    RPCs are interactive-client commands -> authenticated only. The expiry sweep
--    is service-side and spans agencies -> service_role only.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.bump_fleet_reservation_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_fleet_reservation_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_fleet_reservations_on_offer_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_fleet_reservations_on_job_cancel() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reserve_fleet_assignment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_fleet_assignment(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_stale_fleet_reservations(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_fleet_assignment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_fleet_assignment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_fleet_reservations(uuid, timestamptz) TO service_role;
