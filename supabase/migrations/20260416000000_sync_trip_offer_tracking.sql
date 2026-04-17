-- Sync trip/tracking schema and RLS with the current driver + agency UI flows.

ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS pickup_otp TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp TEXT,
  ADD COLUMN IF NOT EXISTS photo_loading_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_delivery_url TEXT,
  ADD COLUMN IF NOT EXISTS pickup_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS journey_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE public.job_offers DROP CONSTRAINT IF EXISTS job_offers_status_check;

ALTER TABLE public.job_offers
  ADD CONSTRAINT job_offers_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'pickup_arrived', 'in_transit', 'delivery_arrived', 'delivered'));

DROP POLICY IF EXISTS "Job offers: driver sees own" ON public.job_offers;
DROP POLICY IF EXISTS "Job offers: shipment stakeholders read" ON public.job_offers;
DROP POLICY IF EXISTS "Job offers: agency manages own" ON public.job_offers;
DROP POLICY IF EXISTS "Job offers: agency updates own" ON public.job_offers;
DROP POLICY IF EXISTS "Job offers: driver updates own" ON public.job_offers;

CREATE POLICY "Job offers: shipment stakeholders read" ON public.job_offers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.shipments s
      LEFT JOIN public.agency_jobs aj ON aj.shipment_id = s.id
      LEFT JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE s.id = public.job_offers.shipment_id
        AND (
          s.customer_id = auth.uid()
          OR ta.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = public.job_offers.driver_id AND d.user_id = auth.uid())
          OR (auth.jwt() ->> 'role' = 'admin')
          OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
        )
    )
  );

CREATE POLICY "Job offers: agency manages own" ON public.job_offers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agency_jobs aj
      JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE aj.shipment_id = public.job_offers.shipment_id
        AND ta.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

CREATE POLICY "Job offers: agency updates own" ON public.job_offers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.agency_jobs aj
      JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE aj.shipment_id = public.job_offers.shipment_id
        AND ta.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agency_jobs aj
      JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE aj.shipment_id = public.job_offers.shipment_id
        AND ta.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

CREATE POLICY "Job offers: driver updates own" ON public.job_offers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = public.job_offers.driver_id AND d.user_id = auth.uid())
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = public.job_offers.driver_id AND d.user_id = auth.uid())
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

DROP POLICY IF EXISTS "Driver locations: driver updates own" ON public.driver_locations;
DROP POLICY IF EXISTS "Driver locations: driver manages own" ON public.driver_locations;
DROP POLICY IF EXISTS "Driver locations: shipment stakeholders read" ON public.driver_locations;

CREATE POLICY "Driver locations: driver manages own" ON public.driver_locations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

CREATE POLICY "Driver locations: shipment stakeholders read" ON public.driver_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.job_offers jo
      JOIN public.shipments s ON s.id = jo.shipment_id
      LEFT JOIN public.agency_jobs aj ON aj.shipment_id = jo.shipment_id
      LEFT JOIN public.transport_agencies ta ON ta.id = aj.agency_id
      WHERE jo.driver_id = public.driver_locations.driver_id
        AND (
          s.customer_id = auth.uid()
          OR ta.user_id = auth.uid()
          OR (auth.jwt() ->> 'role' = 'admin')
          OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
        )
    )
  );