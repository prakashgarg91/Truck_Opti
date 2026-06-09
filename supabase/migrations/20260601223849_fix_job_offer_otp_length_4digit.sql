-- Fix OTP digit length mismatch on job_offers.
--
-- Background:
--   The DriverTripPage UI (DriverTripPage.tsx) expects a 4-digit pickup/delivery
--   OTP (maxLength=4, placeholder="0000", copy "4-Digit OTP from Sender/Recipient").
--   The customer-side TrackingPage.tsx renders the same 4-digit code in the
--   shipment detail modal. The 0.dev-matrix/STATE.md v39 entry says a DB trigger
--   "auto-generates 4-digit OTPs", but that trigger is not present in any
--   migration file, so it was applied by hand via MCP and may not be reproducible
--   on a fresh database. The only places that currently set pickup_otp /
--   delivery_otp are the test fixture in scripts/live-auth-proof.cjs (4 digits)
--   and the customer-facing TrackingPage display. The Supabase auth OTP
--   (OTPPage.tsx, supabase/config.toml otp_length = 6) is a separate flow.
--
-- This migration:
--   1. Creates a deterministic 4-digit OTP generator (range 0000-9999, zero-padded).
--   2. Adds a BEFORE INSERT/UPDATE trigger that fills pickup_otp and delivery_otp
--      with fresh 4-digit codes when the column is NULL or empty. An explicit
--      client-supplied value that is NOT exactly 4 digits is rejected by the
--      CHECK constraints, which prevents future drift between DB and UI.
--   3. Backfills any existing rows that have NULL, empty, or wrong-length
--      pickup_otp / delivery_otp with a fresh 4-digit code so the constraint
--      can be installed safely on a populated database.
--
-- This keeps the existing Supabase auth login OTP at 6 digits (auth flow is
-- governed by supabase/config.toml otp_length = 6, OTPPage.tsx OTP_LENGTH = 6,
-- and apps/web/otp_service.py otp_length = 6) and only enforces the 4-digit
-- contract on the trip-level pickup_otp / delivery_otp columns.

-- 1. Helper: 4-digit numeric OTP.
CREATE OR REPLACE FUNCTION public.generate_4digit_otp()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    otp INT;
BEGIN
    otp := floor(random() * 10000)::INT;
    RETURN lpad(otp::TEXT, 4, '0');
END;
$$;

-- 2. Trigger function: ensure pickup_otp / delivery_otp are always 4-digit
-- strings on insert and on update (when NULL or empty).
CREATE OR REPLACE FUNCTION public.job_offers_enforce_4digit_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.pickup_otp IS NULL OR NEW.pickup_otp = '' THEN
        NEW.pickup_otp := public.generate_4digit_otp();
    END IF;
    IF NEW.delivery_otp IS NULL OR NEW.delivery_otp = '' THEN
        NEW.delivery_otp := public.generate_4digit_otp();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_offers_4digit_otp_biud ON public.job_offers;

CREATE TRIGGER job_offers_4digit_otp_biud
BEFORE INSERT OR UPDATE OF pickup_otp, delivery_otp ON public.job_offers
FOR EACH ROW
EXECUTE FUNCTION public.job_offers_enforce_4digit_otp();

-- 3. Backfill existing rows that violate the 4-digit contract so the
-- CHECK constraint can be installed on a populated table.
UPDATE public.job_offers
SET pickup_otp = public.generate_4digit_otp()
WHERE pickup_otp IS NULL
   OR pickup_otp = ''
   OR pickup_otp !~ '^[0-9]{4}$';

UPDATE public.job_offers
SET delivery_otp = public.generate_4digit_otp()
WHERE delivery_otp IS NULL
   OR delivery_otp = ''
   OR delivery_otp !~ '^[0-9]{4}$';

-- 4. CHECK constraints to lock the 4-digit contract.
ALTER TABLE public.job_offers
  DROP CONSTRAINT IF EXISTS job_offers_pickup_otp_4digit_check;

ALTER TABLE public.job_offers
  ADD CONSTRAINT job_offers_pickup_otp_4digit_check
  CHECK (pickup_otp IS NULL OR pickup_otp ~ '^[0-9]{4}$');

ALTER TABLE public.job_offers
  DROP CONSTRAINT IF EXISTS job_offers_delivery_otp_4digit_check;

ALTER TABLE public.job_offers
  ADD CONSTRAINT job_offers_delivery_otp_4digit_check
  CHECK (delivery_otp IS NULL OR delivery_otp ~ '^[0-9]{4}$');
