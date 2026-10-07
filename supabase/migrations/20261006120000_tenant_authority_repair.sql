-- =========================================================
-- TO-142: repair tenant, usage and private-document authority.
--
-- One cohesive forward migration covering the mapped plan items 1-6:
--
--   1. RLS-safe fleet assignment guards. The three guard triggers
--      (agency_trucks driver assignment, agency_jobs driver assignment,
--      driver_payouts agency_pay insert) early-returned when auth.uid() IS
--      NULL (service-role writes were unguarded) and resolved drivers through
--      a plain SELECT that RLS ("Drivers: own record") filtered for agency
--      users, so authenticated assignments of valid approved drivers failed.
--      The triggers now resolve every cross-tenant lookup through SECURITY
--      DEFINER helpers with pinned search_path, keep the public.is_admin_user()
--      bypass for genuine DB-admin paths, and enforce on BOTH the
--      authenticated and the service-role path.
--      Pinned duplicate rule: a driver holds at most ONE truck row globally.
--      Cross-agency -> 'Driver is already assigned to another agency.'
--      (existing message); same-agency second truck ->
--      'Driver is already assigned to another truck.'
--
--   2. Explicit customer-consented / platform-dispatched shipment
--      authorization (roadmap §6 authorizeAgency creates a scoped
--      permission). New public.shipment_agency_consents table; the producer
--      is the dispatch pipeline (TO-143). agency_jobs INSERT/UPDATE now
--      require an active (unrevoked) authorization for (shipment_id,
--      agency_id), which also removes the row the job_offers offer policy
--      requires, so the foreign-agency offer path denies as well.
--
--   3. Suspended/pending agencies are non-operational at the DB write layer:
--      agency-status predicates on agency_jobs INSERT/UPDATE policies (reads
--      and DELETE stay ownership-only so a suspended tenant's portal keeps
--      rendering) and inside the fleet/payout guards. The Edge gate
--      (portal-auth assertApprovedAgency) is unchanged and stays the
--      HTTP-layer authority. Driver-requested payouts (type='withdrawal')
--      remain outside the agency-status gate.
--
--   4. Caller-bound usage/plan RPCs: has_active_subscription, get_user_plan,
--      check_usage_limit, increment_usage reject a foreign p_user_id with a
--      typed error, pin SET search_path = public, and drop the default
--      PUBLIC/default-privilege EXECUTE (granted to authenticated only).
--      No Edge Function or frontend caller breaks: the frontend always passes
--      its own user.id behind auth guards, and grep shows zero Edge callers.
--
--   5. REVOKE EXECUTE on ensure_shipment_document_numbers(UUID) FROM PUBLIC
--      (the authenticated grant persists; anon is now denied by privilege in
--      addition to the internal guard).
--
--   6. billing-documents and trip-photos become PRIVATE buckets. Readers
--      resolve documents through narrowly authorized RLS policies plus
--      expiring signed URLs minted by trusted edges (invoice-view Edge
--      function, driver upload session); world-readable URLs are no longer
--      produced or trusted. Stored trip-photo references stay full-URL-shaped
--      (is_job_trip_photo_url contract unchanged) and readers re-sign by
--      extracting the object path. avatars and driver-docs are untouched
--      (avatars are legitimate public assets; driver-docs is already private
--      with its own signed flow).
-- =========================================================

