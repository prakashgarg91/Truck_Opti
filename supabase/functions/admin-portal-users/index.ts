import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type User as AuthUser } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DISABLE_DURATION = '876000h'

type PortalUserRow = {
  id: string
  email: string | null
  role: string | null
  created_at: string
  updated_at: string
  name: string | null
  phone: string | null
}

type AdminRequest =
  | { action: 'list' }
  | { action: 'set-disabled'; userId: string; disabled: boolean }
  | { action: 'delete'; userId: string }

class RequestError extends Error {
  status: number
  expose: boolean

  constructor(message: string, status = 400, expose = true) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.expose = expose
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()

  if (!value) {
    throw new RequestError(`Missing required environment variable: ${name}`, 500, false)
  }

  return value
}

function getBearerToken(authorization: string | null) {
  if (!authorization) {
    throw new RequestError('Authentication is required.', 401)
  }

  const token = authorization.replace('Bearer ', '').trim()

  if (!token) {
    throw new RequestError('Authentication is required.', 401)
  }

  return token
}

function normalizeRole(role: string | null) {
  return typeof role === 'string' && role.trim().length > 0 ? role : 'user'
}

function isDisabled(authUser?: Pick<AuthUser, 'banned_until'> | null) {
  if (!authUser?.banned_until) {
    return false
  }

  const bannedUntil = Date.parse(authUser.banned_until)

  return Number.isFinite(bannedUntil) && bannedUntil > Date.now()
}

function serializePortalUser(profile: PortalUserRow, authUser?: AuthUser | null) {
  return {
    id: profile.id,
    email: profile.email ?? authUser?.email ?? '',
    role: normalizeRole(profile.role),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    name: profile.name ?? undefined,
    phone: profile.phone ?? undefined,
    account_status: isDisabled(authUser) ? 'disabled' : 'active',
    banned_until: authUser?.banned_until ?? null,
  }
}

function parseRequestBody(body: unknown): AdminRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid admin action is required.')
  }

  switch (body.action) {
    case 'list':
      return { action: 'list' }
    case 'set-disabled':
      if (typeof body.userId !== 'string' || typeof body.disabled !== 'boolean') {
        throw new RequestError('A valid user action payload is required.')
      }

      return {
        action: 'set-disabled',
        userId: body.userId,
        disabled: body.disabled,
      }
    case 'delete':
      if (typeof body.userId !== 'string') {
        throw new RequestError('A valid user action payload is required.')
      }

      return {
        action: 'delete',
        userId: body.userId,
      }
    default:
      throw new RequestError('Unsupported admin action.')
  }
}

async function requireAdmin(
  authorization: string,
  accessToken: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
  supabaseServiceRoleKey: string,
) {
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
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

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const {
    data: { user: caller },
    error: callerError,
  } = await authClient.auth.getUser(accessToken)

  if (callerError || !caller) {
    throw new RequestError('Authentication is required.', 401)
  }

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

async function listAllAuthUsers(serviceClient: ReturnType<typeof createClient>) {
  const authUsers = new Map<string, AuthUser>()
  const perPage = 200
  let page = 1

  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage })

    if (error) {
      console.error('Failed to list auth users', error)
      throw new RequestError('Unable to load portal users.', 500, false)
    }

    const currentPageUsers = data.users ?? []

    for (const authUser of currentPageUsers) {
      authUsers.set(authUser.id, authUser)
    }

    if (currentPageUsers.length < perPage) {
      break
    }

    page += 1
  }

  return authUsers
}

async function getTargetProfile(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceClient
    .from('users')
    .select('id, email, role, created_at, updated_at, name, phone')
    .eq('id', userId)
    .maybeSingle<PortalUserRow>()

  if (error) {
    console.error('Failed to resolve target user profile', error)
    throw new RequestError('Unable to load the requested user.', 500, false)
  }

  if (!data) {
    throw new RequestError('The requested user was not found.', 404)
  }

  if (normalizeRole(data.role) === 'admin') {
    throw new RequestError('Portal admins cannot be disabled or deleted from this screen.', 409)
  }

  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization')
    const accessToken = getBearerToken(authorization)
    const body = parseRequestBody(await req.json())

    const supabaseUrl = getRequiredEnv('SUPABASE_URL')
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

    const { caller, serviceClient } = await requireAdmin(
      authorization!,
      accessToken,
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
    )

    if (body.action === 'list') {
      const [authUsersById, { data: profiles, error: profileError }] = await Promise.all([
        listAllAuthUsers(serviceClient),
        serviceClient
          .from('users')
          .select('id, email, role, created_at, updated_at, name, phone')
          .order('created_at', { ascending: false }),
      ])

      if (profileError) {
        console.error('Failed to load portal user profiles', profileError)
        throw new RequestError('Unable to load portal users.', 500, false)
      }

      const users = (profiles ?? []).map((profile) =>
        serializePortalUser(profile as PortalUserRow, authUsersById.get(profile.id)),
      )

      return jsonResponse({ users })
    }

    if (body.userId === caller.id) {
      throw new RequestError('You cannot modify your own account from this screen.', 409)
    }

    const targetProfile = await getTargetProfile(serviceClient, body.userId)

    if (body.action === 'set-disabled') {
      const { data, error } = await serviceClient.auth.admin.updateUserById(body.userId, {
        ban_duration: body.disabled ? DISABLE_DURATION : 'none',
      })

      if (error) {
        console.error('Failed to update auth user status', error)
        throw new RequestError('Unable to update the user account.', 500, false)
      }

      return jsonResponse({
        message: body.disabled ? 'User account disabled.' : 'User account re-enabled.',
        user: serializePortalUser(targetProfile, data.user),
      })
    }

    const { error } = await serviceClient.auth.admin.deleteUser(body.userId, false)

    if (error) {
      console.error('Failed to delete auth user', error)
      throw new RequestError('Unable to delete the user account.', 500, false)
    }

    return jsonResponse({
      message: `User account for ${targetProfile.email ?? 'the selected user'} was deleted.`,
    })
  } catch (error) {
    const requestError = error instanceof RequestError ? error : null

    if (!requestError) {
      console.error('Unhandled admin-portal-users error', error)
    }

    return jsonResponse(
      {
        error: requestError?.expose ? requestError.message : 'Unable to complete the admin user request.',
      },
      requestError?.status ?? 500,
    )
  }
})