-- Restore the missing checked-in contract for agency fleet trucks.

CREATE TABLE IF NOT EXISTS public.agency_trucks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL,
  vehicle_type TEXT NOT NULL,
  rc_number TEXT NOT NULL,
  insurance_expiry DATE,
  fitness_expiry DATE,
  permit_expiry DATE,
  is_available BOOLEAN DEFAULT true,
  driver_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT agency_trucks_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.transport_agencies(id) ON DELETE CASCADE,
  CONSTRAINT agency_trucks_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL
);

ALTER TABLE public.agency_trucks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_see_all_trucks ON public.agency_trucks;
DROP POLICY IF EXISTS agency_truck_owner_all ON public.agency_trucks;

CREATE POLICY admin_see_all_trucks ON public.agency_trucks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

CREATE POLICY agency_truck_owner_all ON public.agency_trucks
  FOR ALL USING (
    agency_id IN (
      SELECT transport_agencies.id
      FROM public.transport_agencies
      WHERE transport_agencies.user_id = auth.uid()
    )
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'agency_trucks'
      AND trigger_name = 'agency_trucks_updated_at'
  ) THEN
    CREATE TRIGGER agency_trucks_updated_at
      BEFORE UPDATE ON public.agency_trucks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agency_trucks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_trucks;
  END IF;
END $$;