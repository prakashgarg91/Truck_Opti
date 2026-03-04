const https = require('https');

// Generate a magic link for the user using Supabase admin API
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzgwOTYyMiwiZXhwIjoyMDgzMzg1NjIyfQ.R7Jq0rMPklDfG49GiS6jfuBqaWD7J3BtsDCUhzcyw9c';

const payload = JSON.stringify({
  email: 'prakashgarg91@gmail.com',
  type: 'magiclink',
});

const req = https.request({
  hostname: 'jbxncejtcbpcronndqlx.supabase.co',
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
