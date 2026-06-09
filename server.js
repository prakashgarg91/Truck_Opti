// server.js — Production static server with Heroku→custom-domain redirect
// Redirects all traffic arriving at the Heroku URL to https://www.truckopti.in

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const HEROKU_HOST = 'truck-opti-app-efabf95bd306.herokuapp.com';
const CANONICAL = 'https://www.truckopti.in';
const DIST_DIR = path.join(__dirname, 'frontend', 'dist');

function setStaticCacheHeaders(res, filePath) {
  const relativePath = path.relative(DIST_DIR, filePath).replace(/\\/g, '/');

  if (/^sw(?:-[a-z0-9-]+)?\.js$/i.test(relativePath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    return;
  }

  if (relativePath === 'manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return;
  }

  if (relativePath.startsWith('assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
}

// ── 1. Force canonical domain ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  if (host === HEROKU_HOST) {
    return res.redirect(301, CANONICAL + req.originalUrl);
  }
  next();
});

// ── 2. Serve static assets ────────────────────────────────────────────────────
app.use(express.static(DIST_DIR, {
  etag: true,
  index: false,          // we handle index.html manually below (SPA fallback)
  setHeaders: setStaticCacheHeaders,
}));

// ── 3. SPA fallback — serve index.html for all unmatched routes ───────────────
// Express 5 requires a named wildcard instead of the legacy "*" token.
app.get('/{*splat}', (req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send('App not built. Run npm run build.');
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`TruckOpti server running on port ${PORT}`);
  console.log(`Heroku URL (${HEROKU_HOST}) → 301 redirect to ${CANONICAL}`);
});
