const https = require('https');

const sql = "UPDATE public.users SET role = 'admin' WHERE email = 'prakashgarg91@gmail.com'; SELECT email, role FROM public.users WHERE email = 'prakashgarg91@gmail.com';";
const payload = JSON.stringify({query: sql});

const req = https.request({
  hostname: 'api.supabase.com',
  path: '/v1/projects/jbxncejtcbpcronndqlx/database/query',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sbp_53c56615cd7a5cfbc6406f9a8c72421c91ab3903',
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
