-- TO-151: agency ERP connector (credentialed, idempotent order feed).
--
-- agency_erp_connections: one credentialed feed per client agreement. The shared secret is shown
-- ONCE (create / rotate) and only its sha256 hex is stored; authenticated has no SELECT on
-- secret_hash and no direct writes. agency_erp_events: one row per external event id.
-- Writes happen ONLY through SECURITY DEFINER commands. The three management commands take no
-- agency id (agency from auth.uid(), scope 'dispatcher' = owner + dispatcher). erp_event_ingest is
-- service-role only and reuses agency_order_import (the validated, atomic import) unchanged: it
-- runs the import with the agency owner as the transaction-local acting identity, then restores
-- the caller's claims. Local DB only; hosted PostgREST behaviour is not covered by this file.

CREATE TABLE IF NOT EXISTS public.agency_erp_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  agreement_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 60),
  kind TEXT NOT NULL CHECK (kind IN ('csv_drop', 'webhook')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
  secret_hash TEXT NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  secret_hint TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_erp_connections_client_fk
    FOREIGN KEY (client_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_erp_connections_agreement_fk
    FOREIGN KEY (agreement_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_erp_connections_name_key UNIQUE (agency_id, name),
  CONSTRAINT agency_erp_connections_idem_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_erp_connections_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_erp_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL CHECK (btrim(external_event_id) <> ''),
  payload_hash TEXT NOT NULL CHECK (btrim(payload_hash) <> ''),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'duplicate')),
  problems JSONB,
  batch_id UUID,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_erp_events_connection_fk
    FOREIGN KEY (connection_id, agency_id)
    REFERENCES public.agency_erp_connections (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_erp_events_batch_fk
    FOREIGN KEY (batch_id, agency_id)
    REFERENCES public.agency_order_batches (id, agency_id) ON DELETE SET NULL (batch_id),
  CONSTRAINT agency_erp_events_ext_key UNIQUE (connection_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS agency_erp_connections_by_agency ON public.agency_erp_connections (agency_id, status);
CREATE INDEX IF NOT EXISTS agency_erp_events_by_agency ON public.agency_erp_events (agency_id, received_at DESC);

ALTER TABLE public.agency_erp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_erp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_erp_connections_select ON public.agency_erp_connections;
CREATE POLICY agency_erp_connections_select ON public.agency_erp_connections
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[])));

DROP POLICY IF EXISTS agency_erp_events_select ON public.agency_erp_events;
CREATE POLICY agency_erp_events_select ON public.agency_erp_events
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[])));

REVOKE ALL ON public.agency_erp_connections, public.agency_erp_events FROM PUBLIC, anon, authenticated;
-- Column-level SELECT: everything except secret_hash (and the internal idempotency key).
GRANT SELECT (id, agency_id, client_id, agreement_id, name, kind, status, secret_hint, version, created_by, created_at)
  ON public.agency_erp_connections TO authenticated;
GRANT SELECT ON public.agency_erp_events TO authenticated;
GRANT ALL ON public.agency_erp_connections, public.agency_erp_events TO service_role;

-- Internal: a fresh random secret (two v4 uuids = 244 random bits from the server CSPRNG).
CREATE OR REPLACE FUNCTION public.agency_erp_new_secret()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'erpk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

