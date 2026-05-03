import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PortalSubscriptionRow = {
  id: string
  user_id: string
  plan_id: string
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'trial'
  billing_cycle: 'monthly' | 'yearly'
  current_period_start: string
  current_period_end: string
  trial_end: string | null
  cancel_at_period_end: boolean
  created_at: string
}

type PortalUserProfileRow = {
  id: string
  name: string | null
  email: string | null
}

type SubscriptionPlanRow = {
  id: string
  name: string
  tier: string
}

type AdminRequest = { action: 'list' }

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

function parseRequestBody(body: unknown): AdminRequest {
  if (!isRecord(body) || body.action !== 'list') {
    throw new RequestError('A valid admin action is required.')
  }

  return { action: 'list' }
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

  return serviceClient
}

async function loadUserProfiles(serviceClient: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, PortalUserProfileRow>()
  }

  const { data, error } = await serviceClient
    .from('users')
    .select('id, name, email')
    .in('id', userIds)

  if (error) {
    console.error('Failed to load subscription user profiles', error)
    throw new RequestError('Unable to load subscriptions.', 500, false)
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile as PortalUserProfileRow]))
}

async function loadSubscriptionPlans(serviceClient: SupabaseClient, planIds: string[]) {
  if (planIds.length === 0) {
    return new Map<string, SubscriptionPlanRow>()
  }

  const { data, error } = await serviceClient
    .from('subscription_plans')
    .select('id, name, tier')
    .in('id', planIds)

  if (error) {
    console.error('Failed to load subscription plans', error)
    throw new RequestError('Unable to load subscriptions.', 500, false)
  }

  return new Map((data ?? []).map((plan) => [plan.id, plan as SubscriptionPlanRow]))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization')
    const accessToken = getBearerToken(authorization)
    parseRequestBody(await req.json())

    const supabaseUrl = getRequiredEnv('SUPABASE_URL')
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

    const serviceClient = await requireAdmin(
      authorization!,
      accessToken,
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
    )

    const { data: subscriptions, error: subscriptionsError } = await serviceClient
      .from('subscriptions')
      .select('id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, cancel_at_period_end, created_at')
      .order('created_at', { ascending: false })

    if (subscriptionsError) {
      console.error('Failed to load subscriptions', subscriptionsError)
      throw new RequestError('Unable to load subscriptions.', 500, false)
    }

    const userIds = Array.from(new Set((subscriptions ?? []).map((subscription) => subscription.user_id).filter(Boolean)))
    const planIds = Array.from(new Set((subscriptions ?? []).map((subscription) => subscription.plan_id).filter(Boolean)))
    const [profilesById, plansById] = await Promise.all([
      loadUserProfiles(serviceClient, userIds),
      loadSubscriptionPlans(serviceClient, planIds),
    ])

    return jsonResponse({
      subscriptions: (subscriptions ?? []).map((subscription) => {
        const typedSubscription = subscription as PortalSubscriptionRow
        const user = profilesById.get(typedSubscription.user_id) ?? null
        const plan = plansById.get(typedSubscription.plan_id) ?? null

        return {
          id: typedSubscription.id,
          user_id: typedSubscription.user_id,
          status: typedSubscription.status,
          billing_cycle: typedSubscription.billing_cycle,
          current_period_start: typedSubscription.current_period_start,
          current_period_end: typedSubscription.current_period_end,
          trial_end: typedSubscription.trial_end,
          cancel_at_period_end: typedSubscription.cancel_at_period_end,
          created_at: typedSubscription.created_at,
          user: user
            ? {
              name: user.name,
              email: user.email,
            }
            : null,
          plan: plan
            ? {
              id: plan.id,
              name: plan.name,
              tier: plan.tier,
            }
            : null,
        }
      }),
    })
  } catch (error) {
    const requestError = error instanceof RequestError ? error : null

    if (!requestError) {
      console.error('Unhandled admin-portal-subscriptions error', error)
    }

    return jsonResponse(
      {
        error: requestError?.expose ? requestError.message : 'Unable to complete the admin subscription request.',
      },
      requestError?.status ?? 500,
    )
  }
})