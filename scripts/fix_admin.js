const https = require('https');

const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const sql = "UPDATE public.users SET role = 'admin' WHERE email = 'prakashgarg91@gmail.com'; SELECT email, role FROM public.users WHERE email = 'prakashgarg91@gmail.com';";
const payload = JSON.stringify({query: sql});

const req = https.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log('Result:', d));
});

req.on('error', e => console.error('Error:', e.message));
req.write(payload);
req.end();
