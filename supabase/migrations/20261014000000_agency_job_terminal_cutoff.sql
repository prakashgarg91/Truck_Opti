-- TO-143-D3: terminal-status consent cutoff (owner-deferred finding, now fixed).
--
-- Consent validity was REVOCATION-ONLY: an active consent still let an agency
-- INSERT a NEW agency_jobs row after the shipment reached a terminal status
-- ('delivered' or 'cancelled') (dispatch_delivery_journey section J). The
-- agency_jobs INSERT policy now also requires a non-terminal shipment.
--
-- Scope: INSERT only. Existing jobs on a delivered shipment stay updatable so
-- completion, fare and history keep working. The status check is a
-- SECURITY DEFINER helper because agencies cannot read shipments through RLS.
-- anon needs EXECUTE only because WITH CHECK is evaluated for any role that
-- attempts the INSERT; the helper exposes nothing but a boolean.

CREATE OR REPLACE FUNCTION public.shipment_accepts_agency_jobs(p_shipment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shipments s
    WHERE s.id = p_shipment_id
      AND s.status NOT IN ('delivered', 'cancelled')
  );
$$;

REVOKE ALL ON FUNCTION public.shipment_accepts_agency_jobs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shipment_accepts_agency_jobs(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "agency_job_owner_insert" ON public.agency_jobs;
CREATE POLICY agency_job_owner_insert ON public.agency_jobs
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[]))
    AND EXISTS (
      SELECT 1
      FROM public.shipment_agency_consents sac
      WHERE sac.shipment_id = agency_jobs.shipment_id
        AND sac.agency_id = agency_jobs.agency_id
        AND sac.revoked_at IS NULL
    )
    AND public.shipment_accepts_agency_jobs(agency_jobs.shipment_id)
    AND public.agency_is_operational(agency_jobs.agency_id)
  );
