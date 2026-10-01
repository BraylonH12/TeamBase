const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const app = require('../server/server');
const db = require('../server/config/db');

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

test('dashboard page and assets are served from the frontend', async () => {
  const pageResponse = await fetch(`${baseUrl}/home.html`);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /\.\/css\/dashboard\.css/);
  assert.match(page, /\.\/js\/dashboard\.js/);
  assert.doesNotMatch(page, /<h1>Home<\/h1>/);

  for (const assetPath of ['/css/dashboard.css', '/js/dashboard.js']) {
    const response = await fetch(`${baseUrl}${assetPath}`);
    assert.equal(response.status, 200, `${assetPath} should be available`);
  }
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
      role: 'Admin',
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Role must be Owner, Coach, or Player.' });
});

test('signup accepts Coach accounts', async () => {
  const originalQuery = db.query;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  db.query = async (query, params) => {
    assert.match(query, /INSERT INTO users/);
    assert.equal(params[3], 'Coach');
    return { rows: [{ id: 42, name: 'Coach User', email: 'coach@example.com', role: 'Coach' }] };
  };

  try {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Coach User',
        email: 'coach@example.com',
        password: 'long-enough-password',
        role: 'Coach',
      }),
    });

    assert.equal(response.status, 201);
    assert.equal((await response.json()).user.role, 'Coach');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  } finally {
    db.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('login and signup explain rejected PostgreSQL credentials', async () => {
  const originalQuery = db.query;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-database-error-test-secret';
  db.query = async () => {
    throw Object.assign(new Error('authentication failed'), { code: '28P01' });
  };

  try {
    const expected = 'PostgreSQL rejected the configured database credentials. Update DB_USER and DB_PASSWORD in .env, then restart the server.';
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com', password: 'password' }),
    });
    assert.equal(login.status, 503);
    assert.deepEqual(await login.json(), { message: expected });

    const signup = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Person',
        email: 'person@example.com',
        password: 'long-enough-password',
        role: 'Owner',
      }),
    });
    assert.equal(signup.status, 503);
    assert.deepEqual(await signup.json(), { message: expected });
  } finally {
    db.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('team Owners can assign an existing Coach account', async () => {
  const originalQuery = db.query;
  const originalSecret = process.env.JWT_SECRET;
  const secret = 'coach-assignment-test-secret';
  process.env.JWT_SECRET = secret;
  db.query = async (query) => {
    if (query.includes('SELECT id, name, email, role FROM users WHERE id = $1')) {
      return { rows: [{ id: 1, name: 'Team Owner', email: 'owner@example.com', role: 'Owner' }] };
    }
    if (query.includes('SELECT 1 FROM teams WHERE id = $1 AND owner_id = $2')) {
      return { rowCount: 1, rows: [{}] };
    }
    if (query.includes("role = 'Coach'")) {
      return { rows: [{ id: 42, name: 'Coach User', email: 'coach@example.com' }] };
    }
    if (query.includes('INSERT INTO team_coaches')) return { rowCount: 1, rows: [] };
    throw new Error(`Unexpected query in Coach assignment test: ${query}`);
  };

  try {
    const response = await fetch(`${baseUrl}/api/teams/7/coaches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt.sign({}, secret, { subject: '1' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'coach@example.com' }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).coach, {
      id: 42,
      name: 'Coach User',
      email: 'coach@example.com',
    });
  } finally {
    db.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('assigned Coaches can schedule practices and post, but not manage rosters or games', async () => {
  const originalQuery = db.query;
  const originalSecret = process.env.JWT_SECRET;
  const secret = 'coach-access-test-secret';
  process.env.JWT_SECRET = secret;
  db.query = async (query) => {
    if (query.includes('SELECT id, name, email, role FROM users WHERE id = $1')) {
      return { rows: [{ id: 42, name: 'Coach User', email: 'coach@example.com', role: 'Coach' }] };
    }
    if (query.includes('SELECT 1 FROM team_coaches WHERE team_id = $1 AND user_id = $2')) {
      return { rowCount: 1, rows: [{}] };
    }
    if (query.includes('INSERT INTO events')) {
      return { rows: [{ id: 1, event_type: 'Practice' }] };
    }
    if (query.includes('INSERT INTO posts')) {
      return { rows: [{ id: 1, title: 'Practice update' }] };
    }
    if (query.includes('FROM teams t')) return { rowCount: 0, rows: [] };
    throw new Error(`Unexpected query in Coach access test: ${query}`);
  };

  try {
    const headers = {
      authorization: `Bearer ${jwt.sign({}, secret, { subject: '42' })}`,
      'content-type': 'application/json',
    };
    const practice = await fetch(`${baseUrl}/api/teams/7/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_type: 'Practice',
        event_date: '2099-06-01',
        event_time: '18:00',
        location: 'Main field',
      }),
    });
    assert.equal(practice.status, 201);

    const post = await fetch(`${baseUrl}/api/teams/7/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Practice update', content: 'Practice is on.' }),
    });
    assert.equal(post.status, 201);

    const game = await fetch(`${baseUrl}/api/teams/7/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_type: 'Game',
        event_date: '2099-06-01',
        event_time: '18:00',
        location: 'Main field',
      }),
    });
    assert.equal(game.status, 403);

    const roster = await fetch(`${baseUrl}/api/teams/7/roster`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Player', jersey_number: 1, position: 'Forward' }),
    });
    assert.equal(roster.status, 403);

    const otherTeam = await fetch(`${baseUrl}/api/teams/8/roster`, { headers });
    assert.equal(otherTeam.status, 404);
  } finally {
    db.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
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

test('demo seed defines account roles, passwords, and Warriors roster', async () => {
  const seedSql = readFileSync(path.join(__dirname, '../db/seeds/001_test_accounts.sql'), 'utf8');
  const accounts = [...seedSql.matchAll(/\('([^']+)', '([^']+)', '([^']+)', '(Owner|Coach|Player)'\)/g)]
    .map(([, name, email, hash, role]) => ({ name, email, hash, role }));

  assert.deepEqual(accounts.map(({ name, email, role }) => [name, email, role]), [
    ['Brickhouse', 'Brickhouse@email.com', 'Owner'],
    ['Michael', 'Michael@email.com', 'Player'],
    ['Player', 'Player@email.com', 'Player'],
    ['Owner', 'Owner@email.com', 'Owner'],
  ]);
  assert.equal(await bcrypt.compare('123456', accounts.find((account) => account.email === 'Player@email.com').hash), true);
  assert.equal(await bcrypt.compare('123456', accounts.find((account) => account.email === 'Owner@email.com').hash), true);
  assert.equal(await bcrypt.compare('123456', accounts.find((account) => account.email === 'Brickhouse@email.com').hash), true);
  assert.equal(await bcrypt.compare('654321', accounts.find((account) => account.email === 'Michael@email.com').hash), true);
  assert.match(seedSql, /'Warriors', 'Basketball'/);
  assert.match(seedSql, /'Lebron', 23, 'Forward'/);
  assert.match(seedSql, /'Larry', 30, 'Guard'/);
});
