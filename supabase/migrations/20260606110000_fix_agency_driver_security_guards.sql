-- Repair agency status trigger blocking service-role admin writes, and enforce
-- driver assignment / payout guards at the database layer (not only edge functions).

CREATE OR REPLACE FUNCTION public.enforce_transport_agency_status_writes()
RETURNS TRIGGER AS $$
BEGIN
  -- Service-role edge functions (admin approvals, onboarding) run without auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_agency_truck_driver_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = NEW.driver_id
      AND d.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Driver is not approved for assignment.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_trucks at
    WHERE at.driver_id = NEW.driver_id
      AND at.agency_id <> NEW.agency_id
  ) THEN
    RAISE EXCEPTION 'Driver is already assigned to another agency.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agency_trucks_driver_assignment ON public.agency_trucks;
CREATE TRIGGER trg_agency_trucks_driver_assignment
  BEFORE INSERT OR UPDATE OF driver_id ON public.agency_trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_truck_driver_assignment();

CREATE OR REPLACE FUNCTION public.enforce_agency_job_driver_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = NEW.driver_id
      AND d.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved drivers can be assigned or paid.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_trucks at
    WHERE at.agency_id = NEW.agency_id
      AND at.driver_id = NEW.driver_id
  ) THEN
    RAISE EXCEPTION 'Driver is not assigned to this agency fleet.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agency_jobs_driver_assignment ON public.agency_jobs;
CREATE TRIGGER trg_agency_jobs_driver_assignment
  BEFORE INSERT OR UPDATE OF driver_id ON public.agency_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_job_driver_assignment();

CREATE OR REPLACE FUNCTION public.enforce_agency_driver_payout_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'agency_pay' THEN
    RETURN NEW;
  END IF;

  IF NEW.agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required for agency payouts.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = NEW.driver_id
      AND d.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved drivers can be assigned or paid.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_trucks at
    WHERE at.agency_id = NEW.agency_id
      AND at.driver_id = NEW.driver_id
  ) THEN
    RAISE EXCEPTION 'Driver is not assigned to this agency fleet.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_driver_payouts_agency_insert ON public.driver_payouts;
CREATE TRIGGER trg_driver_payouts_agency_insert
  BEFORE INSERT ON public.driver_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_driver_payout_insert();
