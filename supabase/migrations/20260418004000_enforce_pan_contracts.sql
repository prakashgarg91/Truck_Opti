-- Normalize and enforce PAN across customer, driver, and agency onboarding flows.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pan_number TEXT;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS pan_number TEXT;

ALTER TABLE public.transport_agencies
  ADD COLUMN IF NOT EXISTS pan_number TEXT;

UPDATE public.customers
SET pan_number = NULLIF(upper(trim(pan_number)), '')
WHERE pan_number IS NOT NULL;

UPDATE public.drivers
SET pan_number = NULLIF(upper(trim(pan_number)), '')
WHERE pan_number IS NOT NULL;

UPDATE public.transport_agencies
SET pan_number = NULLIF(upper(trim(pan_number)), '')
WHERE pan_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_and_validate_pan_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL THEN
    NEW.pan_number := NULLIF(upper(trim(NEW.pan_number)), '');
  END IF;

  IF NEW.pan_number IS NOT NULL AND NEW.pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    RAISE EXCEPTION 'Invalid PAN format. Expected AAAAA1234A';
  END IF;

  IF TG_TABLE_NAME = 'customers' THEN
    IF NEW.pan_number IS NULL THEN
      RAISE EXCEPTION 'PAN number is required for customers';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.pan_number IS NULL THEN
      RAISE EXCEPTION 'PAN number is required for %', TG_TABLE_NAME;
    END IF;
  ELSIF NEW.status = 'approved' AND NEW.pan_number IS NULL THEN
    RAISE EXCEPTION 'PAN number is required before approval';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_pan_number ON public.customers;
CREATE TRIGGER trg_customers_pan_number
BEFORE INSERT OR UPDATE OF pan_number ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.normalize_and_validate_pan_number();

DROP TRIGGER IF EXISTS trg_drivers_pan_number ON public.drivers;
CREATE TRIGGER trg_drivers_pan_number
BEFORE INSERT OR UPDATE OF pan_number, status ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.normalize_and_validate_pan_number();

DROP TRIGGER IF EXISTS trg_transport_agencies_pan_number ON public.transport_agencies;
CREATE TRIGGER trg_transport_agencies_pan_number
BEFORE INSERT OR UPDATE OF pan_number, status ON public.transport_agencies
FOR EACH ROW EXECUTE FUNCTION public.normalize_and_validate_pan_number();