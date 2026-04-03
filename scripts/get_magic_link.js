const https = require('https');

const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const projId = process.env.SUPABASE_PROJECT_REF;
const email = process.env.SUPABASE_TEST_EMAIL || 'prakashgarg91@gmail.com';
const redirectTo = process.env.MAGIC_LINK_REDIRECT_TO || 'https://www.truckopti.in/';

if (!PAT || !projId) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

const body = JSON.stringify({
  email,
  type: 'magiclink',
  options: { 
    redirect_to: redirectTo
  }
});

const opts = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projId}/auth/magiclink`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PAT}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(opts, (res) => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => {
    try {
      const data = JSON.parse(b);
      if (data.hashed_token) {
        const link = `https://${projId}.supabase.co/auth/v1/verify?token=${data.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;
        console.log('MAGIC LINK:', link);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    } catch(e) {
      console.log('Response:', b);
    }
  });
});

req.on('error', e => console.error('ERROR:', e.message));
req.write(body);
req.end();