CREATE OR REPLACE FUNCTION public.agency_erp_hash(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(coalesce(p_text, ''), 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.agency_erp_new_secret() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_erp_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agency_erp_new_secret() TO service_role;
GRANT EXECUTE ON FUNCTION public.agency_erp_hash(text) TO service_role;

CREATE OR REPLACE FUNCTION public.agency_erp_connection_create(
  p_client_id uuid,
  p_agreement_id uuid,
  p_name text,
  p_kind text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_name text;
  v_existing public.agency_erp_connections%ROWTYPE;
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_secret text;
  v_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('erp_conn:' || v_agency_id::text, 0));

  SELECT * INTO v_existing
  FROM public.agency_erp_connections
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.client_id = p_client_id AND v_existing.agreement_id = p_agreement_id
       AND v_existing.name = btrim(coalesce(p_name, '')) AND v_existing.kind = p_kind THEN
      RETURN jsonb_build_object('ok', true, 'connection_id', v_existing.id, 'secret', NULL, 'replay', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('csv_drop', 'webhook') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agency_client_agreements
    WHERE id = p_client_id AND agency_id = v_agency_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_not_found');
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_found');
  END IF;
  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  IF EXISTS (SELECT 1 FROM public.agency_erp_connections WHERE agency_id = v_agency_id AND name = v_name) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_exists');
  END IF;

  v_secret := public.agency_erp_new_secret();

  INSERT INTO public.agency_erp_connections (
    agency_id, client_id, agreement_id, name, kind, secret_hash, secret_hint, idempotency_key, created_by
  )
  VALUES (
    v_agency_id, p_client_id, p_agreement_id, v_name, p_kind,
    public.agency_erp_hash(v_secret), right(v_secret, 4), v_key, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'connection_id', v_id, 'secret', v_secret);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_erp_connection_set_status(
  p_connection_id uuid,
  p_to_status text,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_conn public.agency_erp_connections%ROWTYPE;
  v_new_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_to_status IS NULL OR p_to_status NOT IN ('active', 'paused', 'revoked') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO v_conn
  FROM public.agency_erp_connections
  WHERE id = p_connection_id AND agency_id = v_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_not_found');
  END IF;

  IF v_conn.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_conn.version);
  END IF;

  IF v_conn.status = 'revoked' OR v_conn.status = p_to_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition');
  END IF;

  UPDATE public.agency_erp_connections
  SET status = p_to_status, version = version + 1
  WHERE id = p_connection_id
  RETURNING version INTO v_new_version;

  RETURN jsonb_build_object('ok', true, 'status', p_to_status, 'version', v_new_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_erp_connection_rotate_secret(
  p_connection_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_conn public.agency_erp_connections%ROWTYPE;
  v_secret text;
  v_new_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_conn
  FROM public.agency_erp_connections
  WHERE id = p_connection_id AND agency_id = v_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_not_found');
  END IF;

  IF v_conn.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_revoked');
  END IF;

  IF v_conn.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_conn.version);
  END IF;

  v_secret := public.agency_erp_new_secret();

  UPDATE public.agency_erp_connections
  SET secret_hash = public.agency_erp_hash(v_secret), secret_hint = right(v_secret, 4), version = version + 1
  WHERE id = p_connection_id
  RETURNING version INTO v_new_version;

  RETURN jsonb_build_object('ok', true, 'secret', v_secret, 'version', v_new_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_event_ingest(
  p_connection_id uuid,
  p_secret text,
  p_external_event_id text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_lines CONSTANT integer := 2000;
  v_conn public.agency_erp_connections%ROWTYPE;
  v_found boolean;
  v_hash text;
  v_ext text;
  v_payload_hash text;
  v_event public.agency_erp_events%ROWTYPE;
  v_owner uuid;
  v_prev_claims text;
  v_prev_sub text;
  v_res jsonb;
  v_batch uuid;
  v_problems jsonb;
BEGIN
  -- 1. Credentials. Unknown connection and wrong secret are indistinguishable (same work, same answer).
  v_hash := public.agency_erp_hash(p_secret);
  SELECT * INTO v_conn FROM public.agency_erp_connections WHERE id = p_connection_id;
  v_found := FOUND;
  IF NOT v_found OR p_secret IS NULL OR v_conn.secret_hash IS DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_credentials');
  END IF;

  IF v_conn.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_not_active');
  END IF;

  IF NOT public.agency_is_operational(v_conn.agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_operational');
  END IF;

  -- 2. Request shape, before anything is recorded.
  v_ext := btrim(coalesce(p_external_event_id, ''));
  IF v_ext = '' OR char_length(v_ext) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_id_required');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_lines');
  END IF;
  IF jsonb_array_length(p_lines) > c_max_lines THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_lines');
  END IF;

  IF octet_length(p_lines::text) > 1048576 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload_too_large');
  END IF;

  v_payload_hash := public.agency_erp_hash(p_lines::text);

  -- 3. Serialise per connection + event id so duplicate detection cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('erp_ingest:' || p_connection_id::text || ':' || v_ext, 0));

  SELECT * INTO v_event
  FROM public.agency_erp_events
  WHERE connection_id = p_connection_id AND external_event_id = v_ext;
  IF FOUND THEN
    IF v_event.payload_hash <> v_payload_hash THEN
      RETURN jsonb_build_object('ok', false, 'error', 'event_id_reused');
    END IF;
    IF v_event.outcome = 'accepted' THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'duplicate', 'batch_id', v_event.batch_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'outcome', 'duplicate', 'error', 'invalid_lines', 'problems', v_event.problems);
  END IF;

  -- 4. Validated, atomic import: agency_order_import, unchanged. It resolves the agency from
  -- auth.uid(), so the agency owner is the acting identity for this transaction only; the
  -- caller's claims are restored straight after.
  SELECT user_id INTO v_owner FROM public.transport_agencies WHERE id = v_conn.agency_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_operational');
  END IF;

  v_prev_claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}');
  v_prev_sub := coalesce(current_setting('request.jwt.claim.sub', true), '');
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  BEGIN
    v_res := public.agency_order_import(v_conn.agreement_id, v_payload_hash, 'erp:' || v_ext, p_lines);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', v_prev_claims, true);
    PERFORM set_config('request.jwt.claim.sub', v_prev_sub, true);
    RAISE;
  END;
  PERFORM set_config('request.jwt.claims', v_prev_claims, true);
  PERFORM set_config('request.jwt.claim.sub', v_prev_sub, true);

  IF coalesce((v_res ->> 'ok')::boolean, false) THEN
    v_batch := (v_res ->> 'batch_id')::uuid;
    INSERT INTO public.agency_erp_events (connection_id, agency_id, external_event_id, payload_hash, outcome, problems, batch_id)
    VALUES (p_connection_id, v_conn.agency_id, v_ext, v_payload_hash, 'accepted', NULL, v_batch);
    RETURN jsonb_build_object('ok', true, 'outcome', 'accepted', 'batch_id', v_batch, 'import', v_res);
  END IF;

  IF v_res ->> 'error' = 'idempotency_key_reused' THEN
    -- The same external id was already used on another feed of this agency with different content.
    RETURN jsonb_build_object('ok', false, 'error', 'event_id_reused');
  END IF;

  IF v_res ->> 'error' IS DISTINCT FROM 'invalid_lines' THEN
    -- Transient or state-dependent refusal: typed error, nothing stored, so a corrected retry works.
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_res ->> 'error', 'import_refused'))
      || CASE WHEN v_res ? 'refs' THEN jsonb_build_object('refs', v_res -> 'refs') ELSE '{}'::jsonb END;
  END IF;

  v_problems := coalesce(v_res -> 'problems', '[]'::jsonb);

  INSERT INTO public.agency_erp_events (connection_id, agency_id, external_event_id, payload_hash, outcome, problems)
  VALUES (p_connection_id, v_conn.agency_id, v_ext, v_payload_hash, 'rejected', v_problems);

  RETURN jsonb_build_object('ok', false, 'outcome', 'rejected', 'error', 'invalid_lines', 'problems', v_problems);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_erp_connection_create(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_erp_connection_set_status(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_erp_connection_rotate_secret(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_event_ingest(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agency_erp_connection_create(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_erp_connection_set_status(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_erp_connection_rotate_secret(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_event_ingest(uuid, text, text, jsonb) TO service_role;
