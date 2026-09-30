const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const app = require('../server/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('login rejects missing credentials', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: '', password: '' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Enter your email and password.' });
});

test('login rejects a null request body', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'null',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Request body must be valid JSON.' });
});

test('login rejects an invalid email before database access', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'provided' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Enter a valid email address.' });
});

test('signup rejects missing credentials', async () => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: '', password: '' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Enter your email and password.' });
});

test('signup rejects an invalid email before database access', async () => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'long-enough-password' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Enter a valid email address.' });
});

test('signup rejects passwords shorter than eight characters', async () => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new@example.com', password: 'short' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'Password must be at least 8 characters and no more than 72 bytes.',
  });
});

test('signup rejects roles outside the supported account types', async () => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'new@example.com',
      password: 'long-enough-password',
      role: 'Coach',
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Role must be Owner or Player.' });
});

test('protected team routes reject requests without a session', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';

  try {
    const response = await fetch(`${baseUrl}/api/teams`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: 'Authentication is required.' });
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});

test('demo account seed stores hashes for the requested passwords', async () => {
  const seedSql = readFileSync(path.join(__dirname, '../db/seeds/001_test_accounts.sql'), 'utf8');
  const accounts = [...seedSql.matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)];

  assert.deepEqual(accounts.map(([, name, email]) => email), [
    'Brickhouse@email.com',
    'Michael@email.com',
  ]);
  assert.equal(await bcrypt.compare('123456', accounts[0][3]), true);
  assert.equal(await bcrypt.compare('654321', accounts[1][3]), true);
});
