-- Harden self-service role writes and align customer shipment access with created_by ownership.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

UPDATE public.customers c
SET created_by = u.id
FROM auth.users u
WHERE c.created_by IS NULL
  AND c.email IS NOT NULL
  AND lower(c.email) = lower(u.email);

UPDATE public.shipments s
SET created_by = c.created_by
FROM public.customers c
WHERE s.created_by IS NULL
  AND s.customer_id = c.id
  AND c.created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_user_role_mutations()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN := (auth.jwt() ->> 'role' = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
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

DROP TRIGGER IF EXISTS trg_guard_user_role_mutations ON public.users;

CREATE TRIGGER trg_guard_user_role_mutations
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_mutations();

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
          OR (auth.jwt() ->> 'role' = 'admin')
          OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
        )
    )
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
          OR (auth.jwt() ->> 'role' = 'admin')
          OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
        )
    )
  );