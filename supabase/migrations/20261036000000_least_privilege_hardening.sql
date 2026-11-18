-- Least-privilege hardening for the 20261008+ chain (privilege matrix PM05 / PM13).
-- Pure grant changes: no function body, policy, table or behaviour change for authenticated / service_role.
-- Idempotent (REVOKE on an absent grant is a no-op).

-- PM05. Trigger functions were created with the PostgreSQL default EXECUTE-to-PUBLIC, so anon (and every role)
-- could EXECUTE them. They are never called through the API; PostgreSQL checks EXECUTE on a trigger function at
-- CREATE TRIGGER time only, so firing is unaffected. Revoke from PUBLIC and the API roles.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.prorettype = 'pg_catalog.trigger'::regtype
       AND p.proname = ANY (ARRAY[
         'agency_consignment_events_append_only', 'agency_consignments_freeze_identity', 'agency_expense_append_only_guard',
         'agency_incidents_guard', 'agency_invoice_append_only', 'agency_invoice_check_ledger', 'agency_invoice_guard_frozen',
         'agency_jobs_set_completed_at', 'agency_load_plan_children_guard', 'agency_load_plan_order_status_sync',
         'agency_load_plans_guard', 'agency_maintenance_item_guard', 'agency_payroll_guard_adjustments',
         'agency_payroll_guard_line_jobs', 'agency_payroll_guard_lines', 'agency_payroll_guard_period',
         'bump_agency_employment_version', 'bump_agency_truck_version', 'bump_fleet_reservation_version',
         'enforce_agency_truck_driver_assignment', 'guard_fleet_reservation_overlap', 'payment_history_snapshot_guard',
         'platform_billing_settings_no_delete', 'prevent_agency_tariff_mutation', 'release_fleet_reservations_on_job_cancel',
         'release_fleet_reservations_on_offer_transition', 'subscription_append_only_guard', 'subscription_credit_note_guard',
         'subscription_invoice_counters_guard', 'subscription_ledger_append_only', 'subscription_ledger_number_guard',
         'subscriptions_guard_update', 'tracking_pings_immutable'
       ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$$;

-- PM13. Supabase default privileges grant anon full table DML on new public tables; RLS alone masks it. Anon has
-- no write path anywhere in this chain and no public page reads these tables (the frontend reads them only as
-- an authenticated user), so remove anon's table privileges. agency_driver_employment is the confirmed leak; the
-- rest of the chain is revoked defensively (anon: write-class privileges; SELECT is left untouched).
-- SELECT is kept (RLS returns zero rows; agency_fleet_foundation H1 asserts a clean empty read, not an error).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.agency_driver_employment FROM anon;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agency_client_agreements', 'agency_client_contacts', 'agency_client_sites', 'agency_consignment_events',
    'agency_consignments', 'agency_driver_invitations', 'agency_driver_rates', 'agency_erp_connections',
    'agency_erp_events', 'agency_expenses', 'agency_fuel_fills', 'agency_gr_sequences', 'agency_incidents',
    'agency_invitations', 'agency_invoice_lines', 'agency_invoice_payments', 'agency_invoice_sequences',
    'agency_invoices', 'agency_load_plan_lines', 'agency_load_plan_loads', 'agency_load_plan_unmet',
    'agency_load_plans', 'agency_maintenance_items', 'agency_maintenance_services', 'agency_memberships',
    'agency_order_batches', 'agency_order_lines', 'agency_orders', 'agency_payroll_adjustments',
    'agency_payroll_line_jobs', 'agency_payroll_lines', 'agency_payroll_periods', 'agency_tariff_versions',
    'agency_tracking_pings', 'driver_kyc_documents', 'expiry_sweep_runs', 'fleet_assignment_reservations',
    'platform_billing_settings', 'razorpay_webhook_attempts', 'razorpay_webhook_events', 'shipment_agency_consents',
    'subscription_backfill_conflicts', 'subscription_coupon_redemptions', 'subscription_coupons',
    'subscription_credit_notes', 'subscription_invoice_counters', 'subscription_invoices',
    'subscription_refund_exceptions', 'subscription_reminders', 'subscription_sweep_runs', 'subscription_trial_claims'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END
$$;
