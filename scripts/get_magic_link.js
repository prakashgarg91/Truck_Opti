const https = require('https');

const PAT = 'sbp_53c56615cd7a5cfbc6406f9a8c72421c91ab3903';
const projId = 'jbxncejtcbpcronndqlx';

const body = JSON.stringify({
  email: 'prakashgarg91@gmail.com',
  type: 'magiclink',
  options: { 
    redirect_to: 'https://truck-opti-app-efabf95bd306.herokuapp.com/' 
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
        const link = `https://${projId}.supabase.co/auth/v1/verify?token=${data.hashed_token}&type=magiclink&redirect_to=https://truck-opti-app-efabf95bd306.herokuapp.com/`;
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
