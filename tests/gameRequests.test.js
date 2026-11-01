process.env.JWT_SECRET = 'game-requests-unit-secret';

const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');
const db = require('../server/config/db');
const router = require('../server/routes/gameRequests');
const { startServer } = require('./helpers/http');

const app = express();
app.use(express.json());
app.use('/api/game-requests', router);

let server;
let baseUrl;
let queryHandler;
let transactionHandler;
const originalQuery = db.query;
const originalTransaction = db.transaction;

function token(id) {
  return jwt.sign({ role: 'Owner' }, process.env.JWT_SECRET, { subject: String(id) });
}

function authQuery(text, params) {
  if (text.startsWith('SELECT id, name, email, role FROM users WHERE id = $1')) {
    return { rows: [{ id: Number(params[0]), name: 'Owner', email: 'owner@example.test', role: 'Owner' }] };
  }
  return queryHandler(text, params);
}

async function request(path, { userId = 1, method = 'GET', body } = {}) {
  const headers = { authorization: `Bearer ${token(userId)}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  db.query = (...args) => authQuery(...args);
  db.transaction = (...args) => transactionHandler(...args);
  server = await startServer(app);
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
  db.query = originalQuery;
  db.transaction = originalTransaction;
});

test('game-request listing scopes and returns the owner requests', async () => {
  queryHandler = async () => ({ rows: [{ id: 8, status: 'Pending' }] });
  const response = await request('/api/game-requests');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).game_requests, [{ id: 8, status: 'Pending' }]);
});

test('sending rejects invalid input and creates a request for valid teams', async () => {
  let response = await request('/api/game-requests', {
    method: 'POST',
    body: { team_id: 1, opponent_team_id: 1 },
  });
  assert.equal(response.status, 400);

  queryHandler = async (text) => {
    if (text.includes('owner_id = $2')) return { rows: [{ id: 11 }] };
    if (text === 'SELECT id FROM teams WHERE id = $1') return { rows: [{ id: 12 }] };
    if (text.includes('INSERT INTO game_requests')) {
      return { rows: [{ id: 13, sender_team_id: 11, receiver_team_id: 12, status: 'Pending' }] };
    }
    throw new Error(`Unexpected query: ${text}`);
  };
  response = await request('/api/game-requests', {
    method: 'POST',
    body: {
      team_id: 11,
      opponent_team_id: 12,
      proposed_date: '2099-06-01',
      proposed_time: '18:30',
      location: ' Field ',
    },
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).game_request.status, 'Pending');
});

test('sending reports a missing sender or opponent', async () => {
  queryHandler = async () => ({ rows: [] });
  const response = await request('/api/game-requests', {
    method: 'POST',
    body: {
      team_id: 11,
      opponent_team_id: 12,
      proposed_date: '2099-06-01',
      proposed_time: '18:30',
      location: 'Field',
    },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: 'Your sending team was not found.' });
});

function transactionWith(gameRequest, { affectedRows = [{ id: 15, status: 'Accepted' }] } = {}) {
  const calls = [];
  transactionHandler = async (callback) => callback({
    query: async (text) => {
      calls.push(text);
      if (text.includes('SELECT gr.*')) return { rows: gameRequest ? [gameRequest] : [] };
      if (text.includes('INSERT INTO events')) return { rows: [] };
      if (text.includes('UPDATE game_requests')) return { rows: affectedRows };
      throw new Error(`Unexpected transaction query: ${text}`);
    },
  });
  return calls;
}

function pendingRequest() {
  return {
    id: 15,
    sender_team_id: 11,
    receiver_team_id: 12,
    proposed_date: '2099-06-01',
    proposed_time: '18:30',
    location: 'Field',
    status: 'Pending',
    sender_team_name: 'Home',
    receiver_team_name: 'Away',
    receiver_owner_id: 2,
  };
}

test('receiving Owner can accept and reject only pending requests', async () => {
  let calls = transactionWith(pendingRequest());
  let response = await request('/api/game-requests/15', {
    userId: 2,
    method: 'PATCH',
    body: { status: 'Accepted' },
  });
  assert.equal(response.status, 200);
  assert.ok(calls.some((query) => query.includes('INSERT INTO events')));
  assert.equal((await response.json()).game_request.status, 'Accepted');

  calls = transactionWith(pendingRequest());
  response = await request('/api/game-requests/15', {
    userId: 2,
    method: 'PATCH',
    body: { status: 'Rejected' },
  });
  assert.equal(response.status, 200);
  assert.ok(!calls.some((query) => query.includes('INSERT INTO events')));
});

test('game-request response rejects wrong owner, already answered, missing, and invalid requests', async () => {
  transactionWith(pendingRequest());
  let response = await request('/api/game-requests/15', {
    userId: 1,
    method: 'PATCH',
    body: { status: 'Accepted' },
  });
  assert.equal(response.status, 403);

  const answered = pendingRequest();
  answered.status = 'Accepted';
  transactionWith(answered);
  response = await request('/api/game-requests/15', {
    userId: 2,
    method: 'PATCH',
    body: { status: 'Rejected' },
  });
  assert.equal(response.status, 409);

  transactionWith(null);
  response = await request('/api/game-requests/999999', {
    userId: 2,
    method: 'PATCH',
    body: { status: 'Accepted' },
  });
  assert.equal(response.status, 404);

  response = await request('/api/game-requests/invalid', {
    userId: 2,
    method: 'PATCH',
    body: { status: 'Pending' },
  });
  assert.equal(response.status, 400);
});
