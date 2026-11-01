process.env.NODE_ENV = 'test';
process.env.DB_HOST = '';
process.env.DATABASE_URL = '';
process.env.SEED_DEMO = 'false';
process.env.AUTH_RATE_LIMIT_MAX = '3';
delete process.env.PGLITE_DIR;
process.env.JWT_SECRET = 'security-integration-test-secret';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { after, before, test } = require('node:test');
const app = require('../../server/server');
const db = require('../../server/config/db');
const { startServer } = require('../helpers/http');

let server;
let baseUrl;

before(async () => {
  await db.connect();
  server = await startServer(app);
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) await server.close();
  await db.disconnect();
});

test('IT-6: Helmet headers are present and login attempts are rate limited', async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.ok(page.headers.has('content-security-policy'));
  assert.ok(page.headers.has('x-content-type-options'));
  assert.equal(page.headers.has('x-powered-by'), false);

  const statuses = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'limit-test@example.test', password: 'wrong-password' }),
    });
    statuses.push(response.status);
    if (attempt === 3) {
      assert.equal(response.status, 429);
      assert.match((await response.json()).message, /Too many authentication attempts/);
    } else {
      assert.equal(response.status, 401);
    }
  }
  assert.deepEqual(statuses, [401, 401, 401, 429]);
});

test('production startup rejects a JWT secret shorter than 32 bytes', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../../server/server.js')], {
    cwd: path.join(__dirname, '../..'),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'too-short',
    },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /JWT_SECRET must be at least 32 bytes in production/);
});
