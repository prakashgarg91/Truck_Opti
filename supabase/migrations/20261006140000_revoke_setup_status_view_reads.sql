-- =========================================================
-- TO-142 round 3 (A5): revoke client reads on the
-- setup-verification aggregate view.
--
-- public.production_setup_status (20260212000000:394-412) is an
-- owner-rights view (security_invoker = false) that exposes raw row
-- counts of every tenant table to any client holding SELECT. Its only
-- reference outside this migration is a generated type definition
-- (frontend/src/types/database.types.ts:571); no frontend query, Edge
-- function or harness consumes it — it is a SQL-editor verification
-- helper. This applies the A5 finding's own house fix: REVOKE SELECT
-- from anon and authenticated. The owner and service_role keep access
-- (service_role grants are untouched; BYPASSRLS roles are unaffected by
-- RLS-adjacent revokes on the view's grants).
-- =========================================================

REVOKE SELECT ON public.production_setup_status FROM anon;
REVOKE SELECT ON public.production_setup_status FROM authenticated;
