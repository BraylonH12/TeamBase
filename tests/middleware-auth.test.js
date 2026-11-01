process.env.JWT_SECRET = 'middleware-unit-test-secret';

const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');
const db = require('../server/config/db');
const { requireAuth, requireRole } = require('../server/middleware/auth');
const { startServer } = require('./helpers/http');

const app = express();
app.get('/private', requireAuth, requireRole('Owner'), (req, res) => res.json({ user: req.user }));

let server;
let baseUrl;
let queryHandler;
const originalQuery = db.query;
const secret = process.env.JWT_SECRET;

function token(payload = { sub: '1' }, options = {}) {
  return jwt.sign(payload, secret, options);
}

async function request(authHeader, cookie) {
  const headers = {};
  if (authHeader) headers.authorization = authHeader;
  if (cookie) headers.cookie = cookie;
  return fetch(`${baseUrl}/private`, { headers });
}

before(async () => {
  db.query = async (text, params) => {
    assert.match(text, /SELECT id, name, email, role FROM users WHERE id = \$1/);
    return queryHandler(params);
  };
  server = await startServer(app);
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
  db.query = originalQuery;
  process.env.JWT_SECRET = secret;
});

test('authentication rejects missing and malformed tokens', async () => {
  let response = await request();
  assert.equal(response.status, 401);
  response = await request('Bearer invalid-token');
  assert.equal(response.status, 401);
  response = await request(undefined, 'teambase_token=%ZZ');
  assert.equal(response.status, 401);
});

test('authentication rejects expired tokens and non-numeric subjects', async () => {
  let response = await request(`Bearer ${token({ sub: '1' }, { expiresIn: -1 })}`);
  assert.equal(response.status, 401);
  response = await request(`Bearer ${token({ sub: 'not-a-number' })}`);
  assert.equal(response.status, 401);
});

test('authentication rejects a deleted account and accepts a valid cookie token', async () => {
  queryHandler = async () => ({ rows: [] });
  let response = await request(`Bearer ${token()}`);
  assert.equal(response.status, 401);

  queryHandler = async () => ({
    rows: [{ id: 1, name: 'Owner', email: 'owner@example.test', role: 'Owner' }],
  });
  response = await request(undefined, `teambase_token=${token()}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.role, 'Owner');
});

test('authentication reports database failures and missing configuration', async () => {
  queryHandler = async () => {
    throw new Error('database unavailable');
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    let response = await request(`Bearer ${token()}`);
    assert.equal(response.status, 503);
  } finally {
    console.error = originalError;
  }

  delete process.env.JWT_SECRET;
  try {
    const response = await request(`Bearer ${token()}`);
    assert.equal(response.status, 503);
  } finally {
    process.env.JWT_SECRET = secret;
  }
});

test('role authorization denies a user without the required role', async () => {
  queryHandler = async () => ({
    rows: [{ id: 2, name: 'Player', email: 'player@example.test', role: 'Player' }],
  });
  const response = await request(`Bearer ${token({ sub: '2' })}`);
  assert.equal(response.status, 403);
});
