-- =========================================================
-- TO-142 round 2: booking dispatch producer + server-side
-- delivery status propagation (the two journey defects the
-- TO-142 batteries reproduced; TASKS.md TO-143 minimum set).
--
-- 1. public.dispatch_job_to_drivers(p_shipment_id uuid, p_vehicle_type text)
--    RETURNS integer — the producer NewShipmentPage.tsx:81 already calls
--    right after booking (`supabase.rpc('dispatch_job_to_drivers', {
--    p_shipment_id, p_vehicle_type })`; the returned count is rendered as
--    "Notified N drivers"). Contract:
--      * caller-bound ownership guard mirroring the tracking RPC
--        (20260730110000:26-31): shipment customer_id / created_by /
--        customers.created_by must be auth.uid(), else
--        'Shipment not found or access denied';
--      * lifecycle guard: only status='pending' shipments dispatch,
--        else 'Shipment is not open for dispatch.';
--      * one pending, 1-hour job offer per eligible driver:
--        status='approved' AND vehicle_type = p_vehicle_type AND no
--        non-terminal offer already on this shipment for that driver
--        (declined/expired/cancelled drivers are re-offerable on
--        re-dispatch; offline drivers are included because offers persist
--        in their offers list — notification robustness over online-only);
--      * OTP columns are inserted NULL: the 4-digit trigger
--        (20260601223849) fills fresh pickup/delivery codes, so the
--        producer cannot drift from the OTP contract.
--    SECURITY DEFINER with pinned search_path (the caller owns the
--    shipment but job_offers INSERT policy is agency-shaped, and offers
--    must exist for drivers who cannot yet see the shipment row);
--    EXECUTE granted to authenticated only.
--
-- 2. Server-side delivery propagation: AFTER UPDATE OF status trigger on
--    job_offers moves shipments.status and agency_jobs.status to
--    'delivered' exactly once when an offer reaches 'delivered'
--    (persist_driver_job_offer_progress is the only writer that can get
--    there — authenticated table UPDATE is revoked, 20261004000000).
--    A replay (OLD.status already 'delivered') no-ops, preserving the
--    exactly-once counters contract. SECURITY DEFINER + pinned
--    search_path so the propagation works from the definer RPC context
--    regardless of caller grants. Manual surfaces keep their own status
--    paths; the trigger never downgrades or rewrites a different status.
-- =========================================================

-- ---------------------------------------------------------------------------
-- 1. Booking dispatch producer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_job_to_drivers(
  p_shipment_id uuid,
  p_vehicle_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notified integer := 0;
  v_is_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.shipments s
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE s.id = p_shipment_id
      AND (
        s.customer_id = auth.uid()
        OR s.created_by = auth.uid()
        OR c.created_by = auth.uid()
      )
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Shipment not found or access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shipments s
    WHERE s.id = p_shipment_id
      AND s.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Shipment is not open for dispatch.';
  END IF;

  WITH eligible AS (
    SELECT d.id
    FROM public.drivers d
    WHERE d.status = 'approved'
      AND d.vehicle_type = p_vehicle_type
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_offers jo
        WHERE jo.shipment_id = p_shipment_id
          AND jo.driver_id = d.id
          AND jo.status IN ('pending', 'accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived')
      )
  ),
  inserted AS (
    INSERT INTO public.job_offers (shipment_id, driver_id, offered_at, expires_at, status)
    SELECT p_shipment_id, e.id, NOW(), NOW() + INTERVAL '1 hour', 'pending'
    FROM eligible e
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_notified FROM inserted;

  RETURN v_notified;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_job_to_drivers(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_job_to_drivers(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Server-side delivery propagation (exactly-once)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.propagate_trip_delivery_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.shipments
    SET status = 'delivered',
        updated_at = NOW()
    WHERE id = NEW.shipment_id
      AND status IS DISTINCT FROM 'delivered';

    UPDATE public.agency_jobs
    SET status = 'delivered',
        updated_at = NOW()
    WHERE shipment_id = NEW.shipment_id
      AND status IS DISTINCT FROM 'delivered';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_offers_delivery_propagation ON public.job_offers;
CREATE TRIGGER trg_job_offers_delivery_propagation
AFTER UPDATE OF status ON public.job_offers
FOR EACH ROW
EXECUTE FUNCTION public.propagate_trip_delivery_status();
