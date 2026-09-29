const assert = require('node:assert/strict');
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
