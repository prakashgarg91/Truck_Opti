-- 20261044000000_hosted_hardening.sql
-- Findings of the first hosted Supabase security report.
--   A. Public functions with no fixed search_path (function_search_path_mutable).
--   B. SECURITY DEFINER functions executable by the signed-out `anon` role.
-- No function body is rewritten. Idempotent.

-- ---------------------------------------------------------------------------
-- A. Pin search_path on the 20 flagged functions.
-- `extensions` is where hosted Supabase keeps pgcrypto / uuid-ossp; pg_temp last so
-- temporary objects can never shadow a real one. Every body was read: they reference
-- only public objects (resolved through `public`), pg_catalog built-ins, and
-- schema-qualified auth.* / storage.* objects, so this path is sufficient for all of them.
-- Every flagged function has a single signature.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.bump_agency_employment_version()        SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.bump_agency_truck_version()             SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.create_usage_tracking()                 SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_agency_driver_payout_insert()   SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_agency_job_driver_assignment()  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_agency_truck_driver_assignment() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_driver_kyc_version_chain()      SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_transport_agency_status_writes() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.generate_4digit_otp()                   SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.generate_invoice_number()               SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.generate_lr_number()                    SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.guard_user_role_mutations()             SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.is_job_trip_photo_url(text, uuid, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.job_offers_enforce_4digit_otp()         SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.normalize_and_validate_pan_number()     SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.normalize_user_login_id()               SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_notification_read_at()              SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_shipment_document_numbers()         SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_updated_at()                        SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at_column()              SET search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- B. SECURITY DEFINER functions executable by anon.
-- Supabase's default privileges grant EXECUTE on new functions to anon explicitly, so
-- REVOKE FROM PUBLIC alone does not remove it: anon is revoked by name.
-- ---------------------------------------------------------------------------

-- propagate_trip_delivery_status: trigger function (AFTER UPDATE on job_offers). Postgres
-- checks EXECUTE on a trigger function only when the trigger is created, never when it
-- fires, so no client role needs it. Nobody calls it through rpc().
REVOKE ALL ON FUNCTION public.propagate_trip_delivery_status() FROM PUBLIC, anon, authenticated;

-- respond_to_job_offer: a driver accepts or declines an offer; it binds to auth.uid() and
-- raises for a signed-out caller. Only the signed-in driver app calls it
-- (customerSupabaseApi.ts). The original migration granted authenticated only, but the
-- default-privilege grant to anon was never revoked. anon is NOT needed.
REVOKE ALL ON FUNCTION public.respond_to_job_offer(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_job_offer(uuid, boolean, text) TO authenticated, service_role;

-- resolve_login_identifier: KEPT for anon. The login screen (supabaseApi.ts
-- resolvePasswordLoginEmail) turns a login ID into an email BEFORE sign-in, so the caller is
-- signed out by definition. Known trade-off: it can confirm that a login ID exists; it
-- returns the email only for an exact login ID match, never lists users.
REVOKE ALL ON FUNCTION public.resolve_login_identifier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(text) TO anon, authenticated, service_role;

-- is_admin_user: KEPT for anon. It is called inside RLS policies declared for role PUBLIC
-- (drivers, transport_agencies, driver_kyc_documents, job_offers, driver_locations, storage
-- objects, ...), which Postgres evaluates as the querying role, so an anon query on those
-- tables would fail with "permission denied for function" without it. It is also called by
-- invoker-rights trigger functions (guard_user_role_mutations and the enforce_* guards).
-- For a signed-out caller auth.uid() is NULL, so it returns false.
REVOKE ALL ON FUNCTION public.is_admin_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO anon, authenticated, service_role;

-- is_shipment_driver: KEPT for anon. Used by the PUBLIC-role policy "Shipments: assigned
-- driver read" on shipments, evaluated as the querying role (same reason as is_admin_user).
-- For a signed-out caller auth.uid() is NULL, so it returns false.
REVOKE ALL ON FUNCTION public.is_shipment_driver(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_shipment_driver(uuid) TO anon, authenticated, service_role;

-- platform_gst_registered: KEPT for anon (public pricing page reads the flag); already
-- granted explicitly in 20261043000000_unregistered_seller_mode.sql.
