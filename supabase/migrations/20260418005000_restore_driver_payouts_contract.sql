-- Repair schema drift where migration history shows driver_payouts as applied
-- but the physical table is missing in the linked project.

CREATE TABLE IF NOT EXISTS public.driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  note TEXT,
  agency_id UUID REFERENCES public.transport_agencies(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'withdrawal'
);

ALTER TABLE public.driver_payouts
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.transport_agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE public.driver_payouts
SET type = 'withdrawal'
WHERE type IS NULL;

UPDATE public.driver_payouts
SET requested_at = NOW()
WHERE requested_at IS NULL;

ALTER TABLE public.driver_payouts
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN requested_at SET DEFAULT NOW(),
  ALTER COLUMN requested_at SET NOT NULL,
  ALTER COLUMN type SET DEFAULT 'withdrawal',
  ALTER COLUMN type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.driver_payouts'::regclass
      AND conname = 'driver_payouts_status_check'
  ) THEN
    ALTER TABLE public.driver_payouts
      ADD CONSTRAINT driver_payouts_status_check
      CHECK (status IN ('pending', 'approved', 'paid', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.driver_payouts'::regclass
      AND conname = 'driver_payouts_type_check'
  ) THEN
    ALTER TABLE public.driver_payouts
      ADD CONSTRAINT driver_payouts_type_check
      CHECK (type IN ('withdrawal', 'agency_pay'));
  END IF;
END;
$$;

ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.driver_payouts TO authenticated;
GRANT ALL ON TABLE public.driver_payouts TO service_role;

CREATE INDEX IF NOT EXISTS driver_payouts_driver_requested_idx
  ON public.driver_payouts (driver_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS driver_payouts_agency_requested_idx
  ON public.driver_payouts (agency_id, requested_at DESC)
  WHERE agency_id IS NOT NULL;

DROP POLICY IF EXISTS "driver_reads_own_payouts" ON public.driver_payouts;
CREATE POLICY "driver_reads_own_payouts" ON public.driver_payouts
  FOR SELECT TO authenticated
  USING (
    driver_id IN (
      SELECT id
      FROM public.drivers
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "driver_inserts_own_payout" ON public.driver_payouts;
CREATE POLICY "driver_inserts_own_payout" ON public.driver_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id IN (
      SELECT id
      FROM public.drivers
      WHERE user_id = auth.uid()
    )
    AND type = 'withdrawal'
  );

DROP POLICY IF EXISTS "agency_reads_driver_payouts" ON public.driver_payouts;
CREATE POLICY "agency_reads_driver_payouts" ON public.driver_payouts
  FOR SELECT TO authenticated
  USING (
    agency_id IN (
      SELECT id
      FROM public.transport_agencies
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agency_inserts_driver_payout" ON public.driver_payouts;
CREATE POLICY "agency_inserts_driver_payout" ON public.driver_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT id
      FROM public.transport_agencies
      WHERE user_id = auth.uid()
    )
    AND type = 'agency_pay'
  );

DROP POLICY IF EXISTS "admin_manages_payouts" ON public.driver_payouts;
CREATE POLICY "admin_manages_payouts" ON public.driver_payouts
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());