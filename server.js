// server.js — Production static server with canonical-domain redirect
// The Heroku default hostname and the bare apex truckopti.in 301 to
// https://www.truckopti.in; only the canonical www host serves the app.

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// HEROKU_ORIGIN_HOST overrides the default when the app is ever recreated;
// the default must track the hostname returned by `heroku domains`.
const HEROKU_HOST = (process.env.HEROKU_ORIGIN_HOST || 'truck-opti-app-0de4b9bc1ac2.herokuapp.com').toLowerCase();
const APEX_HOST = 'truckopti.in';
const CANONICAL_HOST = 'www.truckopti.in';
const CANONICAL = `https://${CANONICAL_HOST}`;
const DIST_DIR = path.join(__dirname, 'frontend', 'dist');
const INDEX_PATH = path.join(DIST_DIR, 'index.html');

// x-forwarded-host can be a comma list and may carry a port or trailing dots;
// canonicalize to a bare lowercase hostname so comparisons ignore those.
function normalizeHost(rawHost) {
  const first = String(rawHost || '').split(',')[0].trim();
  return first.toLowerCase().replace(/\.+$/, '').replace(/:\d+$/, '');
}

function isRedirectHost(host) {
  return host === HEROKU_HOST || host === APEX_HOST;
}

function setProbeHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

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

// ── 1. Host-independent platform probes ───────────────────────────────────────
// These must remain before canonical-host redirects so Heroku/load balancer
// health checks get an unambiguous status rather than a 301 response.
app.get('/healthz', (_req, res) => {
  setProbeHeaders(res);
  res.status(200).send(JSON.stringify({ status: 'ok' }));
});

app.get('/readyz', (_req, res) => {
  setProbeHeaders(res);
  if (!fs.existsSync(INDEX_PATH)) {
    return res.status(503).send(JSON.stringify({ status: 'not_ready' }));
  }
  return res.status(200).send(JSON.stringify({ status: 'ready' }));
});

// ── 2. Force canonical domain ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const host = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  if (isRedirectHost(host)) {
    return res.redirect(301, CANONICAL + req.originalUrl);
  }
  next();
});

// ── 3. Serve static assets ────────────────────────────────────────────────────
app.use(express.static(DIST_DIR, {
  etag: true,
  index: false,          // we handle index.html manually below (SPA fallback)
  setHeaders: setStaticCacheHeaders,
}));

// ── 4. SPA fallback — serve index.html for all unmatched routes ───────────────
// Express 5 requires a named wildcard instead of the legacy "*" token.
app.get('/{*splat}', (req, res) => {
  if (!fs.existsSync(INDEX_PATH)) {
    return res.status(503).send('App not built. Run npm run build.');
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(INDEX_PATH);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TruckOpti server running on port ${PORT}`);
    console.log(`Non-canonical hosts (${HEROKU_HOST}, ${APEX_HOST}) → 301 redirect to ${CANONICAL}`);
  });
}

module.exports = { app, normalizeHost, isRedirectHost };
