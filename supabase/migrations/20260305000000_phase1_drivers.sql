-- =========================================================
-- Phase 1 Migration: Driver & Agency Portal Foundation
-- Date: 2026-03-05
-- =========================================================

-- -------------------------------------------------------
-- 1. drivers — registered driver profiles
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drivers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Personal
  full_name         TEXT NOT NULL,
  phone             TEXT NOT NULL,
  aadhaar_last4     TEXT,
  date_of_birth     DATE,
  -- Vehicle
  vehicle_type      TEXT NOT NULL,          -- eicher_14ft, tata_407, etc.
  rc_number         TEXT,
  license_number    TEXT,
  vehicle_capacity  NUMERIC(10,2),          -- tonnes
  -- Documents (Supabase Storage URLs)
  dl_url            TEXT,
  rc_url            TEXT,
  insurance_url     TEXT,
  selfie_url        TEXT,
  -- Bank
  bank_account      TEXT,
  ifsc_code         TEXT,
  upi_id            TEXT,
  -- Status
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason  TEXT,
  approved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  -- Meta
  home_city         TEXT,
  rating            NUMERIC(3,2) DEFAULT 0.0,
  total_trips       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by phone and status
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON public.drivers(phone);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);

-- -------------------------------------------------------
-- 2. transport_agencies — registered transport companies
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_agencies (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_name        TEXT NOT NULL,
  gstin               TEXT,
  transport_license   TEXT,
  pan_number          TEXT,
  contact_name        TEXT,
  contact_phone       TEXT,
  contact_email       TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  pincode             TEXT,
  -- Bank
  bank_account        TEXT,
  ifsc_code           TEXT,
  -- Status
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason    TEXT,
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  -- Meta
  rating              NUMERIC(3,2) DEFAULT 0.0,
  total_jobs          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agencies_status ON public.transport_agencies(status);
CREATE INDEX IF NOT EXISTS idx_agencies_user_id ON public.transport_agencies(user_id);

-- -------------------------------------------------------
-- 3. driver_locations — real-time GPS updates
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_locations (
  driver_id   UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat         NUMERIC(10,7) NOT NULL,
  lng         NUMERIC(10,7) NOT NULL,
  heading     NUMERIC(5,2),               -- degrees 0-360
  speed_kmh   NUMERIC(6,2),
  accuracy_m  NUMERIC(8,2),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- 4. job_offers — Uber-style driver job offers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_offers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id   UUID REFERENCES public.shipments(id) ON DELETE CASCADE,
  driver_id     UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  offered_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,     -- offered_at + 30 seconds
  responded_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
  decline_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_offers_shipment ON public.job_offers(shipment_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_driver ON public.job_offers(driver_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_status ON public.job_offers(status);

-- -------------------------------------------------------
-- 5. RLS Policies
-- -------------------------------------------------------

-- drivers: drivers can see/edit their own record; admins see all
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers: own record" ON public.drivers
  FOR ALL USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

-- transport_agencies: agency owner or admin
ALTER TABLE public.transport_agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agencies: own record" ON public.transport_agencies
  FOR ALL USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

-- driver_locations: driver updates own location; admins + customers with active shipments read
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver locations: driver updates own" ON public.driver_locations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

-- job_offers: driver sees their offers; admins see all
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job offers: driver sees own" ON public.job_offers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR (auth.jwt() ->> 'role' = 'admin')
    OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  );

-- -------------------------------------------------------
-- 6. Realtime: enable for driver_locations (live tracking)
-- -------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_offers;

-- -------------------------------------------------------
-- 7. Updated_at triggers
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'drivers_updated_at'
  ) THEN
    CREATE TRIGGER drivers_updated_at
      BEFORE UPDATE ON public.drivers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'agencies_updated_at'
  ) THEN
    CREATE TRIGGER agencies_updated_at
      BEFORE UPDATE ON public.transport_agencies
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
