import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertAgencyApprovedForPortal } from '../_shared/portal-auth.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RatesRequest =
    | { action: 'list' }
    | { action: 'add-rate'; vehicle_type: string; origin_city: string; dest_city: string; rate_per_km?: number; flat_rate?: number; min_weight_kg?: number; max_weight_kg?: number; valid_until?: string; notes?: string }
    | { action: 'update-rate'; rateId: string; data: Record<string, unknown> }
    | { action: 'delete-rate'; rateId: string }

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

function parseRequestBody(body: unknown): RatesRequest {
    if (!isRecord(body) || typeof body.action !== 'string') {
        throw new RequestError('A valid action is required.')
    }

    switch (body.action) {
        case 'list':
            return { action: 'list' }
        case 'add-rate':
            if (
                typeof body.vehicle_type !== 'string' ||
                typeof body.origin_city !== 'string' ||
                typeof body.dest_city !== 'string'
            ) {
                throw new RequestError('vehicle_type, origin_city, and dest_city are required.')
            }
            return {
                action: 'add-rate',
                vehicle_type: body.vehicle_type,
                origin_city: body.origin_city,
                dest_city: body.dest_city,
                rate_per_km: body.rate_per_km as number | undefined,
                flat_rate: body.flat_rate as number | undefined,
                min_weight_kg: body.min_weight_kg as number | undefined,
                max_weight_kg: body.max_weight_kg as number | undefined,
                valid_until: body.valid_until as string | undefined,
                notes: body.notes as string | undefined,
            }
        case 'update-rate':
            if (typeof body.rateId !== 'string' || !isRecord(body.data)) {
                throw new RequestError('rateId and data are required.')
            }
            return {
                action: 'update-rate',
                rateId: body.rateId,
                data: body.data,
            }
        case 'delete-rate':
            if (typeof body.rateId !== 'string') {
                throw new RequestError('rateId is required.')
            }
            return {
                action: 'delete-rate',
                rateId: body.rateId,
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
        .select('id, status')
        .eq('user_id', userId)
        .maybeSingle<{ id: string; status: string | null }>()

    if (error) {
        console.error('Failed to resolve agency', error)
        throw new RequestError('Unable to resolve agency.', 500, false)
    }

    if (!data) {
        throw new RequestError('Agency not found.', 404)
    }

    assertAgencyApprovedForPortal(data.status)

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
            const { data: rates, error } = await authClient
                .from('agency_rate_cards')
                .select('*')
                .eq('agency_id', agencyId)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Failed to fetch rates', error)
                throw new RequestError('Unable to fetch rates.', 500, false)
            }

            return jsonResponse({ rates: rates ?? [] })
        }

        if (body.action === 'add-rate') {
            const { data: newRate, error } = await authClient
                .from('agency_rate_cards')
                .insert({
                    agency_id: agencyId,
                    vehicle_type: body.vehicle_type,
                    origin_city: body.origin_city,
                    dest_city: body.dest_city,
                    rate_per_km: body.rate_per_km ?? null,
                    flat_rate: body.flat_rate ?? null,
                    min_weight_kg: body.min_weight_kg ?? null,
                    max_weight_kg: body.max_weight_kg ?? null,
                    valid_until: body.valid_until ?? null,
                    notes: body.notes ?? null,
                })
                .select()
                .single()

            if (error) {
                console.error('Failed to add rate', error)
                throw new RequestError('Unable to add rate.', 500, false)
            }

            return jsonResponse({ rate: newRate, message: 'Rate card added successfully.' })
        }

        if (body.action === 'update-rate') {
            const { data: rate, error: fetchError } = await authClient
                .from('agency_rate_cards')
                .select('id, agency_id')
                .eq('id', body.rateId)
                .maybeSingle()

            if (fetchError || !rate) {
                throw new RequestError('Rate card not found.', 404)
            }

            if (rate.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { error } = await authClient
                .from('agency_rate_cards')
                .update(body.data)
                .eq('id', body.rateId)

            if (error) {
                console.error('Failed to update rate', error)
                throw new RequestError('Unable to update rate.', 500, false)
            }

            return jsonResponse({ message: 'Rate card updated.' })
        }

        if (body.action === 'delete-rate') {
            const { data: rate, error: fetchError } = await authClient
                .from('agency_rate_cards')
                .select('id, agency_id')
                .eq('id', body.rateId)
                .maybeSingle()

            if (fetchError || !rate) {
                throw new RequestError('Rate card not found.', 404)
            }

            if (rate.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { error } = await authClient
                .from('agency_rate_cards')
                .delete()
                .eq('id', body.rateId)

            if (error) {
                console.error('Failed to delete rate', error)
                throw new RequestError('Unable to delete rate.', 500, false)
            }

            return jsonResponse({ message: 'Rate card deleted.' })
        }

        throw new RequestError('Invalid request.', 400)
    } catch (error) {
        const requestError = error instanceof RequestError ? error : null

        if (!requestError) {
            console.error('Unhandled agency-portal-rates error', error)
        }

        return jsonResponse(
            {
                error: requestError?.expose ? requestError.message : 'Unable to complete the request.',
            },
            requestError?.status ?? 500,
        )
    }
})
