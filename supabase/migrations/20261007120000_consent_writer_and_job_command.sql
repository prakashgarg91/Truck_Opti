-- =========================================================
-- TO-143-D1: production consent writer + consent-gated
-- agency-job creation command.
--
-- Sorts after 20261006140000_revoke_setup_status_view_reads.sql and applies
-- after the full existing chain; 20261006120000's fail-closed consent gate
-- (shipment_agency_consents table + agency_jobs INSERT/UPDATE policies) and
-- 20261006130000's dispatch producer are PREREQUISITES — this delivery is
-- what unblocks them by giving the gate its production writer. Local proof =
-- full-chain PGlite replay via the maintained DB batteries; hosted
-- replay/migration rollout is owner-gated (TO-153; no `supabase db push`
-- without owner approval). All statements are CREATE OR REPLACE / idempotent
-- DDL; forward-only. No data backfill; no policy/grant changes to existing
-- objects beyond the two function ACLs below.
--
-- 1. public.authorize_agency_for_shipment(p_shipment_id uuid,
--    p_agency_id uuid) RETURNS jsonb — the customer grant command (roadmap
--    §6 authorizeAgency, docs/PRODUCT_ROADMAP.md:201, scoped to ONE shipment
--    + ONE agency). SECURITY DEFINER because the caller owns the shipment
--    but shipment_agency_consents INSERT is service/admin-only
--    (20261006120000:340) — the definer body is fully caller-bound:
--      (a) shipment ownership mirrors the dispatch producer's predicate
--          (20261006130000:60-70): customer_id / created_by /
--          customers.created_by = auth.uid() — deliberately WITHOUT the
--          tracking RPC's is_admin_user arm (20260730110000:42). No service
--          path. Else 'Shipment not found or access denied' (producer
--          message parity).
--      (b) agency self-grant denial: the caller owning the targeted agency
--          is refused even when they also own the shipment ('An agency
--          cannot grant itself consent on a shipment.').
--      (c) agency existence ('Agency not found.') and operational status via
--          public.agency_is_operational ('Agency approval is required.' —
--          portal-auth.ts / guard-trigger message parity).
--      (d) grant-time lifecycle: only status='pending' shipments
--          ('Shipment is not open for dispatch.' — producer parity).
--    The write is ONE atomic statement (INSERT ... ON CONFLICT
--    (shipment_id, agency_id) DO UPDATE ... WHERE revoked_at IS NOT NULL
--    RETURNING): an active row is returned unchanged as 'already_active'
--    (no second write), a revoked row is reactivated in place
--    ('reactivated'), a fresh pair is inserted ('granted'). The preceding
--    EXISTS read only labels the returned state; the write itself never
--    splits.
--
-- 2. public.revoke_agency_for_shipment(p_shipment_id uuid, p_agency_id uuid)
--    RETURNS jsonb — same posture, ownership guard (a) ONLY. Single
--    UPDATE ... WHERE revoked_at IS NULL; idempotent no-op when nothing is
--    active; returns {id, state: 'revoked'|'already_revoked'}. Delivery 1
--    ships this as RPC-only (no UI surface) by explicit supervisor
--    acceptance; the batteries exercise it and future surfaces/ops can call
--    it.
--
-- CONSENT VALIDITY — REVOCATION-ONLY (the pinned invariant; reviewer finding
-- 1 corrected language): a consent row remains active until explicitly
-- revoked via revoke_agency_for_shipment. NO shipment-status cutoff is
-- enforced. An active consent continues to permit agency_jobs writes after
-- the shipment reaches a terminal status (reproduced finding in
-- scripts/dispatch_delivery_journey.db.test.mjs section J, remediation
-- owner-deferred: shipment-status predicate on the agency_jobs
-- INSERT/UPDATE policies, or a consent auto-revoke trigger — both outside
-- this delivery's fences). The grant-time lifecycle guard (d) applies only
-- to NEW grants; it cannot and must not be read as a terminal-status
-- invariant.
--
-- ROADMAP DEVIATION (acknowledged): roadmap :201 carries
-- authorizeAgency(orderId, agencyId, expectedVersion); :202-203 carry
-- expectedVersion for dispatchLoad/advanceTrip. shipments has no version
-- column (20260107000000:80-97; created_by added 20260307000000:12), so
-- delivery 1 carries idempotency with the two unique keys
-- (shipment_agency_consents UNIQUE(shipment_id, agency_id) and
-- agency_jobs_agency_id_shipment_id_key) and no expected_version. The
-- versioned commands belong to deliveries 2-3 (TO-143-D2/D3).
--
-- SERVICE-ROLE AUDIT NOTES (roadmap item 7): the only non-RPC write path to
-- shipment_agency_consents remains the service_role BYPASSRLS direct INSERT
-- — the pinned platform_dispatch/admin_grant authority (20261006120000:337-
-- 340), never exposed to interactive clients. The new RPCs are definer but
-- caller-bound (guards above) and carry NO service_role EXECUTE: the service
-- path writes directly (BYPASSRLS) and needs no function grant.
--
-- LEGACY CONSENT INVENTORY (schema/SQL-level only; run when hosted access
-- exists — TO-153. NO backfill is performed: consent is never fabricated
-- from mere existence; remediation for pre-consent jobs is the controlled
-- re-consent path via authorize_agency_for_shipment, which reactivates or
-- creates the row and restores the agency's authenticated path):
--
--   SELECT aj.id, aj.agency_id, aj.shipment_id, aj.status, aj.created_at
--   FROM public.agency_jobs aj
--   LEFT JOIN public.shipment_agency_consents sac
--     ON sac.shipment_id = aj.shipment_id
--    AND sac.agency_id = aj.agency_id
--    AND sac.revoked_at IS NULL
--   WHERE sac.id IS NULL;
--
-- EMERGENCY RECOVERY: stop the writer without touching the fail-closed
-- consent gate (20261006120000:340, :382-421 stays fully enforced) with
--   REVOKE EXECUTE ON FUNCTION public.authorize_agency_for_shipment(uuid, uuid),
--            public.revoke_agency_for_shipment(uuid, uuid)
--   FROM authenticated;
-- re-enable with the matching GRANT below.
-- =========================================================

-- ---------------------------------------------------------------------------
-- 1. Consent grant (customer command)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authorize_agency_for_shipment(
  p_shipment_id uuid,
  p_agency_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_had_revoked_row boolean;
  v_state text;
  v_updated record;
  v_active_id uuid;
BEGIN
  -- (a) Caller-bound shipment ownership — producer predicate parity
  --     (20261006130000:60-70), WITHOUT the is_admin_user arm.
  IF NOT EXISTS (
    SELECT 1
    FROM public.shipments s
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE s.id = p_shipment_id
      AND (
        s.customer_id = auth.uid()
        OR s.created_by = auth.uid()
        OR c.created_by = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'Shipment not found or access denied';
  END IF;

  -- (b) Agency self-grant denial: non-redundant with (a) because one caller
  --     can be both shipment creator and agency owner.
  IF EXISTS (
    SELECT 1
    FROM public.transport_agencies ta
    WHERE ta.id = p_agency_id
      AND ta.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'An agency cannot grant itself consent on a shipment.';
  END IF;

  -- (c) Agency existence + operational status at grant time.
  IF NOT EXISTS (
    SELECT 1
    FROM public.transport_agencies ta
    WHERE ta.id = p_agency_id
  ) THEN
    RAISE EXCEPTION 'Agency not found.';
  END IF;

  IF NOT public.agency_is_operational(p_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  -- (d) Grant-time lifecycle guard: only pending shipments are open for new
  --     consent. (Consent validity thereafter is REVOCATION-ONLY — no
  --     terminal-status cutoff is enforced; see the header.)
  IF NOT EXISTS (
    SELECT 1
    FROM public.shipments s
    WHERE s.id = p_shipment_id
      AND s.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Shipment is not open for dispatch.';
  END IF;

  -- Label only: does a (revoked) row already exist for this pair?
  SELECT EXISTS (
    SELECT 1
    FROM public.shipment_agency_consents sac
    WHERE sac.shipment_id = p_shipment_id
      AND sac.agency_id = p_agency_id
      AND sac.revoked_at IS NOT NULL
  ) INTO v_had_revoked_row;

  -- The one atomic write: fresh insert ('granted') or in-place reactivation
  -- of a revoked row ('reactivated'). An ACTIVE row conflicts but fails the
  -- DO UPDATE predicate, so no second write happens (zero rows returned).
  WITH written AS (
    INSERT INTO public.shipment_agency_consents (shipment_id, agency_id, granted_by, granted_via)
    VALUES (p_shipment_id, p_agency_id, auth.uid(), 'customer_consent')
    ON CONFLICT (shipment_id, agency_id) DO UPDATE
      SET revoked_at = NULL,
          granted_by = EXCLUDED.granted_by,
          granted_via = 'customer_consent'
      WHERE shipment_agency_consents.revoked_at IS NOT NULL
    RETURNING id
  )
  SELECT w.id INTO v_updated FROM written w;

  IF v_updated.id IS NOT NULL THEN
    v_state := CASE WHEN v_had_revoked_row THEN 'reactivated' ELSE 'granted' END;
    RETURN jsonb_build_object('id', v_updated.id, 'state', v_state);
  END IF;

  -- Idempotent replay: return the active row unchanged.
  SELECT sac.id INTO v_active_id
  FROM public.shipment_agency_consents sac
  WHERE sac.shipment_id = p_shipment_id
    AND sac.agency_id = p_agency_id
    AND sac.revoked_at IS NULL;

  RETURN jsonb_build_object('id', v_active_id, 'state', 'already_active');
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_agency_for_shipment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_agency_for_shipment(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Consent revoke (customer command; RPC-only in delivery 1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_agency_for_shipment(
  p_shipment_id uuid,
  p_agency_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_revoked record;
BEGIN
  -- Ownership guard only (a): the same producer-mirrored predicate.
  IF NOT EXISTS (
    SELECT 1
    FROM public.shipments s
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE s.id = p_shipment_id
      AND (
        s.customer_id = auth.uid()
        OR s.created_by = auth.uid()
        OR c.created_by = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'Shipment not found or access denied';
  END IF;

  SELECT sac.id INTO v_existing_id
  FROM public.shipment_agency_consents sac
  WHERE sac.shipment_id = p_shipment_id
    AND sac.agency_id = p_agency_id;

  -- The one atomic write: revoke the active row, or no-op.
  WITH written AS (
    UPDATE public.shipment_agency_consents
       SET revoked_at = now()
     WHERE shipment_id = p_shipment_id
       AND agency_id = p_agency_id
       AND revoked_at IS NULL
    RETURNING id
  )
  SELECT w.id INTO v_revoked FROM written w;

  IF v_revoked.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_revoked.id, 'state', 'revoked');
  END IF;

  -- Idempotent no-op: nothing was active (row revoked earlier, or never
  -- existed).
  RETURN jsonb_build_object('id', v_existing_id, 'state', 'already_revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_agency_for_shipment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_agency_for_shipment(uuid, uuid) TO authenticated;
