process.env.JWT_SECRET = 'teams-unit-test-secret';

const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');
const db = require('../server/config/db');
const router = require('../server/routes/teams');
const { startServer } = require('./helpers/http');

const app = express();
app.use(express.json());
app.use('/api/teams', router);

let server;
let baseUrl;
let queryHandler;
const originalQuery = db.query;

function token(id, role) {
  return jwt.sign({ role }, process.env.JWT_SECRET, { subject: String(id) });
}

function authQuery(text, params) {
  if (text.startsWith('SELECT id, name, email, role FROM users WHERE id = $1')) {
    const role = params[0] === '2' ? 'Coach' : params[0] === '3' ? 'Player' : 'Owner';
    return { rows: [{ id: Number(params[0]), name: 'Test User', email: 'test@example.test', role }] };
  }
  return queryHandler(text, params);
}

async function request(path, { userId = 1, role = 'Owner', method = 'GET', body } = {}) {
  const headers = { authorization: `Bearer ${token(userId, role)}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  db.query = (...args) => authQuery(...args);
  server = await startServer(app);
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
  db.query = originalQuery;
});

test('team listing works and invalid team inputs are rejected', async () => {
  queryHandler = async () => ({ rows: [{ id: 1, name: 'Home', sport: 'Soccer' }] });
  let response = await request('/api/teams');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).teams.length, 1);

  response = await request('/api/teams', { method: 'POST', body: { name: ' ', sport: 'Soccer' } });
  assert.equal(response.status, 400);
  response = await request('/api/teams/not-a-number');
  assert.equal(response.status, 400);
});

test('only Owners can create teams and valid input is trimmed', async () => {
  let response = await request('/api/teams', {
    userId: 2,
    role: 'Coach',
    method: 'POST',
    body: { name: 'Team', sport: 'Soccer' },
  });
  assert.equal(response.status, 403);

  queryHandler = async (text, params) => {
    assert.match(text, /INSERT INTO teams/);
    assert.deepEqual(params, ['Home', 'Soccer', 1]);
    return { rows: [{ id: 10, name: 'Home', sport: 'Soccer', owner_id: 1 }] };
  };
  response = await request('/api/teams', {
    method: 'POST',
    body: { name: ' Home ', sport: ' Soccer ' },
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).team.id, 10);
});

test('team details return 404 when access checks fail', async () => {
  queryHandler = async (text) => {
    if (text.includes('FROM teams t')) return { rowCount: 0, rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  };
  const response = await request('/api/teams/9');
  assert.equal(response.status, 404);
});

test('roster validation, ownership, and player-account checks are enforced', async () => {
  let response = await request('/api/teams/9/roster', {
    method: 'POST',
    body: { name: 'Player', jersey_number: -1, position: 'Forward' },
  });
  assert.equal(response.status, 400);

  queryHandler = async (text) => {
    if (text.includes('SELECT 1 FROM teams WHERE id = $1 AND owner_id = $2')) {
      return { rowCount: 0, rows: [] };
    }
    throw new Error(`Unexpected query: ${text}`);
  };
  response = await request('/api/teams/9/roster', {
    method: 'POST',
    body: { name: 'Player', jersey_number: 1, position: 'Forward' },
  });
  assert.equal(response.status, 404);

  queryHandler = async (text) => {
    if (text.includes('SELECT 1 FROM teams WHERE id = $1 AND owner_id = $2')) {
      return { rowCount: 1, rows: [{}] };
    }
    if (text.includes('SELECT id, role FROM users')) return { rows: [{ id: 42, role: 'Owner' }] };
    throw new Error(`Unexpected query: ${text}`);
  };
  response = await request('/api/teams/9/roster', {
    method: 'POST',
    body: {
      name: 'Player',
      jersey_number: 1,
      position: 'Forward',
      email: 'account@example.test',
    },
  });
  assert.equal(response.status, 400);

  queryHandler = async (text) => {
    if (text.includes('SELECT 1 FROM teams WHERE id = $1 AND owner_id = $2')) {
      return { rowCount: 1, rows: [{}] };
    }
    if (text.includes('SELECT id, role FROM users')) return { rows: [{ id: 42, role: 'Player' }] };
    if (text.includes('INSERT INTO players')) return { rows: [{ id: 7, name: 'Player' }] };
    throw new Error(`Unexpected query: ${text}`);
  };
  response = await request('/api/teams/9/roster', {
    method: 'POST',
    body: {
      name: 'Player',
      jersey_number: 1,
      position: 'Forward',
      email: 'player@example.test',
    },
  });
  assert.equal(response.status, 201);
});

test('event and announcement validation and Coach authorization are enforced', async () => {
  let response = await request('/api/teams/9/events', {
    method: 'POST',
    body: {
      event_type: 'Practice',
      event_date: '2099-02-31',
      event_time: '25:00',
      location: 'Field',
    },
  });
  assert.equal(response.status, 400);

  response = await request('/api/teams/9/events', {
    userId: 2,
    role: 'Coach',
    method: 'POST',
    body: {
      event_type: 'Game',
      event_date: '2099-06-01',
      event_time: '18:00',
      location: 'Field',
    },
  });
  assert.equal(response.status, 403);

  response = await request('/api/teams/9/posts', {
    userId: 2,
    role: 'Coach',
    method: 'POST',
    body: { title: '', content: 'Announcement' },
  });
  assert.equal(response.status, 400);

  queryHandler = async (text) => {
    if (text.includes('SELECT 1 FROM team_coaches')) return { rowCount: 0, rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  };
  response = await request('/api/teams/9/posts', {
    userId: 2,
    role: 'Coach',
    method: 'POST',
    body: { title: 'Update', content: 'Announcement' },
  });
  assert.equal(response.status, 404);
});
