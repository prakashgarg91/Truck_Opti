// Check what is affecting the role in the users table
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

async function main() {
  console.log('=== Current role ===')
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, role, updated_at')
    .eq('email', 'prakashgarg91@gmail.com')
    .single()
  console.log(user, userError)

  // Try to upsert WITHOUT role and check if role changes
  console.log('\n=== Setting role to admin first ===')
  const { error: setError } = await supabase
    .from('users')
    .update({ role: 'admin' })
    .eq('email', 'prakashgarg91@gmail.com')
  console.log('Set admin error:', setError)

  console.log('\n=== Verify admin is set ===')
  const { data: before } = await supabase.from('users').select('role').eq('email', 'prakashgarg91@gmail.com').single()
  console.log('Before upsert:', before)

  // Now simulate the upsert WITHOUT role
  console.log('\n=== Simulating syncUserProfile upsert (no role) ===')
  const upsertData = {
    id: '21ca4a54-d274-4736-bc2c-46a87724c71a',
    email: 'prakashgarg91@gmail.com',
    name: 'Prakash Gupta',
    phone: null,
    phone_verified: false,
    google_linked: false,
    profile_picture: null,
  }
  const { error: upsertError } = await supabase
    .from('users')
    .upsert(upsertData, { onConflict: 'id', ignoreDuplicates: false })
  console.log('Upsert error:', upsertError)

  console.log('\n=== Role AFTER upsert (should still be admin) ===')
  const { data: after } = await supabase.from('users').select('role').eq('email', 'prakashgarg91@gmail.com').single()
  console.log('After upsert:', after)
}

main().catch(console.error)
