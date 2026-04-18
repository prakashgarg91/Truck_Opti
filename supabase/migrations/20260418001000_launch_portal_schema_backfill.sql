-- Backfill launch-critical columns that exist in the live app contract but are missing from checked-in migrations.

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS goods_description TEXT,
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC,
  ADD COLUMN IF NOT EXISTS driver_phone TEXT;

UPDATE public.shipments
SET estimated_cost = estimated_value
WHERE estimated_value IS NOT NULL
  AND (estimated_cost IS NULL OR estimated_cost = 0);

ALTER TABLE public.transport_agencies
  ADD COLUMN IF NOT EXISTS fleet_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operating_routes TEXT;

ALTER TABLE public.transport_agencies
  ALTER COLUMN fleet_size SET DEFAULT 0;

UPDATE public.transport_agencies
SET fleet_size = 0
WHERE fleet_size IS NULL;

DO $$
BEGIN
  IF to_regclass('public.agency_trucks') IS NOT NULL THEN
    UPDATE public.transport_agencies ta
    SET fleet_size = counts.fleet_size
    FROM (
      SELECT agency_id, COUNT(*)::INTEGER AS fleet_size
      FROM public.agency_trucks
      GROUP BY agency_id
    ) counts
    WHERE ta.id = counts.agency_id
      AND (ta.fleet_size IS NULL OR ta.fleet_size = 0);
  END IF;
END;
$$;