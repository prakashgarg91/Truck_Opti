-- 20261048000000_document_number_generators.sql
-- Closes the direct-call path to the document-number generators (recorded in 20261047's header).
--
-- Problem: public.generate_lr_number() and public.generate_invoice_number() are SECURITY INVOKER and were
-- executable by anon (default privileges), so a signed-out caller could advance shipment_lr_seq /
-- invoice_seq through /rest/v1/rpc/... (gaps in the numbers; no data access).
--
-- Why they could not simply be revoked: the BEFORE INSERT trigger function set_shipment_document_numbers()
-- is SECURITY INVOKER and calls them, and it fires before row security is evaluated. Revoking would have
-- turned a signed-out insert's row-security refusal into "permission denied for function generate_lr_number"
-- (scripts/admin_rls_proof.db.test.mjs B4 pins the row-security refusal).
--
-- Design (preferred one, no fallback needed):
--   1. set_shipment_document_numbers() becomes SECURITY DEFINER. Its body is unchanged: it only reads and
--      writes NEW.invoice_number / NEW.lr_number and calls the two generators; it uses no auth.uid(),
--      no jwt claim, no current_user and touches no table, so running as the owner gives it no new power.
--      search_path stays fixed to public, extensions, pg_temp (as 20261044 set).
--   2. EXECUTE on the trigger function is closed to every client role (Postgres checks EXECUTE on a trigger
--      function only at CREATE TRIGGER, never when it fires), so it is not an anon-executable SECURITY DEFINER.
--   3. EXECUTE on both generators is revoked from PUBLIC, anon and authenticated and granted to service_role
--      only. The owner still runs them: the trigger function (definer) and
--      ensure_shipment_document_numbers(uuid) (already SECURITY DEFINER, owner-run, guarded by
--      created_by / is_admin_user, EXECUTE for authenticated only) keep working unchanged.
--   4. Sequences: shipment_lr_seq and invoice_seq had the default-privilege grants (ALL to anon, authenticated,
--      service_role). Only the owner-run functions draw from them now, so privileges are cut to service_role.
--
-- Residual (not changed here, recorded): a signed-out INSERT into public.shipments still runs the BEFORE
-- trigger, hence still draws one number from each sequence before row security refuses the row, as it did
-- before. That path needs an INSERT privilege on the table and is a separate decision.

CREATE OR REPLACE FUNCTION public.set_shipment_document_numbers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;

  IF NEW.lr_number IS NULL THEN
    NEW.lr_number := public.generate_lr_number();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.set_shipment_document_numbers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_shipment_document_numbers() TO service_role;

REVOKE ALL ON FUNCTION public.generate_lr_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_lr_number() TO service_role;

REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO service_role;

REVOKE ALL ON SEQUENCE public.shipment_lr_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.shipment_lr_seq TO service_role;

REVOKE ALL ON SEQUENCE public.invoice_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.invoice_seq TO service_role;
