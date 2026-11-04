#!/usr/bin/env node
/**
 * Generator for supabase/migrations/20261012000000_staff_scope_enforcement.sql.
 *
 * The migration re-states existing RLS policies and command RPCs with their
 * owner-only authority replaced by scope-aware authority. To avoid retyping
 * long SQL bodies, each object's CURRENT text is extracted from the migration
 * that last defined it and only the authority expression is substituted:
 *
 *   policies: the owner subquery
 *       (SELECT ta.id FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
 *     becomes (SELECT public.agency_caller_agencies(ARRAY['scope', ...]))
 *   RPCs: public.resolve_caller_agency_id()
 *     becomes public.resolve_caller_agency_for_scopes(ARRAY['scope'])
 *
 * Usage: node scripts/gen_staff_scope_migration.mjs        (writes the migration)
 *        node scripts/gen_staff_scope_migration.mjs --check (exit 1 if it differs)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(here, '..', 'supabase', 'migrations')
const OUT_NAME = '20261012000000_staff_scope_enforcement.sql'
const OUT = join(DIR, OUT_NAME)

const ALL = ['dispatcher', 'fleet_manager', 'finance', 'viewer']
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql') && f < OUT_NAME)
  .sort()
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n') }))

const arr = (scopes) => (scopes.length ? `ARRAY[${scopes.map((s) => `'${s}'`).join(', ')}]::text[]` : `ARRAY[]::text[]`)

// ---------------------------------------------------------------------------
// Policies: [table, policy name, scopes]. Owner always passes; [] = owner only.
// ---------------------------------------------------------------------------
const POLICIES = [
  ['agency_trucks', 'agency_trucks_select', ALL],
  ['agency_trucks', 'agency_trucks_insert', ['fleet_manager']],
  ['agency_trucks', 'agency_trucks_update', ['fleet_manager']],
  ['agency_driver_employment', 'agency_employment_select', ALL],
  ['agency_driver_employment', 'agency_employment_insert', ['fleet_manager']],
  ['agency_driver_employment', 'agency_employment_update', ['fleet_manager']],
  ['fleet_assignment_reservations', 'fleet_reservations_select', ALL],
  ['agency_jobs', 'agency_job_owner_read', ALL],
  ['agency_jobs', 'agency_job_owner_insert', ['dispatcher']],
  ['agency_jobs', 'agency_job_owner_update', ['dispatcher']],
  ['shipment_agency_consents', 'Parties read shipment agency consents', ALL],
  ['agency_client_agreements', 'agency_client_agreements_select', ALL],
  ['agency_client_sites', 'agency_client_sites_select', ALL],
  ['agency_client_contacts', 'agency_client_contacts_select', ALL],
  ['agency_tariff_versions', 'agency_tariff_versions_select', ALL],
  ['agency_driver_invitations', 'agency_driver_invitations_select', ['fleet_manager']],
]
// DELETE policies stay owner-only (agency_trucks_delete, agency_employment_delete,
// agency_job_owner_delete): deliberately not regenerated.

const OWNER_SUBQUERY = new RegExp(
  String.raw`\(\s*SELECT\s+(?:ta|transport_agencies)\.id\s+FROM\s+public\.transport_agencies(?:\s+ta)?\s+WHERE\s+(?:ta|transport_agencies)\.user_id\s*=\s*auth\.uid\(\)\s*\)`,
  'g'
)

function extractPolicy(table, name) {
  const header = new RegExp(String.raw`CREATE POLICY\s+"?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?\s+ON\s+public\.${table}\b`)
  let found = null
  for (const s of sources) {
    const m = header.exec(s.text)
    if (!m) continue
    const rest = s.text.slice(m.index)
    const end = rest.indexOf(';\n')
    found = { file: s.file, sql: rest.slice(0, end + 1) } // later files override earlier ones
  }
  if (!found) throw new Error(`policy not found: ${table}.${name}`)
  return found
}

function renderPolicy(table, name, scopes) {
  const { file, sql } = extractPolicy(table, name)
  let hits = 0
  const replaced = sql.replace(OWNER_SUBQUERY, () => {
    hits += 1
    return `(SELECT public.agency_caller_agencies(${arr(scopes)}))`
  })
  // Second owner shape (consents read): EXISTS (... ta.id = <table>.agency_id AND ta.user_id = auth.uid())
  const EXISTS_OWNER = new RegExp(
    String.raw`EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.transport_agencies\s+ta\s+WHERE\s+ta\.id\s*=\s*(?:public\.)?${table}\.agency_id\s+AND\s+ta\.user_id\s*=\s*auth\.uid\(\)\s*\)`,
    'g'
  )
  const replaced2 = replaced.replace(EXISTS_OWNER, () => {
    hits += 1
    return `${table}.agency_id IN (SELECT public.agency_caller_agencies(${arr(scopes)}))`
  })
  if (hits === 0) throw new Error(`no owner subquery in ${table}.${name} (${file})`)
  // agency_jobs policies carry no TO clause: scope them to authenticated so anon never evaluates the helper.
  const finalSql =
    table === 'agency_jobs' ? replaced2.replace(/\bFOR (SELECT|INSERT|UPDATE)\b/, 'FOR $1 TO authenticated') : replaced2
  return `-- ${table}.${name} (from ${file}; ${hits} owner check${hits === 1 ? '' : 's'} -> scope-aware)\nDROP POLICY IF EXISTS "${name}" ON public.${table};\n${finalSql}\n`
}

// ---------------------------------------------------------------------------
// RPCs: [function name, scopes]
// ---------------------------------------------------------------------------
const FLEET = ['fleet_manager']
const RPCS = [
  ['agency_vehicle_create', FLEET],
  ['agency_vehicle_update', FLEET],
  ['agency_driver_employment_create', FLEET],
  ['agency_driver_employment_update', FLEET],
  ['agency_driver_employment_end', FLEET],
  ['agency_driver_invitation_create', FLEET],
  ['agency_driver_invitation_revoke', FLEET],
  ['reserve_fleet_assignment', ['dispatcher']],
  ['release_fleet_assignment', ['dispatcher']],
  ['agency_client_agreement_create', ['finance']],
  ['agency_client_agreement_update', ['finance']],
  ['agency_client_site_create', ['finance']],
  ['agency_client_site_update', ['finance']],
  ['agency_client_contact_create', ['finance']],
  ['agency_client_contact_update', ['finance']],
  ['agency_tariff_version_publish', ['finance']],
  // Memberships stay owner-only (empty scope list): staff get the scope message.
  ['agency_member_invite', []],
  ['agency_member_invitation_revoke', []],
  ['agency_member_revoke', []],
  ['agency_member_change_scope', []],
]

function extractFunction(name) {
  const header = new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.${name}\(`)
  let found = null
  for (const s of sources) {
    const m = header.exec(s.text)
    if (!m) continue
    const rest = s.text.slice(m.index)
    const tag = /AS\s+(\$[A-Za-z0-9_]*\$)/.exec(rest)
    if (!tag) throw new Error(`no body tag for ${name}`)
    const close = rest.indexOf(`${tag[1]};`, tag.index + tag[0].length)
    if (close < 0) throw new Error(`no body end for ${name}`)
    found = { file: s.file, sql: rest.slice(0, close + tag[1].length + 1) }
  }
  if (!found) throw new Error(`function not found: ${name}`)
  return found
}

function renderFunction(name, scopes) {
  const { file, sql } = extractFunction(name)
  const call = /public\.resolve_caller_agency_id\(\)/g
  const hits = (sql.match(call) || []).length
  if (hits !== 1) throw new Error(`${name} (${file}): expected exactly one resolve_caller_agency_id() call, found ${hits}`)
  return `-- ${name} (from ${file}; authority -> ${scopes.join('|') || 'owner only'})\n${sql.replace(call, `public.resolve_caller_agency_for_scopes(${arr(scopes)})`)}\n`
}

// ---------------------------------------------------------------------------
const HEAD = `-- Staff scope enforcement (owner decision 2026-11-04: enforce scopes now).
--
-- GENERATED by scripts/gen_staff_scope_migration.mjs from the current text of
-- each object; only the authority expression is substituted. Forward-only,
-- additive in effect for the OWNER (unchanged behaviour), newly permissive for
-- ACTIVE staff memberships of an OPERATIONAL agency within these scopes:
--
--   fleet_manager : vehicles, driver employment, driver invitations (write)
--   dispatcher    : reserve/release fleet assignments, agency_jobs (write)
--   finance       : client agreements/sites/contacts, tariff publishing (write)
--   every scope   : read trucks, employment, reservations, agency_jobs,
--                   consents, client agreements/sites/contacts, tariffs
--   owner only    : DELETE on trucks/employment/jobs, memberships and
--                   staff-invitation commands, consent revocation
--
-- Authority helpers are SECURITY DEFINER with a pinned search_path and are
-- evaluated ONCE per statement inside policies via an uncorrelated sub-select.
-- Known gap: the legacy Edge functions authenticate the owner only, so staff
-- do not gain access through them.

CREATE INDEX IF NOT EXISTS agency_memberships_active_by_user
  ON public.agency_memberships (user_id, agency_id)
  WHERE status = 'active';

-- Agencies the caller may act for within the given scopes: every agency the
-- caller OWNS, plus operational agencies where the caller holds an ACTIVE
-- membership whose scope is in the list.
CREATE OR REPLACE FUNCTION public.agency_caller_agencies(p_scopes text[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ta.id
  FROM public.transport_agencies ta
  WHERE ta.user_id = auth.uid()
  UNION
  SELECT m.agency_id
  FROM public.agency_memberships m
  JOIN public.transport_agencies ta ON ta.id = m.agency_id AND ta.status = 'approved'
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.scope = ANY (p_scopes);
$$;

-- Single acting agency for a command RPC (no agency id argument by design).
CREATE OR REPLACE FUNCTION public.resolve_caller_agency_for_scopes(p_scopes text[])
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_agency_id uuid;
BEGIN
  SELECT count(*)::int, min(a::text)::uuid
    INTO v_count, v_agency_id
  FROM public.agency_caller_agencies(p_scopes) a;

  IF v_count = 0 THEN
    -- Active staff of an agency that is not approved: same wording as owners (state before scope).
    IF EXISTS (
      SELECT 1
      FROM public.agency_memberships m
      JOIN public.transport_agencies ta ON ta.id = m.agency_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND ta.status <> 'approved'
    ) THEN
      RAISE EXCEPTION 'Agency approval is required.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.transport_agencies ta WHERE ta.user_id = auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.agency_memberships m
         WHERE m.user_id = auth.uid() AND m.status = 'active'
       ) THEN
      RAISE EXCEPTION 'Your access scope does not allow this action.';
    END IF;
    RAISE EXCEPTION 'No agency profile found for this account.';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Multiple agency profiles found for this account.';
  END IF;

  RETURN v_agency_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agency_caller_agencies(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_caller_agency_for_scopes(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_caller_agencies(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_caller_agency_for_scopes(text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
`

let sql = HEAD
for (const [table, name, scopes] of POLICIES) sql += '\n' + renderPolicy(table, name, scopes)
sql += '\n-- ---------------------------------------------------------------------------\n-- Command RPCs (CREATE OR REPLACE keeps existing GRANT/REVOKE)\n-- ---------------------------------------------------------------------------\n'
for (const [name, scopes] of RPCS) sql += '\n' + renderFunction(name, scopes)

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
  if (current !== sql) {
    console.error('FAIL: ' + OUT_NAME + ' differs from the generator output')
    process.exit(1)
  }
  console.log('PASS: ' + OUT_NAME + ' matches the generator')
} else {
  writeFileSync(process.env.STAFF_SCOPE_OUT || OUT, sql, 'utf8')
  console.log(`WROTE ${OUT_NAME}: ${POLICIES.length} policies, ${RPCS.length} functions, ${sql.split('\n').length} lines`)
}