-- ---------------------------------------------------------------------------
-- 1. RLS-safe SECURITY DEFINER helpers (items 1, 3, 6)
--    All pinned to search_path = public. EXECUTE is revoked from PUBLIC and
--    anon (also undoing the platform default privilege that grants EXECUTE to
--    every new function) and granted to authenticated + service_role: the
--    guard triggers fire as the invoking role, so the caller must hold
--    EXECUTE, and the deployed service path runs as service_role (BYPASSRLS
--    does not cover function EXECUTE).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.driver_is_approved_for_assignment(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = p_driver_id
      AND d.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.driver_other_truck_agency_id(
  p_driver_id uuid,
  p_truck_id uuid,
  p_agency_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Agency of "some other truck" holding this driver; foreign agencies are
  -- ordered first so the cross-agency message is deterministic when both a
  -- foreign and a same-agency second truck exist.
  SELECT t.agency_id
  FROM public.agency_trucks t
  WHERE t.driver_id = p_driver_id
    AND t.id <> p_truck_id
  ORDER BY (t.agency_id <> p_agency_id) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.driver_is_assigned_to_agency(p_driver_id uuid, p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_trucks t
    WHERE t.driver_id = p_driver_id
      AND t.agency_id = p_agency_id
  );
$$;

CREATE OR REPLACE FUNCTION public.agency_is_operational(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.transport_agencies ta
    WHERE ta.id = p_agency_id
      AND ta.status = 'approved'
  );
$$;

-- Stakeholder test for a trip-photos object: the shipment customer (any of
-- the three ownership columns), the driver assigned to the offer, or the
-- owning agency user. SECURITY DEFINER so the stakeholder SELECT policy does
-- not recurse through RLS on job_offers/agency_jobs/shipments (a plain policy
-- subquery would be evaluated with the caller's visibility and break for
-- drivers, who cannot read agency_jobs rows).
CREATE OR REPLACE FUNCTION public.is_trip_photo_stakeholder(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_offers jo
    JOIN public.shipments s ON s.id = jo.shipment_id
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE jo.id::text = (string_to_array(p_object_name, '/'))[2]
      AND (
        s.customer_id = auth.uid()
        OR s.created_by = auth.uid()
        OR c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = jo.driver_id
            AND d.user_id = auth.uid()
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.job_offers jo
    JOIN public.agency_jobs aj ON aj.shipment_id = jo.shipment_id
    JOIN public.transport_agencies ta ON ta.id = aj.agency_id
    WHERE jo.id::text = (string_to_array(p_object_name, '/'))[2]
      AND ta.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.driver_is_approved_for_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_other_truck_agency_id(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_is_assigned_to_agency(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_is_operational(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_trip_photo_stakeholder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_is_approved_for_assignment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_other_truck_agency_id(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_is_assigned_to_agency(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_is_operational(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trip_photo_stakeholder(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Guard triggers: enforce on BOTH paths (items 1, 3)
--    The auth.uid() IS NULL early-returns are removed — service-role writes
--    are guarded too. public.is_admin_user() keeps bypassing for genuine
--    DB-admin paths (service_role has no JWT claims, so it does NOT bypass).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_agency_truck_driver_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_other_agency uuid;
BEGIN
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.driver_is_approved_for_assignment(NEW.driver_id) THEN
    RAISE EXCEPTION 'Driver is not approved for assignment.';
  END IF;

  -- Pinned duplicate rule: a driver holds at most one truck row globally.
  v_other_agency := public.driver_other_truck_agency_id(NEW.driver_id, NEW.id, NEW.agency_id);
  IF v_other_agency IS NOT NULL THEN
    IF v_other_agency <> NEW.agency_id THEN
      RAISE EXCEPTION 'Driver is already assigned to another agency.';
    END IF;
    RAISE EXCEPTION 'Driver is already assigned to another truck.';
  END IF;

  IF NOT public.agency_is_operational(NEW.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agency_trucks_driver_assignment ON public.agency_trucks;
CREATE TRIGGER trg_agency_trucks_driver_assignment
  BEFORE INSERT OR UPDATE OF driver_id ON public.agency_trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_truck_driver_assignment();

CREATE OR REPLACE FUNCTION public.enforce_agency_job_driver_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.driver_is_approved_for_assignment(NEW.driver_id) THEN
    RAISE EXCEPTION 'Only approved drivers can be assigned or paid.';
  END IF;

  IF NOT public.driver_is_assigned_to_agency(NEW.driver_id, NEW.agency_id) THEN
    RAISE EXCEPTION 'Driver is not assigned to this agency fleet.';
  END IF;

  IF NOT public.agency_is_operational(NEW.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agency_jobs_driver_assignment ON public.agency_jobs;
CREATE TRIGGER trg_agency_jobs_driver_assignment
  BEFORE INSERT OR UPDATE OF driver_id ON public.agency_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_job_driver_assignment();

CREATE OR REPLACE FUNCTION public.enforce_agency_driver_payout_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  -- Driver-requested withdrawals (the default type) stay outside this gate.
  IF NEW.type IS DISTINCT FROM 'agency_pay' THEN
    RETURN NEW;
  END IF;

  IF NEW.agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required for agency payouts.';
  END IF;

  IF NOT public.driver_is_approved_for_assignment(NEW.driver_id) THEN
    RAISE EXCEPTION 'Only approved drivers can be assigned or paid.';
  END IF;

  IF NOT public.driver_is_assigned_to_agency(NEW.driver_id, NEW.agency_id) THEN
    RAISE EXCEPTION 'Driver is not assigned to this agency fleet.';
  END IF;

  IF NOT public.agency_is_operational(NEW.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_driver_payouts_agency_insert ON public.driver_payouts;
CREATE TRIGGER trg_driver_payouts_agency_insert
  BEFORE INSERT ON public.driver_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_driver_payout_insert();

-- ---------------------------------------------------------------------------
-- 3. Explicit shipment authorization for agency dispatch (item 2)
--    Scoped permission per (shipment, agency) — roadmap §6 authorizeAgency.
--    The producer is the platform dispatch pipeline (TO-143) acting with the
--    customer's consent or the platform dispatch decision; interactive
--    clients get no write path.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipment_agency_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.transport_agencies(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_via text NOT NULL DEFAULT 'platform_dispatch'
    CHECK (granted_via IN ('customer_consent', 'platform_dispatch', 'admin_grant')),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, agency_id)
);

ALTER TABLE public.shipment_agency_consents ENABLE ROW LEVEL SECURITY;

-- Interactive clients may read the authorizations that concern them (the
-- agency INSERT/UPDATE policy predicates evaluate with the caller's
-- visibility, so the caller needs SELECT) and have NO write path: grants are
-- platform/admin actions through the service role.
REVOKE INSERT, UPDATE, DELETE ON public.shipment_agency_consents FROM anon, authenticated;
GRANT SELECT ON public.shipment_agency_consents TO authenticated;

DROP POLICY IF EXISTS "Parties read shipment agency consents" ON public.shipment_agency_consents;
CREATE POLICY "Parties read shipment agency consents" ON public.shipment_agency_consents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transport_agencies ta
      WHERE ta.id = shipment_agency_consents.agency_id
        AND ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

-- ---------------------------------------------------------------------------
-- 4. agency_jobs policies: consent + agency-status predicates, scoped to
--    INSERT/UPDATE only (item 2 + item 3). SELECT/DELETE stay ownership-only
--    so a suspended agency's portal keeps reading its own rows.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS agency_job_owner_all ON public.agency_jobs;

CREATE POLICY agency_job_owner_read ON public.agency_jobs
  FOR SELECT USING (
    agency_id IN (
      SELECT transport_agencies.id
      FROM public.transport_agencies
      WHERE transport_agencies.user_id = auth.uid()
    )
  );

CREATE POLICY agency_job_owner_delete ON public.agency_jobs
  FOR DELETE USING (
    agency_id IN (
      SELECT transport_agencies.id
      FROM public.transport_agencies
      WHERE transport_agencies.user_id = auth.uid()
    )
  );

CREATE POLICY agency_job_owner_insert ON public.agency_jobs
  FOR INSERT WITH CHECK (
    agency_id IN (
      SELECT transport_agencies.id
      FROM public.transport_agencies
      WHERE transport_agencies.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.shipment_agency_consents sac
      WHERE sac.shipment_id = agency_jobs.shipment_id
        AND sac.agency_id = agency_jobs.agency_id
        AND sac.revoked_at IS NULL
    )
    AND public.agency_is_operational(agency_jobs.agency_id)
  );

CREATE POLICY agency_job_owner_update ON public.agency_jobs
  FOR UPDATE USING (
    agency_id IN (
      SELECT transport_agencies.id
      FROM public.transport_agencies
      WHERE transport_agencies.user_id = auth.uid()
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT transport_agencies.id
      FROM public.transport_agencies
      WHERE transport_agencies.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.shipment_agency_consents sac
      WHERE sac.shipment_id = agency_jobs.shipment_id
        AND sac.agency_id = agency_jobs.agency_id
        AND sac.revoked_at IS NULL
    )
    AND public.agency_is_operational(agency_jobs.agency_id)
  );

-- (admin_see_all_agency_jobs SELECT policy from 20260305011000 remains.)

-- ---------------------------------------------------------------------------
-- 5. Caller-bound, pinned usage/plan RPCs (items 4 + 5 hygiene)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = p_user_id
      AND status IN ('active', 'trial')
      AND current_period_end > NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_plan(p_user_id uuid)
RETURNS TABLE (
  plan_name text,
  tier text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sp.name,
    sp.tier,
    s.status,
    s.current_period_end
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trial')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_usage_limit(p_user_id uuid, p_resource text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    CASE p_resource
      WHEN 'shipments' THEN sp.shipments_monthly
      WHEN 'api_calls' THEN sp.api_calls_monthly
      WHEN 'sms' THEN sp.sms_included
      WHEN 'maps' THEN sp.maps_requests_monthly
    END INTO v_limit
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = p_user_id AND s.status = 'active';

  IF v_limit = -1 THEN RETURN TRUE; END IF;

  SELECT
    CASE p_resource
      WHEN 'shipments' THEN ut.shipments_used
      WHEN 'api_calls' THEN ut.api_calls_used
      WHEN 'sms' THEN ut.sms_sent
      WHEN 'maps' THEN ut.maps_requests
    END INTO v_used
  FROM public.usage_tracking ut
  JOIN public.subscriptions s ON ut.subscription_id = s.id
  WHERE s.user_id = p_user_id
    AND ut.period_start <= NOW()
    AND ut.period_end > NOW();

  RETURN COALESCE(v_used, 0) < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id uuid, p_resource text, p_amount integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.usage_tracking ut
  SET
    shipments_used = CASE WHEN p_resource = 'shipments' THEN shipments_used + p_amount ELSE shipments_used END,
    api_calls_used = CASE WHEN p_resource = 'api_calls' THEN api_calls_used + p_amount ELSE api_calls_used END,
    sms_sent = CASE WHEN p_resource = 'sms' THEN sms_sent + p_amount ELSE sms_sent END,
    maps_requests = CASE WHEN p_resource = 'maps' THEN maps_requests + p_amount ELSE maps_requests END,
    updated_at = NOW()
  FROM public.subscriptions s
  WHERE ut.subscription_id = s.id
    AND s.user_id = p_user_id
    AND ut.period_start <= NOW()
    AND ut.period_end > NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_usage_limit(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_usage_limit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO authenticated;

-- Item 5: anon is denied by privilege, not only by the internal guard. The
-- authenticated grant from 20260416010000 persists (CREATE OR REPLACE never
-- replaced it since). The anon revoke covers BOTH the PUBLIC grant and the
-- direct grant the platform default privileges place on new functions.
REVOKE EXECUTE ON FUNCTION public.ensure_shipment_document_numbers(uuid) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 6. Private document buckets with narrowly authorized reads (item 6)
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
SET public = false
WHERE id IN ('billing-documents', 'trip-photos');

-- Billing documents: the service writer (finalizePaidInvoiceDelivery) uploads
-- every PDF under <owning user id>/<invoice id>/<invoice number>.pdf, so the
-- first path segment IS the invoice owner. Admins read all. No INSERT policy
-- for interactive clients: invoice PDFs are written by the service role only,
-- and the existing is_admin_user FOR ALL policy (20261005010000) keeps admin
-- management.
DROP POLICY IF EXISTS "Public can view billing documents" ON storage.objects;
CREATE POLICY "Invoice owner and admins read billing documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'billing-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_admin_user()
  )
);

-- Trip photos: the uploading driver keeps folder ownership; the offer's
-- stakeholder set (shipment customer, owning agency user, assigned driver)
-- resolves through the definer helper to avoid RLS recursion.
DROP POLICY IF EXISTS "Anyone can view trip photos" ON storage.objects;
CREATE POLICY "Trip photo stakeholders can view"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_trip_photo_stakeholder(name)
    OR public.is_admin_user()
  )
);

-- (Owner-folder INSERT/UPDATE/DELETE policies from 20260418002000 and the
-- is_admin_user FOR ALL policies from 20260418003000/20261005010000 remain
-- unchanged.)
