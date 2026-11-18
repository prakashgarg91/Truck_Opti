-- transport_agencies row guard.
--
-- The owner policy "Agencies: own record" is FOR ALL (USING/WITH CHECK auth.uid() = user_id OR admin), and
-- the only existing trigger (enforce_transport_agency_status_writes) neutralises status alone. A signed-in
-- owner could therefore, with a plain PostgREST write, set rating, total_jobs, approved_by / approved_at,
-- rejection_reason and created_at on their own row, register an agency pre-filled with those values, or
-- DELETE the row (which cascades to jobs, invoices and payroll).
--
-- Narrowest fix, policy untouched: one BEFORE INSERT OR UPDATE OR DELETE trigger that restricts only direct
-- client roles (current_user = authenticated / anon). Admins (is_admin_user), service_role (edge functions)
-- and SECURITY DEFINER code (current_user = the function owner) are not affected. Legitimate owner writes
-- (registration with a pending status, profile fields) keep working; a write that leaves a protected column
-- at its current value is accepted.
--   INSERT : forced neutral: status pending, approved_by/approved_at/rejection_reason NULL, rating 0, total_jobs 0.
--   UPDATE : id, user_id, rejection_reason, approved_by, approved_at, rating, total_jobs, created_at may not
--            change (42501). status stays with enforce_transport_agency_status_writes (silent revert).
--   DELETE : refused (42501).

CREATE OR REPLACE FUNCTION public.guard_transport_agency_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_user() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.rating := 0;
    NEW.total_jobs := 0;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An agency cannot be deleted directly' USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.total_jobs IS DISTINCT FROM OLD.total_jobs
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Agency approval and statistics fields are managed by the platform' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_transport_agency_rows() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transport_agencies_row_guard ON public.transport_agencies;
CREATE TRIGGER trg_transport_agencies_row_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.transport_agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_transport_agency_rows();
