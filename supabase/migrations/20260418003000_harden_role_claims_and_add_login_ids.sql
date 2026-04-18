-- Harden admin authorization to database-backed roles and add login IDs for password flows.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS login_id TEXT;

UPDATE public.users u
SET role = 'admin'
FROM auth.users au
WHERE u.id = au.id
  AND u.role <> 'admin'
  AND lower(COALESCE(au.raw_user_meta_data ->> 'role', '')) = 'admin';

WITH prepared AS (
  SELECT
    u.id,
    COALESCE(
      NULLIF(regexp_replace(split_part(lower(trim(u.email)), '@', 1), '[^a-z0-9._-]+', '', 'g'), ''),
      'user'
    ) AS base_login_id
  FROM public.users u
),
ranked AS (
  SELECT
    p.id,
    p.base_login_id,
    ROW_NUMBER() OVER (PARTITION BY p.base_login_id ORDER BY p.id) AS duplicate_rank
  FROM prepared p
)
UPDATE public.users u
SET login_id = CASE
  WHEN r.duplicate_rank = 1 THEN r.base_login_id
  ELSE r.base_login_id || '-' || left(replace(u.id::text, '-', ''), 6)
END
FROM ranked r
WHERE u.id = r.id
  AND (u.login_id IS NULL OR btrim(u.login_id) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_id_unique
  ON public.users (lower(login_id));

CREATE OR REPLACE FUNCTION public.normalize_user_login_id()
RETURNS TRIGGER AS $$
DECLARE
  v_base_login_id TEXT;
BEGIN
  NEW.email := lower(trim(NEW.email));

  v_base_login_id := COALESCE(
    NULLIF(regexp_replace(lower(trim(COALESCE(NEW.login_id, split_part(NEW.email, '@', 1)))), '[^a-z0-9._-]+', '', 'g'), ''),
    'user'
  );

  NEW.login_id := v_base_login_id;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.login_id) = lower(NEW.login_id)
      AND u.id <> NEW.id
  ) THEN
    NEW.login_id := v_base_login_id || '-' || left(replace(NEW.id::text, '-', ''), 6);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_user_login_id ON public.users;

CREATE TRIGGER trg_normalize_user_login_id
BEFORE INSERT OR UPDATE OF email, login_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.normalize_user_login_id();

CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = COALESCE(p_user_id, auth.uid())
      AND u.role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_admin_user(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT)
RETURNS TEXT AS $$
  SELECT u.email
  FROM public.users u
  WHERE lower(u.login_id) = lower(trim(p_identifier))
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_user_role_mutations()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN := public.is_admin_user(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN
    IF NEW.role IS NULL THEN
      NEW.role := COALESCE(OLD.role, 'user');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL THEN
      NEW.role := 'user';
    END IF;

    IF NEW.role <> 'user' AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Only admins can assign elevated roles';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP POLICY IF EXISTS "Drivers: own record" ON public.drivers;
CREATE POLICY "Drivers: own record" ON public.drivers
  FOR ALL USING (
    auth.uid() = user_id
    OR public.is_admin_user()
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Agencies: own record" ON public.transport_agencies;
CREATE POLICY "Agencies: own record" ON public.transport_agencies
  FOR ALL USING (
    auth.uid() = user_id
    OR public.is_admin_user()
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Job offers: shipment stakeholders read" ON public.job_offers;
CREATE POLICY "Job offers: shipment stakeholders read" ON public.job_offers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.shipments s
      LEFT JOIN public.customers c ON c.id = s.customer_id
      LEFT JOIN public.agency_jobs aj ON aj.shipment_id = s.id
      LEFT JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE s.id = public.job_offers.shipment_id
        AND (
          s.created_by = auth.uid()
          OR c.created_by = auth.uid()
          OR s.customer_id = auth.uid()
          OR ta.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = public.job_offers.driver_id AND d.user_id = auth.uid())
          OR public.is_admin_user()
        )
    )
  );

DROP POLICY IF EXISTS "Job offers: agency manages own" ON public.job_offers;
CREATE POLICY "Job offers: agency manages own" ON public.job_offers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agency_jobs aj
      JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE aj.shipment_id = public.job_offers.shipment_id
        AND ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Job offers: agency updates own" ON public.job_offers;
CREATE POLICY "Job offers: agency updates own" ON public.job_offers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.agency_jobs aj
      JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE aj.shipment_id = public.job_offers.shipment_id
        AND ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agency_jobs aj
      JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE aj.shipment_id = public.job_offers.shipment_id
        AND ta.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Job offers: driver updates own" ON public.job_offers;
CREATE POLICY "Job offers: driver updates own" ON public.job_offers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = public.job_offers.driver_id AND d.user_id = auth.uid())
    OR public.is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = public.job_offers.driver_id AND d.user_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Driver locations: driver updates own" ON public.driver_locations;
DROP POLICY IF EXISTS "Driver locations: driver manages own" ON public.driver_locations;
CREATE POLICY "Driver locations: driver manages own" ON public.driver_locations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR public.is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Driver locations: shipment stakeholders read" ON public.driver_locations;
CREATE POLICY "Driver locations: shipment stakeholders read" ON public.driver_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.job_offers jo
      JOIN public.shipments s ON s.id = jo.shipment_id
      LEFT JOIN public.customers c ON c.id = s.customer_id
      LEFT JOIN public.agency_jobs aj ON aj.shipment_id = jo.shipment_id
      LEFT JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE jo.driver_id = public.driver_locations.driver_id
        AND (
          s.created_by = auth.uid()
          OR c.created_by = auth.uid()
          OR s.customer_id = auth.uid()
          OR ta.user_id = auth.uid()
          OR public.is_admin_user()
        )
    )
  );

DROP POLICY IF EXISTS "admin_manages_payouts" ON public.driver_payouts;
CREATE POLICY "admin_manages_payouts" ON public.driver_payouts
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "admin reads inquiries" ON public.contact_inquiries;
CREATE POLICY "admin reads inquiries"
  ON public.contact_inquiries
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "admin updates inquiries" ON public.contact_inquiries;
CREATE POLICY "admin updates inquiries"
  ON public.contact_inquiries
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

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
        OR public.is_admin_user()
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
  v_is_admin BOOLEAN := public.is_admin_user(auth.uid());
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

DROP POLICY IF EXISTS "Admins can manage all driver documents" ON storage.objects;
CREATE POLICY "Admins can manage all driver documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'driver-docs'
  AND public.is_admin_user()
);

DROP POLICY IF EXISTS "Admins can manage all trip photos" ON storage.objects;
CREATE POLICY "Admins can manage all trip photos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'trip-photos'
  AND public.is_admin_user()
);