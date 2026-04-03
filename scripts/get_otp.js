const https = require('https');

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = process.env.SUPABASE_PROJECT_REF;
const email = process.env.SUPABASE_TEST_EMAIL || 'prakashgarg91@gmail.com';

if (!serviceKey || !projectRef) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PROJECT_REF');
  process.exit(1);
}

const payload = JSON.stringify({
  email,
  type: 'magiclink',
});

const req = https.request({
  hostname: `${projectRef}.supabase.co`,
  path: '/auth/v1/admin/generate_link',
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const parsed = JSON.parse(d);
    if (parsed.action_link) {
      console.log('Magic Link:', parsed.action_link);
    } else {
      console.log('Full response:', JSON.stringify(parsed, null, 2));
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(payload);
req.end();
