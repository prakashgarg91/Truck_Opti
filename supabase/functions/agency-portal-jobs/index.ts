import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type JobRequest =
    | { action: 'list' }
    | { action: 'update-status'; jobId: string; status: string }
    | { action: 'assign-driver'; jobId: string; driverId: string }

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

function parseRequestBody(body: unknown): JobRequest {
    if (!isRecord(body) || typeof body.action !== 'string') {
        throw new RequestError('A valid action is required.')
    }

    switch (body.action) {
        case 'list':
            return { action: 'list' }
        case 'update-status':
            if (typeof body.jobId !== 'string' || typeof body.status !== 'string') {
                throw new RequestError('jobId and status are required.')
            }
            return {
                action: 'update-status',
                jobId: body.jobId,
                status: body.status,
            }
        case 'assign-driver':
            if (typeof body.jobId !== 'string' || typeof body.driverId !== 'string') {
                throw new RequestError('jobId and driverId are required.')
            }
            return {
                action: 'assign-driver',
                jobId: body.jobId,
                driverId: body.driverId,
            }
        default:
            throw new RequestError('Unsupported action.')
    }
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
            const { data: jobs, error } = await authClient
                .from('agency_jobs')
                .select(`
          id,
          shipment_id,
          status,
          fare,
          driver_id,
          created_at,
          updated_at,
          shipments (
            shipment_id,
            origin,
            destination,
            total_weight,
            estimated_cost
          )
        `)
                .eq('agency_id', agencyId)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Failed to fetch jobs', error)
                throw new RequestError('Unable to fetch jobs.', 500, false)
            }

            return jsonResponse({ jobs: jobs ?? [] })
        }

        if (body.action === 'update-status') {
            const { data: job, error: fetchError } = await authClient
                .from('agency_jobs')
                .select('id, agency_id')
                .eq('id', body.jobId)
                .maybeSingle()

            if (fetchError || !job) {
                throw new RequestError('Job not found.', 404)
            }

            if (job.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { error } = await authClient
                .from('agency_jobs')
                .update({ status: body.status })
                .eq('id', body.jobId)

            if (error) {
                console.error('Failed to update job status', error)
                throw new RequestError('Unable to update job.', 500, false)
            }

            return jsonResponse({ message: 'Job status updated.' })
        }

        if (body.action === 'assign-driver') {
            const { data: job, error: fetchError } = await authClient
                .from('agency_jobs')
                .select('id, agency_id')
                .eq('id', body.jobId)
                .maybeSingle()

            if (fetchError || !job) {
                throw new RequestError('Job not found.', 404)
            }

            if (job.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { error } = await authClient
                .from('agency_jobs')
                .update({ driver_id: body.driverId })
                .eq('id', body.jobId)

            if (error) {
                console.error('Failed to assign driver', error)
                throw new RequestError('Unable to assign driver.', 500, false)
            }

            return jsonResponse({ message: 'Driver assigned.' })
        }

        throw new RequestError('Invalid request.', 400)
    } catch (error) {
        const requestError = error instanceof RequestError ? error : null

        if (!requestError) {
            console.error('Unhandled agency-portal-jobs error', error)
        }

        return jsonResponse(
            {
                error: requestError?.expose ? requestError.message : 'Unable to complete the request.',
            },
            requestError?.status ?? 500,
        )
    }
})
