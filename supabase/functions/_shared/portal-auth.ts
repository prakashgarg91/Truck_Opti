import { createClient, type SupabaseClient, type User as AuthUser } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export class RequestError extends Error {
  status: number
  expose: boolean

  constructor(message: string, status = 400, expose = true) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.expose = expose
  }
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()

  if (!value) {
    throw new RequestError(`Missing required environment variable: ${name}`, 500, false)
  }

  return value
}

export function getBearerToken(authorization: string | null) {
  if (!authorization) {
    throw new RequestError('Authentication is required.', 401)
  }

  const token = authorization.replace('Bearer ', '').trim()

  if (!token) {
    throw new RequestError('Authentication is required.', 401)
  }

  return token
}

export function normalizeRole(role: string | null) {
  return typeof role === 'string' && role.trim().length > 0 ? role : 'user'
}

function createAuthClient(supabaseUrl: string, supabaseAnonKey: string, authorization: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  })
}

function createServiceClient(supabaseUrl: string, supabaseServiceRoleKey: string) {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function getCaller(authClient: SupabaseClient, accessToken: string) {
  const {
    data: { user: caller },
    error: callerError,
  } = await authClient.auth.getUser(accessToken)

  if (callerError || !caller) {
    throw new RequestError('Authentication is required.', 401)
  }

  return caller
}

export async function requireAdminContext(authorization: string | null) {
  const accessToken = getBearerToken(authorization)
  const normalizedAuthorization = authorization ?? `Bearer ${accessToken}`

  const supabaseUrl = getRequiredEnv('SUPABASE_URL')
  const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey, normalizedAuthorization)
  const serviceClient = createServiceClient(supabaseUrl, supabaseServiceRoleKey)
  const caller = await getCaller(authClient, accessToken)

  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('users')
    .select('id, role')
    .eq('id', caller.id)
    .maybeSingle<{ id: string; role: string | null }>()

  if (callerProfileError) {
    console.error('Failed to resolve caller profile', callerProfileError)
    throw new RequestError('Unable to verify admin access.', 500, false)
  }

  if (normalizeRole(callerProfile?.role ?? null) !== 'admin') {
    throw new RequestError('Admin access is required.', 403)
  }

  return { caller, serviceClient }
}

export async function assertDriverOnAgencyFleet(
  serviceClient: SupabaseClient,
  agencyId: string,
  driverId: string,
) {
  const { data, error } = await serviceClient
    .from('agency_trucks')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('driver_id', driverId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Failed to verify agency fleet driver', error)
    throw new RequestError('Unable to verify driver assignment.', 500, false)
  }

  if (!data) {
    throw new RequestError('Driver is not assigned to this agency fleet.', 403)
  }
}

export async function assertDriverLinkedToAgency(
  serviceClient: SupabaseClient,
  agencyId: string,
  driverId: string,
) {
  await assertDriverOnAgencyFleet(serviceClient, agencyId, driverId)
}

export async function assertDriverAvailableForAgencyTruck(
  serviceClient: SupabaseClient,
  agencyId: string,
  driverId: string,
) {
  const [driverRes, foreignTruckRes] = await Promise.all([
    serviceClient
      .from('drivers')
      .select('id, status')
      .eq('id', driverId)
      .maybeSingle<{ id: string; status: string }>(),
    serviceClient
      .from('agency_trucks')
      .select('id, agency_id')
      .eq('driver_id', driverId)
      .neq('agency_id', agencyId)
      .limit(1)
      .maybeSingle(),
  ])

  const lookupError = driverRes.error || foreignTruckRes.error

  if (lookupError) {
    console.error('Failed to verify driver for truck assignment', lookupError)
    throw new RequestError('Unable to verify driver.', 500, false)
  }

  if (!driverRes.data) {
    throw new RequestError('Driver not found.', 404)
  }

  if (driverRes.data.status !== 'approved') {
    throw new RequestError('Driver is not approved for assignment.', 403)
  }

  if (foreignTruckRes.data) {
    throw new RequestError('Driver is already assigned to another agency.', 403)
  }
}

export async function requireAgencyContext(authorization: string | null) {
  const accessToken = getBearerToken(authorization)
  const normalizedAuthorization = authorization ?? `Bearer ${accessToken}`

  const supabaseUrl = getRequiredEnv('SUPABASE_URL')
  const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey, normalizedAuthorization)
  const serviceClient = createServiceClient(supabaseUrl, supabaseServiceRoleKey)
  const caller = await getCaller(authClient, accessToken)

  const { data: agency, error: agencyError } = await serviceClient
    .from('transport_agencies')
    .select('id')
    .eq('user_id', caller.id)
    .maybeSingle<{ id: string }>()

  if (agencyError) {
    console.error('Failed to resolve agency', agencyError)
    throw new RequestError('Unable to verify agency access.', 500, false)
  }

  if (!agency?.id) {
    throw new RequestError('Agency access is required.', 403)
  }

  return { caller, serviceClient, agencyId: agency.id }
}

export function handleRequestError(scope: string, error: unknown) {
  const requestError = error instanceof RequestError ? error : null

  if (!requestError) {
    console.error(`Unhandled ${scope} error`, error)
  }

  return jsonResponse(
    {
      error: requestError?.expose ? requestError.message : 'Unable to complete the request.',
    },
    requestError?.status ?? 500,
  )
}