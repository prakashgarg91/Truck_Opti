const PLAN_TIERS = new Set(['starter', 'growth', 'professional', 'enterprise'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ResolvedSubscriptionPlan {
    id: string
    tier: string
    price_monthly: number
    price_yearly: number
}

interface PlanLookupError {
    code?: string
    message: string
}

interface PlanLookupResult {
    data: ResolvedSubscriptionPlan | null
    error: PlanLookupError | null
}

interface PlanLookupClient {
    from(table: 'subscription_plans'): {
        select(columns: string): {
            eq(column: 'id' | 'tier', value: string): {
                maybeSingle(): Promise<PlanLookupResult>
            }
        }
    }
}

function normalizePlanIdentifier(value: string) {
    return value.trim().toLowerCase()
}

function isPlanTier(value: string) {
    return PLAN_TIERS.has(normalizePlanIdentifier(value))
}

function isUuid(value: string) {
    return UUID_PATTERN.test(value)
}

async function fetchPlanByColumn(
    supabase: PlanLookupClient,
    column: 'id' | 'tier',
    value: string
) {
    const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, tier, price_monthly, price_yearly')
        .eq(column, value)
        .maybeSingle()

    if (error) {
        console.error(`[resolveSubscriptionPlanByIdentifier] Failed plan lookup by ${column}:`, error)
        return null
    }

    return data
}

export async function resolveSubscriptionPlanByIdentifier(
    supabase: PlanLookupClient,
    planIdentifier: string
) {
    if (isPlanTier(planIdentifier)) {
        return fetchPlanByColumn(supabase, 'tier', normalizePlanIdentifier(planIdentifier))
    }

    if (isUuid(planIdentifier)) {
        return fetchPlanByColumn(supabase, 'id', planIdentifier)
    }

    return null
}