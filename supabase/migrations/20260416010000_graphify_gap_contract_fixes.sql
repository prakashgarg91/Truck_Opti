-- Graphify gap fixes: stable shipment document identity, transaction-backed trip progress,
-- and deduped contact inquiry submissions.

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS lr_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_invoice_number
  ON public.shipments(invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_lr_number
  ON public.shipments(lr_number)
  WHERE lr_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.shipment_lr_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_lr_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'LR-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('public.shipment_lr_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_shipment_document_numbers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;

  IF NEW.lr_number IS NULL THEN
    NEW.lr_number := public.generate_lr_number();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_shipment_document_numbers ON public.shipments;

CREATE TRIGGER trg_set_shipment_document_numbers
BEFORE INSERT ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.set_shipment_document_numbers();

CREATE OR REPLACE FUNCTION public.ensure_shipment_document_numbers(p_shipment_id UUID)
RETURNS TABLE (invoice_number TEXT, lr_number TEXT) AS $$
DECLARE
  v_invoice_number TEXT;
  v_lr_number TEXT;
  v_can_access BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.shipments s
    WHERE s.id = p_shipment_id
      AND (
        s.created_by = auth.uid()
        OR (auth.jwt() ->> 'role' = 'admin')
        OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
      )
  ) INTO v_can_access;

  IF NOT v_can_access THEN
    RAISE EXCEPTION 'Shipment not found or access denied';
  END IF;

  SELECT s.invoice_number, s.lr_number
  INTO v_invoice_number, v_lr_number
  FROM public.shipments s
  WHERE s.id = p_shipment_id;

  IF v_invoice_number IS NULL THEN
    v_invoice_number := public.generate_invoice_number();
  END IF;

  IF v_lr_number IS NULL THEN
    v_lr_number := public.generate_lr_number();
  END IF;

  UPDATE public.shipments
  SET invoice_number = COALESCE(public.shipments.invoice_number, v_invoice_number),
      lr_number = COALESCE(public.shipments.lr_number, v_lr_number)
  WHERE id = p_shipment_id;

  RETURN QUERY SELECT v_invoice_number, v_lr_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.ensure_shipment_document_numbers(UUID) TO authenticated;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS active_job_id UUID REFERENCES public.job_offers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.persist_driver_job_offer_progress(
  p_job_offer_id UUID,
  p_status TEXT DEFAULT NULL,
  p_extra JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  job_offer_id UUID,
  status TEXT,
  pickup_arrived_at TIMESTAMPTZ,
  journey_started_at TIMESTAMPTZ,
  delivery_arrived_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  photo_loading_url TEXT,
  photo_delivery_url TEXT,
  total_trips INTEGER
) AS $$
DECLARE
  v_driver_id UUID;
  v_is_admin BOOLEAN := (auth.jwt() ->> 'role' = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
  v_job_offer_id UUID;
  v_status TEXT;
  v_pickup_arrived_at TIMESTAMPTZ;
  v_journey_started_at TIMESTAMPTZ;
  v_delivery_arrived_at TIMESTAMPTZ;
  v_delivered_at TIMESTAMPTZ;
  v_photo_loading_url TEXT;
  v_photo_delivery_url TEXT;
  v_total_trips INTEGER;
BEGIN
  SELECT jo.driver_id
  INTO v_driver_id
  FROM public.job_offers jo
  JOIN public.drivers d ON d.id = jo.driver_id
  WHERE jo.id = p_job_offer_id
    AND (d.user_id = auth.uid() OR v_is_admin);

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Job offer not found or access denied';
  END IF;

  UPDATE public.job_offers jo
  SET status = COALESCE(p_status, jo.status),
      pickup_arrived_at = COALESCE((p_extra ->> 'pickup_arrived_at')::TIMESTAMPTZ, jo.pickup_arrived_at),
      journey_started_at = COALESCE((p_extra ->> 'journey_started_at')::TIMESTAMPTZ, jo.journey_started_at),
      delivery_arrived_at = COALESCE((p_extra ->> 'delivery_arrived_at')::TIMESTAMPTZ, jo.delivery_arrived_at),
      delivered_at = COALESCE((p_extra ->> 'delivered_at')::TIMESTAMPTZ, jo.delivered_at),
      photo_loading_url = COALESCE(NULLIF(p_extra ->> 'photo_loading_url', ''), jo.photo_loading_url),
      photo_delivery_url = COALESCE(NULLIF(p_extra ->> 'photo_delivery_url', ''), jo.photo_delivery_url)
  WHERE jo.id = p_job_offer_id
  RETURNING jo.id, jo.status, jo.pickup_arrived_at, jo.journey_started_at, jo.delivery_arrived_at, jo.delivered_at, jo.photo_loading_url, jo.photo_delivery_url
  INTO v_job_offer_id, v_status, v_pickup_arrived_at, v_journey_started_at, v_delivery_arrived_at, v_delivered_at, v_photo_loading_url, v_photo_delivery_url;

  IF p_status = 'delivered' THEN
    UPDATE public.drivers d
    SET active_job_id = NULL,
        total_trips = COALESCE(d.total_trips, 0) + 1
    WHERE d.id = v_driver_id
    RETURNING d.total_trips INTO v_total_trips;
  ELSE
    SELECT d.total_trips
    INTO v_total_trips
    FROM public.drivers d
    WHERE d.id = v_driver_id;
  END IF;

  RETURN QUERY SELECT v_job_offer_id, v_status, v_pickup_arrived_at, v_journey_started_at, v_delivery_arrived_at, v_delivered_at, v_photo_loading_url, v_photo_delivery_url, COALESCE(v_total_trips, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.persist_driver_job_offer_progress(UUID, TEXT, JSONB) TO authenticated;

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL DEFAULT 'General',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_submission_id TEXT
);

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can submit inquiry" ON public.contact_inquiries;
DROP POLICY IF EXISTS "admin reads inquiries" ON public.contact_inquiries;
DROP POLICY IF EXISTS "admin updates inquiries" ON public.contact_inquiries;

CREATE POLICY "public can submit inquiry"
  ON public.contact_inquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "admin reads inquiries"
  ON public.contact_inquiries
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin updates inquiries"
  ON public.contact_inquiries
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

ALTER TABLE public.contact_inquiries
  ADD COLUMN IF NOT EXISTS client_submission_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_inquiries_client_submission_id
  ON public.contact_inquiries(client_submission_id)
  WHERE client_submission_id IS NOT NULL;