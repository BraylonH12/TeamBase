process.env.NODE_ENV = 'test';
process.env.DB_HOST = '';
process.env.DATABASE_URL = '';
process.env.SEED_DEMO = 'false';
delete process.env.PGLITE_DIR;
process.env.JWT_SECRET = 'integration-test-secret';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const app = require('../../server/server');
const db = require('../../server/config/db');
const { startServer } = require('../helpers/http');

let server;
let baseUrl;
let ownerToken;
let ownerEmail;
let ownerTeamId;
let playerToken;
let outsiderToken;
let receiverToken;
let receiverTeamId;
let outsiderTeamId;
let gameRequestId;

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signup(name, role) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const response = await request('/api/auth/signup', {
    method: 'POST',
    body: { name, email, password: 'integration-password', role },
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie?.includes('teambase_token='));
  return { email, token: cookie.split(';', 1)[0].slice('teambase_token='.length) };
}

before(async () => {
  await db.connect();
  server = await startServer(app);
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) await server.close();
  await db.disconnect();
});

test('IT-1: signup, login, /me, duplicate email, and logout', async () => {
  ownerEmail = `owner-${Date.now()}@example.test`;
  let response = await request('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Integration Owner', email: ownerEmail, password: 'integration-password', role: 'Owner' },
  });
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /teambase_token=.*HttpOnly/);

  const signupCookie = response.headers.get('set-cookie').split(';', 1)[0];
  response = await request('/api/auth/me', { token: signupCookie.slice('teambase_token='.length) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.email, ownerEmail);

  response = await request('/api/auth/signup', {
    method: 'POST',
    body: { email: ownerEmail, password: 'integration-password', role: 'Owner' },
  });
  assert.equal(response.status, 409);

  response = await request('/api/auth/login', {
    method: 'POST',
    body: { email: ownerEmail, password: 'integration-password' },
  });
  assert.equal(response.status, 200);
  ownerToken = response.headers.get('set-cookie').split(';', 1)[0].slice('teambase_token='.length);

  response = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /teambase_token=;/);
  response = await request('/api/auth/me', { token: ownerToken });
  assert.equal(response.status, 200);
  response = await request('/api/auth/me');
  assert.equal(response.status, 401);
});

test('IT-2: Owner creates a team and linked Player sees roster, posts, and events', async () => {
  let response = await request('/api/teams', {
    token: ownerToken,
    method: 'POST',
    body: { name: 'Integration Home', sport: 'Soccer' },
  });
  assert.equal(response.status, 201);
  ownerTeamId = (await response.json()).team.id;

  const player = await signup('Integration Player', 'Player');
  playerToken = player.token;
  response = await request(`/api/teams/${ownerTeamId}/roster`, {
    token: ownerToken,
    method: 'POST',
    body: { name: 'Roster Player', jersey_number: 14, position: 'Forward', email: player.email },
  });
  assert.equal(response.status, 201);

  response = await request(`/api/teams/${ownerTeamId}/posts`, {
    token: ownerToken,
    method: 'POST',
    body: { title: 'Welcome', content: 'Season begins soon.' },
  });
  assert.equal(response.status, 201);

  response = await request(`/api/teams/${ownerTeamId}/events`, {
    token: ownerToken,
    method: 'POST',
    body: {
      event_type: 'Practice',
      title: 'Team practice',
      event_date: '2099-06-01',
      event_time: '18:00',
      location: 'Main field',
    },
  });
  assert.equal(response.status, 201);

  for (const [resource, responseKey] of [
    ['roster', 'players'],
    ['posts', 'posts'],
    ['events', 'events'],
  ]) {
    response = await request(`/api/teams/${ownerTeamId}/${resource}`, { token: playerToken });
    assert.equal(response.status, 200, `${resource} should be visible to a team Player`);
    const body = await response.json();
    assert.equal(body[responseKey].length, 1);
  }

  const outsider = await signup('Integration Outsider', 'Player');
  outsiderToken = outsider.token;
  response = await request('/api/teams', {
    token: outsiderToken,
    method: 'POST',
    body: { name: 'Integration Away', sport: 'Soccer' },
  });
  assert.equal(response.status, 403);
  response = await request(`/api/teams/${ownerTeamId}/roster`, { token: outsiderToken });
  assert.equal(response.status, 404);

  response = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Integration Receiver',
      email: `receiver-${Date.now()}@example.test`,
      password: 'integration-password',
      role: 'Owner',
    },
  });
  assert.equal(response.status, 201);
  receiverToken = response.headers.get('set-cookie').split(';', 1)[0].slice('teambase_token='.length);
  response = await request('/api/auth/me', { token: receiverToken });
  assert.equal(response.status, 200);
  const receiver = (await response.json()).user;
  response = await request('/api/teams', {
    token: receiverToken,
    method: 'POST',
    body: { name: 'Integration Away', sport: 'Soccer' },
  });
  assert.equal(response.status, 201);
  receiverTeamId = (await response.json()).team.id;
  assert.ok(receiver.id);
});

