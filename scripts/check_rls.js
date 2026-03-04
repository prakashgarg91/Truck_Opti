const https = require('https');
const PAT = 'sbp_53c56615cd7a5cfbc6406f9a8c72421c91ab3903';
const projId = 'jbxncejtcbpcronndqlx';

const query = `SELECT tablename, policyname, cmd, qual, with_check 
  FROM pg_policies 
  WHERE tablename IN ('trucks','cartons','customers','sale_orders','shipments')
  ORDER BY tablename, policyname`;

const body = JSON.stringify({ query });

const opts = {
  hostname: 'api.supabase.com',
  path: '/v1/projects/' + projId + '/database/query',
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer ' + PAT, 
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};
const req = https.request(opts, (res) => {
  let b = ''; res.on('data', d => b += d); 
  res.on('end', () => {
    try {
      const rows = JSON.parse(b);
      if (Array.isArray(rows)) {
        rows.forEach(r => console.log(`${r.tablename} | ${r.policyname} | ${r.cmd} | USING: ${r.qual} | WITH CHECK: ${r.with_check}`));
      } else {
        console.log(b.substring(0, 2000));
      }
    } catch(e) { console.log(b.substring(0, 2000)); }
  });
});
req.on('error', e => console.log('ERROR:', e.message));
req.write(body);
req.end();
