import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertAgencyApprovedForPortal } from '../_shared/portal-auth.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type FleetRequest =
    | { action: 'list' }
    | { action: 'add-truck'; rc_number: string; vehicle_type: string; insurance_expiry?: string; fitness_expiry?: string; permit_expiry?: string }
    | { action: 'update-truck'; truckId: string; data: Record<string, unknown> }

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

function parseRequestBody(body: unknown): FleetRequest {
    if (!isRecord(body) || typeof body.action !== 'string') {
        throw new RequestError('A valid action is required.')
    }

    switch (body.action) {
        case 'list':
            return { action: 'list' }
        case 'add-truck':
            if (typeof body.rc_number !== 'string' || typeof body.vehicle_type !== 'string') {
                throw new RequestError('rc_number and vehicle_type are required.')
            }
            return {
                action: 'add-truck',
                rc_number: body.rc_number,
                vehicle_type: body.vehicle_type,
                insurance_expiry: body.insurance_expiry as string | undefined,
                fitness_expiry: body.fitness_expiry as string | undefined,
                permit_expiry: body.permit_expiry as string | undefined,
            }
        case 'update-truck':
            if (typeof body.truckId !== 'string' || !isRecord(body.data)) {
                throw new RequestError('truckId and data are required.')
            }
            return {
                action: 'update-truck',
                truckId: body.truckId,
                data: body.data,
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
            const { data: trucks, error } = await authClient
                .from('agency_trucks')
                .select('*')
                .eq('agency_id', agencyId)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Failed to fetch trucks', error)
                throw new RequestError('Unable to fetch trucks.', 500, false)
            }

            return jsonResponse({ trucks: trucks ?? [] })
        }

        if (body.action === 'add-truck') {
            const { data: newTruck, error } = await authClient
                .from('agency_trucks')
                .insert({
                    agency_id: agencyId,
                    rc_number: body.rc_number,
                    vehicle_type: body.vehicle_type,
                    insurance_expiry: body.insurance_expiry,
                    fitness_expiry: body.fitness_expiry,
                    permit_expiry: body.permit_expiry,
                })
                .select()
                .single()

            if (error) {
                console.error('Failed to add truck', error)
                throw new RequestError('Unable to add truck.', 500, false)
            }

            return jsonResponse({ truck: newTruck, message: 'Truck added successfully.' })
        }

        if (body.action === 'update-truck') {
            const { data: truck, error: fetchError } = await authClient
                .from('agency_trucks')
                .select('id, agency_id')
                .eq('id', body.truckId)
                .maybeSingle()

            if (fetchError || !truck) {
                throw new RequestError('Truck not found.', 404)
            }

            if (truck.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { error } = await authClient
                .from('agency_trucks')
                .update(body.data)
                .eq('id', body.truckId)

            if (error) {
                console.error('Failed to update truck', error)
                throw new RequestError('Unable to update truck.', 500, false)
            }

            return jsonResponse({ message: 'Truck updated.' })
        }

        throw new RequestError('Invalid request.', 400)
    } catch (error) {
        const requestError = error instanceof RequestError ? error : null

        if (!requestError) {
            console.error('Unhandled agency-portal-fleet error', error)
        }

        return jsonResponse(
            {
                error: requestError?.expose ? requestError.message : 'Unable to complete the request.',
            },
            requestError?.status ?? 500,
        )
    }
})