test('IT-3: sending Owner request is accepted by the receiver and creates both game events', async () => {
  const wrongOwner = await signup('Integration Wrong Owner', 'Owner');
  let response = await request('/api/teams', {
    token: wrongOwner.token,
    method: 'POST',
    body: { name: 'Unrelated Team', sport: 'Soccer' },
  });
  assert.equal(response.status, 201);
  outsiderTeamId = (await response.json()).team.id;

  response = await request('/api/game-requests', {
    token: ownerToken,
    method: 'POST',
    body: {
      team_id: ownerTeamId,
      opponent_team_id: receiverTeamId,
      proposed_date: '2099-07-01',
      proposed_time: '19:30',
      location: 'Stadium',
    },
  });
  assert.equal(response.status, 201);
  gameRequestId = (await response.json()).game_request.id;

  response = await request(`/api/game-requests/${gameRequestId}`, {
    token: wrongOwner.token,
    method: 'PATCH',
    body: { status: 'Accepted' },
  });
  assert.equal(response.status, 403);

  response = await request(`/api/game-requests/${gameRequestId}`, {
    token: receiverToken,
    method: 'PATCH',
    body: { status: 'Accepted' },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).game_request.status, 'Accepted');

  response = await request(`/api/teams/${ownerTeamId}/events`, { token: ownerToken });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).events.filter((event) => event.event_type === 'Game').length, 1);

  response = await request(`/api/teams/${receiverTeamId}/events`, { token: receiverToken });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).events.filter((event) => event.event_type === 'Game').length, 1);

  response = await request(`/api/game-requests/${gameRequestId}`, {
    token: receiverToken,
    method: 'PATCH',
    body: { status: 'Accepted' },
  });
  assert.equal(response.status, 409);
  response = await request('/api/game-requests/999999', {
    token: receiverToken,
    method: 'PATCH',
    body: { status: 'Rejected' },
  });
  assert.equal(response.status, 404);
});

test('IT-4: assigned Coach can post and schedule Practice but cannot manage roster or Games', async () => {
  const coach = await signup('Integration Coach', 'Coach');
  let response = await request(`/api/teams/${ownerTeamId}/coaches`, {
    token: ownerToken,
    method: 'POST',
    body: { email: coach.email },
  });
  assert.equal(response.status, 201);

  response = await request(`/api/teams/${ownerTeamId}/events`, {
    token: coach.token,
    method: 'POST',
    body: {
      event_type: 'Practice',
      event_date: '2099-08-01',
      event_time: '17:00',
      location: 'Training field',
    },
  });
  assert.equal(response.status, 201);

  response = await request(`/api/teams/${ownerTeamId}/posts`, {
    token: coach.token,
    method: 'POST',
    body: { title: 'Coach update', content: 'Bring water.' },
  });
  assert.equal(response.status, 201);

  response = await request(`/api/teams/${ownerTeamId}/events`, {
    token: coach.token,
    method: 'POST',
    body: {
      event_type: 'Game',
      event_date: '2099-08-01',
      event_time: '17:00',
      location: 'Training field',
    },
  });
  assert.equal(response.status, 403);

  response = await request(`/api/teams/${ownerTeamId}/roster`, {
    token: coach.token,
    method: 'POST',
    body: { name: 'Unauthorized', jersey_number: 55, position: 'Defender' },
  });
  assert.equal(response.status, 403);
  response = await request(`/api/teams/${outsiderTeamId}/events`, { token: coach.token });
  assert.equal(response.status, 404);
});

test('PGlite reports affected rowCount for UPDATE and DELETE', async () => {
  const user = await db.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    ['Row Count', `row-count-${Date.now()}@example.test`, 'not-used', 'Player'],
  );
  const updated = await db.query('UPDATE users SET name = $1 WHERE id = $2', ['Updated', user.rows[0].id]);
  const deleted = await db.query('DELETE FROM users WHERE id = $1', [user.rows[0].id]);
  assert.equal(updated.rowCount, 1);
  assert.equal(deleted.rowCount, 1);
});
