-- Restore the missing checked-in contract for agency dispatch jobs.

CREATE TABLE IF NOT EXISTS public.agency_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL,
  shipment_id UUID NOT NULL,
  driver_id UUID,
  truck_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_at TIMESTAMPTZ,
  fare NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT agency_jobs_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.transport_agencies(id) ON DELETE CASCADE,
  CONSTRAINT agency_jobs_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE CASCADE,
  CONSTRAINT agency_jobs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL,
  CONSTRAINT agency_jobs_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.agency_trucks(id) ON DELETE SET NULL,
  CONSTRAINT agency_jobs_status_check CHECK (status IN ('pending', 'accepted', 'in_transit', 'delivered', 'cancelled')),
  CONSTRAINT agency_jobs_agency_id_shipment_id_key UNIQUE (agency_id, shipment_id)
);

ALTER TABLE public.agency_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_see_all_agency_jobs ON public.agency_jobs;
DROP POLICY IF EXISTS agency_job_owner_all ON public.agency_jobs;

CREATE POLICY admin_see_all_agency_jobs ON public.agency_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

CREATE POLICY agency_job_owner_all ON public.agency_jobs
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
      AND event_object_table = 'agency_jobs'
      AND trigger_name = 'agency_jobs_updated_at'
  ) THEN
    CREATE TRIGGER agency_jobs_updated_at
      BEFORE UPDATE ON public.agency_jobs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agency_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_jobs;
  END IF;
END $$;