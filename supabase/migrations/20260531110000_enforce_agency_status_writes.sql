-- Prevent non-admin agency owners from self-approving during onboarding.

CREATE OR REPLACE FUNCTION public.enforce_transport_agency_status_writes()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_transport_agencies_status_writes ON public.transport_agencies;
CREATE TRIGGER trg_transport_agencies_status_writes
  BEFORE INSERT OR UPDATE OF status ON public.transport_agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_transport_agency_status_writes();
