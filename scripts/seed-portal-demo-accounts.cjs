const { createClient } = require('@supabase/supabase-js')
const { readEnvValue, validateRequiredEnv } = require('./_proofEnv.cjs')

const SUPABASE_URL = readEnvValue('SUPABASE_URL', ['VITE_SUPABASE_URL'])
const SUPABASE_SERVICE_ROLE_KEY = readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
const SEED_DEMO_PASSWORD = readEnvValue('SEED_DEMO_PASSWORD')
const RAZORPAY_REVIEW_DEMO_PASSWORD = readEnvValue('RAZORPAY_REVIEW_DEMO_PASSWORD')

if (!validateRequiredEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])) {
    process.exit(1)
}

if (!SEED_DEMO_PASSWORD && !RAZORPAY_REVIEW_DEMO_PASSWORD) {
    console.error('Seeding requires SEED_DEMO_PASSWORD for the shared demo accounts or RAZORPAY_REVIEW_DEMO_PASSWORD for the isolated reviewer account.')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const accounts = [
    {
        key: 'driver',
        email: 'demo.driver@truckopti.in',
        name: 'TruckOpti Demo Driver',
        publicRole: 'driver',
        authMetadataRole: 'driver',
        profile: {
            table: 'drivers',
            match: { column: 'phone', value: '9999999991' },
            payload: {
                full_name: 'TruckOpti Demo Driver',
                phone: '9999999991',
                pan_number: 'ABCDE1234F',
                home_city: 'Delhi',
                vehicle_type: 'eicher_14ft',
                rc_number: 'DL01AB1234',
                license_number: 'DL1420260000011',
                bank_account: '123456789012',
                ifsc_code: 'SBIN0001234',
                upi_id: 'demo.driver@upi',
                status: 'approved',
            },
        },
    },
    {
        key: 'agency',
        email: 'demo.agency@truckopti.in',
        name: 'TruckOpti Demo Agency',
        publicRole: 'user',
        authMetadataRole: 'user',
        profile: {
            table: 'transport_agencies',
            match: { column: 'contact_email', value: 'demo.agency@truckopti.in' },
            payload: {
                company_name: 'TruckOpti Demo Logistics Pvt Ltd',
                gstin: '07ABCDE1234G1Z5',
                pan_number: 'ABCDE1234G',
                transport_license: 'TR-2026-DEMO-001',
                contact_name: 'TruckOpti Demo Agency',
                contact_phone: '9999999992',
                contact_email: 'demo.agency@truckopti.in',
                address: '1 Demo Logistics Park',
                city: 'Delhi',
                state: 'Delhi',
                pincode: '110001',
                fleet_size: 3,
                operating_routes: 'Delhi, Jaipur, Chandigarh',
                status: 'approved',
            },
        },
    },
    {
        key: 'customer',
        email: 'demo.customer@truckopti.in',
        name: 'TruckOpti Demo Customer',
        publicRole: 'user',
        authMetadataRole: 'user',
    },
    {
        key: 'razorpay',
        email: 'demo.razorpay@truckopti.in',
        name: 'TruckOpti Razorpay Review',
        publicRole: 'user',
        authMetadataRole: 'user',
        passwordOverride: RAZORPAY_REVIEW_DEMO_PASSWORD,
    },
    {
        key: 'admin',
        email: 'demo.admin@truckopti.in',
        name: 'TruckOpti Demo Admin',
        publicRole: 'admin',
        authMetadataRole: 'admin',
        // No profile table — resolveAppRole() reads users.role = 'admin' directly
    },
]

const accountsToSeed = accounts.filter((account) => Boolean(account.passwordOverride || SEED_DEMO_PASSWORD))

async function listAllUsers() {
    const users = []
    let page = 1

    while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
        if (error) throw error

        users.push(...data.users)
        if (data.users.length < 200) return users
        page += 1
    }
}

async function ensureAuthUser(account) {
    const accountPassword = account.passwordOverride || SEED_DEMO_PASSWORD
    const users = await listAllUsers()
    const existing = users.find((user) => user.email?.toLowerCase() === account.email.toLowerCase())

    if (existing) {
        const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
            password: accountPassword,
            user_metadata: {
                ...(existing.user_metadata || {}),
                full_name: account.name,
                name: account.name,
                role: account.authMetadataRole,
            },
        })

        if (error) throw error
        return data.user
    }

    const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password: accountPassword,
        email_confirm: true,
        user_metadata: {
            full_name: account.name,
            name: account.name,
            role: account.authMetadataRole,
        },
    })

    if (error) throw error
    return data.user
}

async function ensurePublicUser(account, userId) {
    const { error } = await supabase.from('users').upsert({
        id: userId,
        email: account.email,
        name: account.name,
        role: account.publicRole,
        phone_verified: false,
        google_linked: false,
    }, { onConflict: 'id' })

    if (error) throw error

    const { data, error: selectError } = await supabase
        .from('users')
        .select('id, email, role, login_id')
        .eq('id', userId)
        .single()

    if (selectError) throw selectError
    return data
}

async function ensureProfile(account, userId) {
    if (!account.profile) return null

    const { table, match, payload } = account.profile
    const basePayload = { ...payload, user_id: userId }

    const { data: existingByUser, error: existingByUserError } = await supabase
        .from(table)
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

    if (existingByUserError) throw existingByUserError

    if (existingByUser?.id) {
        const { data, error } = await supabase
            .from(table)
            .update(basePayload)
            .eq('id', existingByUser.id)
            .select('id, user_id, status')
            .single()

        if (error) throw error
        return data
    }

    const { data: existingMatch, error: existingMatchError } = await supabase
        .from(table)
        .select('id')
        .eq(match.column, match.value)
        .maybeSingle()

    if (existingMatchError) throw existingMatchError

    if (existingMatch?.id) {
        const { data, error } = await supabase
            .from(table)
            .update(basePayload)
            .eq('id', existingMatch.id)
            .select('id, user_id, status')
            .single()

        if (error) throw error
        return data
    }

    const { data, error } = await supabase
        .from(table)
        .insert(basePayload)
        .select('id, user_id, status')
        .single()

    if (error) throw error
    return data
}

async function main() {
    const summary = []

    for (const account of accountsToSeed) {
        const authUser = await ensureAuthUser(account)
        const publicUser = await ensurePublicUser(account, authUser.id)
        const profile = await ensureProfile(account, authUser.id)

        summary.push({
            key: account.key,
            email: account.email,
            userId: authUser.id,
            loginId: publicUser.login_id,
            role: publicUser.role,
            profileTable: account.profile?.table || null,
            profileId: profile?.id || null,
            profileStatus: profile?.status || null,
        })
    }

    if (summary.length === 0) {
        throw new Error('No demo accounts were eligible for seeding with the current environment contract')
    }

    console.table(summary)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})