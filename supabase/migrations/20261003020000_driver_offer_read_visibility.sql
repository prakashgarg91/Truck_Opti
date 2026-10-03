-- TO-129: Make a driver's own job offers (and their shipment summary) readable
-- under RLS, so the incoming-offer modal and the trip route are actually
-- reachable in the driver UI.
--
-- Discovery (proven on the disposable local stack, scripts/
-- atomic_job_offer_response.rls.test.mjs): the live "Shipments" read policy was
-- `shipments_select_own (auth.uid() = created_by)` only, and the "Job offers:
-- shipment stakeholders read" policy EXISTS-checks over shipments with RLS
-- applied inside the policy subquery. A driver therefore could never see their
-- own pending offer (offer read returned zero rows), which made the whole
-- accept/decline flow unreachable from the dashboard regardless of the response
-- transaction.
--
-- Fix: a SECURITY DEFINER helper (house pattern, cf. is_admin_user) that asks
-- whether the signed-in user is the assigned driver of a shipment, plus a
-- shipments SELECT policy using it. Because the helper bypasses RLS inside, the
-- shipments <-> job_offers policy pair does not recurse (a naive policy that
-- subqueries job_offers directly fails with SQLSTATE 42P17 "infinite recursion
-- detected in policy" — reproduced and rejected on the local stack).

CREATE OR REPLACE FUNCTION public.is_shipment_driver(p_shipment_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_offers jo
    JOIN public.drivers d ON d.id = jo.driver_id
    WHERE jo.shipment_id = p_shipment_id
      AND d.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_shipment_driver(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "Shipments: assigned driver read" ON public.shipments;
CREATE POLICY "Shipments: assigned driver read" ON public.shipments
  FOR SELECT USING (public.is_shipment_driver(public.shipments.id));
