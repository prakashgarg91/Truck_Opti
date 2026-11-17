import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  interpretReopenResult,
  parseAdminRequest,
  reopenableSubscriptionIds,
  shapeRefundException,
  shapeRefusal,
  shapeSubscription,
  type AgencyInfo,
  type AdminAction,
  type RefundExceptionRowInput,
  type RefusalRowInput,
  type SubscriptionRowInput,
} from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function parseRequestBody(body: unknown): AdminAction {
  const parsed = parseAdminRequest(body)

  if ('error' in parsed) {
    throw new RequestError(parsed.error)
  }

  return parsed
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

async function loadAgencies(serviceClient: SupabaseClient, agencyIds: string[]) {
  if (agencyIds.length === 0) {
    return new Map<string, AgencyInfo>()
  }

  const { data, error } = await serviceClient
    .from('transport_agencies')
    .select('id, company_name, gstin, status')
    .in('id', agencyIds)

  if (error) {
    console.error('Failed to load subscription agencies', error)
    throw new RequestError('Unable to load subscriptions.', 500, false)
  }

  return new Map((data ?? []).map((agency) => [agency.id as string, agency as AgencyInfo]))
}

async function listSubscriptions(serviceClient: SupabaseClient) {
  const { data: subscriptions, error: subscriptionsError } = await serviceClient
    .from('subscriptions')
    .select('id, agency_id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end, first_paid_at, cancel_at_period_end, created_at')
    .order('created_at', { ascending: false })

  if (subscriptionsError) {
    console.error('Failed to load subscriptions', subscriptionsError)
    throw new RequestError('Unable to load subscriptions.', 500, false)
  }

  const rows = (subscriptions ?? []) as SubscriptionRowInput[]
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))))
  const planIds = Array.from(new Set(rows.map((row) => row.plan_id).filter(Boolean)))
  const agencyIds = Array.from(new Set(rows.map((row) => row.agency_id).filter((id): id is string => Boolean(id))))

  // Ops attention: captured payments the system refused (payment_history.metadata.refusal) and refunds Razorpay
  // already processed that could not be credit-noted (subscription_refund_exceptions, append-only).
  const [profilesById, plansById, agenciesById, refusals, refundExceptions] = await Promise.all([
    loadUserProfiles(serviceClient, userIds),
    loadSubscriptionPlans(serviceClient, planIds),
    loadAgencies(serviceClient, agencyIds),
    serviceClient
      .from('payment_history')
      .select('id, agency_id, subscription_id, amount, status, razorpay_order_id, razorpay_payment_id, error_message, metadata, created_at')
      .not('metadata->>refusal', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),
    serviceClient
      .from('subscription_refund_exceptions')
      .select('id, refund_id, payment_id, agency_id, amount_paise, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (refusals.error || refundExceptions.error) {
    console.error('Failed to load ops attention', refusals.error ?? refundExceptions.error)
    throw new RequestError('Unable to load subscriptions.', 500, false)
  }

  const reopenable = reopenableSubscriptionIds(rows)

  return {
    subscriptions: rows.map((row) =>
      shapeSubscription(
        row,
        row.agency_id ? agenciesById.get(row.agency_id) ?? null : null,
        row.user_id ? profilesById.get(row.user_id) ?? null : null,
        plansById.get(row.plan_id) ?? null,
        reopenable,
      )
    ),
    ops_attention: {
      refused_payments: ((refusals.data ?? []) as RefusalRowInput[])
        .map(shapeRefusal)
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      refund_exceptions: ((refundExceptions.data ?? []) as RefundExceptionRowInput[]).map(shapeRefundException),
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization')
    const accessToken = getBearerToken(authorization)
    const request = parseRequestBody(await req.json())

    const supabaseUrl = getRequiredEnv('SUPABASE_URL')
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

    // Admin only, for both actions. No free-form status write exists here: the DB status machine owns transitions.
    const serviceClient = await requireAdmin(
      authorization!,
      accessToken,
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
    )

    if (request.action === 'reopen') {
      const { data, error } = await serviceClient.rpc('subscription_support_reopen', { p_agency_id: request.agencyId })

      if (error) {
        console.error('subscription_support_reopen failed', error)
        throw new RequestError('Unable to reopen the subscription.', 500, false)
      }

      const outcome = interpretReopenResult(data)

      if (!outcome.ok) {
        throw new RequestError(outcome.message, outcome.status)
      }

      return jsonResponse({ ok: true, subscription_id: outcome.subscriptionId, status: 'expired' })
    }

    return jsonResponse(await listSubscriptions(serviceClient))
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
