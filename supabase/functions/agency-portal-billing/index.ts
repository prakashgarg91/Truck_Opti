import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BillingRequest = { action: 'list' }

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

function parseRequestBody(body: unknown): BillingRequest {
    if (!isRecord(body) || typeof body.action !== 'string') {
        throw new RequestError('A valid action is required.')
    }

    if (body.action === 'list') {
        return { action: 'list' }
    }

    throw new RequestError('Unsupported action.')
}

async function getAgencyId(
    client: ReturnType<typeof createClient>,
    userId: string,
) {
    const { data, error } = await client
        .from('transport_agencies')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle<{ id: string }>()

    if (error) {
        console.error('Failed to resolve agency', error)
        throw new RequestError('Unable to resolve agency.', 500, false)
    }

    if (!data) {
        throw new RequestError('Agency not found.', 404)
    }

    return data.id
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authorization = req.headers.get('Authorization')
        const accessToken = getBearerToken(authorization)

        const supabaseUrl = getRequiredEnv('SUPABASE_URL')
        const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')

        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
            global: {
                headers: {
                    Authorization: authorization!,
                },
            },
        })

        const { data: { user: caller }, error: authError } = await authClient.auth.getUser(accessToken)

        if (authError || !caller) {
            throw new RequestError('Authentication is required.', 401)
        }

        const agencyId = await getAgencyId(authClient, caller.id)

        const body = req.method === 'GET' ? { action: 'list' } : parseRequestBody(await req.json())

        if (body.action === 'list') {
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

            const [monthRes, pendingRes, paidRes, deliveredRes] = await Promise.all([
                authClient
                    .from('agency_jobs')
                    .select('fare')
                    .eq('agency_id', agencyId)
                    .eq('status', 'delivered')
                    .gte('updated_at', monthStart),
                authClient
                    .from('agency_jobs')
                    .select('fare')
                    .eq('agency_id', agencyId)
                    .in('status', ['accepted', 'in_transit']),
                authClient
                    .from('agency_jobs')
                    .select('fare')
                    .eq('agency_id', agencyId)
                    .eq('status', 'delivered'),
                authClient
                    .from('agency_jobs')
                    .select('id, fare, updated_at, shipments(origin, destination, shipment_id)')
                    .eq('agency_id', agencyId)
                    .eq('status', 'delivered')
                    .order('updated_at', { ascending: false }),
            ])

            const billingError = monthRes.error || pendingRes.error || paidRes.error || deliveredRes.error
            if (billingError) {
                console.error('Failed to fetch billing data', billingError)
                throw new RequestError('Unable to fetch billing data.', 500, false)
            }

            const sum = (rows: { fare: number | null }[] | null) =>
                (rows ?? []).reduce((a, r) => a + (r.fare ?? 0), 0)

            const thisMonth = sum(monthRes.data)
            const pending = sum(pendingRes.data)
            const totalPaid = sum(paidRes.data)
            const gstDue = Math.round(thisMonth * 0.05) // 5% GST

            const jobs = (deliveredRes.data ?? []).map((j: Record<string, unknown>) => {
                const s = (Array.isArray(j.shipments) ? j.shipments[0] : j.shipments) as Record<string, unknown> | null
                return {
                    id: j.id,
                    fare: Number(j.fare ?? 0),
                    origin: s?.origin ?? '—',
                    destination: s?.destination ?? '—',
                    updated_at: j.updated_at,
                    shipment_id: s?.shipment_id ?? '',
                }
            })

            return jsonResponse({
                summary: {
                    thisMonth,
                    pending,
                    totalPaid,
                    gstDue,
                },
                jobs,
            })
        }

        throw new RequestError('Invalid request.', 400)
    } catch (error) {
        const requestError = error instanceof RequestError ? error : null

        if (!requestError) {
            console.error('Unhandled agency-portal-billing error', error)
        }

        return jsonResponse(
            {
                error: requestError?.expose ? requestError.message : 'Unable to complete the request.',
            },
            requestError?.status ?? 500,
        )
    }
})
