// Focused routing/readiness tests for server.js.
// Run: npm run test:server-routing
// Covers: apex/Heroku-host 301 to www (path+query preserved), case/port/
// trailing-dot/comma-list host tolerance, www serving without a loop,
// health/readiness probes, and unknown hosts not being redirected.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import serverModule from '../server.js';
const { app } = serverModule;

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'frontend', 'dist');
const indexPath = path.join(distDir, 'index.html');

let server;
let baseUrl;
let createdStubIndex = false;

function request(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${pathname}`, { headers }, (res) => {
      const body = [];
      res.on('data', (chunk) => body.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test.before(async () => {
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(indexPath, '<!doctype html><title>stub</title>');
    createdStubIndex = true;
  }
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server?.close();
  if (createdStubIndex && fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
});

test('healthz is host-independent, uncached, and returns stable JSON', async () => {
  const res = await request('/healthz', { host: 'truck-opti-app-0de4b9bc1ac2.herokuapp.com' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.location, undefined);
  assert.match(res.headers['cache-control'] || '', /no-store/);
  assert.deepEqual(JSON.parse(res.body), { status: 'ok' });
});

test('readyz reports ready when the production frontend artifact exists', async () => {
  const res = await request('/readyz', { host: 'truck-opti-app-0de4b9bc1ac2.herokuapp.com' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.location, undefined);
  assert.match(res.headers['cache-control'] || '', /no-store/);
  assert.deepEqual(JSON.parse(res.body), { status: 'ready' });
});

test('current Heroku default hostname 301s to canonical www', async () => {
  const res = await request('/', { host: 'truck-opti-app-0de4b9bc1ac2.herokuapp.com' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, 'https://www.truckopti.in/');
});

test('Heroku host redirect is case-insensitive and strips the port', async () => {
  const res = await request('/login', { host: 'TRUCK-OPTI-APP-0DE4B9BC1AC2.herokuapp.com:443' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, 'https://www.truckopti.in/login');
});

test('apex truckopti.in 301s to www preserving path and query', async () => {
  const res = await request('/pricing?src=incident', { host: 'truckopti.in' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, 'https://www.truckopti.in/pricing?src=incident');
});

test('x-forwarded-host comma list uses the first entry', async () => {
  const res = await request('/tracking', { 'x-forwarded-host': 'truckopti.in, internal-hop' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, 'https://www.truckopti.in/tracking');
});

test('canonical www serves the app without a redirect loop', async () => {
  const res = await request('/login', { host: 'www.truckopti.in' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.location, undefined);
});

test('canonical www is matched case-insensitively and with a port', async () => {
  const res = await request('/', { host: 'WWW.TRUCKOPTI.IN:8443' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.location, undefined);
});

test('trailing-dot FQDN forms still redirect', async () => {
  const res = await request('/', { host: 'truckopti.in.' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, 'https://www.truckopti.in/');
});

test('unknown hosts are served, never redirected', async () => {
  const res = await request('/', { host: 'example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.location, undefined);
});
