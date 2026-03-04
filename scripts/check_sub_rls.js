const https = require('https');
const PAT = 'sbp_53c56615cd7a5cfbc6406f9a8c72421c91ab3903';
const projId = 'jbxncejtcbpcronndqlx';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzgwOTYyMiwiZXhwIjoyMDgzMzg1NjIyfQ.R7Jq0rMPklDfG49GiS6jfuBqaWD7J3BtsDCUhzcyw9c';

const query = `
SELECT tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('users', 'subscriptions', 'subscription_plans', 'usage_tracking')
ORDER BY tablename, policyname;
`;

const body = JSON.stringify({ query });

const opts = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projId}/database/query`,
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${PAT}`, 
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
        if (rows.length === 0) {
          console.log('No RLS policies found for subscriptions tables! RLS might be disabled or no policies set.');
        }
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
