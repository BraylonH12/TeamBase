const express = require('express');
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validTime(value) {
  return typeof value === 'string'
    && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value);
}

async function hasTeamAccess(teamId, userId) {
  const result = await db.query(
    `SELECT 1
     FROM teams t
     WHERE t.id = $1 AND (
       t.owner_id = $2 OR EXISTS (
         SELECT 1 FROM players p WHERE p.team_id = t.id AND p.user_id = $2
       ) OR EXISTS (
         SELECT 1 FROM team_coaches c WHERE c.team_id = t.id AND c.user_id = $2
       )
     )`,
    [teamId, userId],
  );
  return result.rowCount > 0;
}

async function isTeamCoach(teamId, userId) {
  const result = await db.query(
    'SELECT 1 FROM team_coaches WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  return result.rowCount > 0;
}

async function isTeamOwner(teamId, userId) {
  const result = await db.query(
    'SELECT 1 FROM teams WHERE id = $1 AND owner_id = $2',
    [teamId, userId],
  );
  return result.rowCount > 0;
}

function databaseError(res, error, action) {
  if (error.code === '23503') {
    return res.status(400).json({ message: 'A referenced team or player account does not exist.' });
  }
  if (error.code === '23505') {
    return res.status(409).json({ message: 'This account is already assigned to this team.' });
  }

  console.error(`${action} failed:`, error.message);
  return res.status(503).json({ message: `Unable to ${action} right now.` });
}

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, sport FROM teams ORDER BY name, id',
    );
    return res.json({ teams: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load teams');
  }
});

router.post('/', requireRole('Owner'), async (req, res) => {
  const { name, sport } = req.body || {};
  if (!validText(name, 100) || !validText(sport, 50)) {
    return res.status(400).json({ message: 'Enter a team name and sport within the allowed lengths.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO teams (name, sport, owner_id) VALUES ($1, $2, $3) RETURNING id, name, sport, owner_id, created_at',
      [name.trim(), sport.trim(), req.user.id],
    );
    return res.status(201).json({ team: result.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'create team');
  }
});

router.get('/mine', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'Owner') {
      result = await db.query(
        'SELECT id, name, sport, owner_id, created_at FROM teams WHERE owner_id = $1 ORDER BY name, id',
        [req.user.id],
      );
    } else if (req.user.role === 'Player') {
      result = await db.query(
        `SELECT t.id, t.name, t.sport, t.owner_id, t.created_at
         FROM teams t JOIN players p ON p.team_id = t.id
         WHERE p.user_id = $1 ORDER BY t.name, t.id`,
        [req.user.id],
      );
    } else {
      result = await db.query(
        `SELECT t.id, t.name, t.sport, t.owner_id, t.created_at
         FROM teams t JOIN team_coaches c ON c.team_id = t.id
         WHERE c.user_id = $1 ORDER BY t.name, t.id`,
        [req.user.id],
      );
    }

    return res.json({ teams: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load your teams');
  }
});

router.get('/:teamId', async (req, res) => {
  const teamId = parseId(req.params.teamId);
  if (!teamId) return res.status(400).json({ message: 'Enter a valid team ID.' });

  try {
    if (!(await hasTeamAccess(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      'SELECT id, name, sport, owner_id, created_at FROM teams WHERE id = $1',
      [teamId],
    );
    return res.json({ team: result.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'load team');
  }
});

router.get('/:teamId/roster', async (req, res) => {
  const teamId = parseId(req.params.teamId);
  if (!teamId) return res.status(400).json({ message: 'Enter a valid team ID.' });

  try {
    if (!(await hasTeamAccess(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      `SELECT p.id, p.user_id, p.name, p.jersey_number, p.position, p.created_at
       FROM players p WHERE p.team_id = $1 ORDER BY p.jersey_number, p.name`,
      [teamId],
    );
    return res.json({ players: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load roster');
  }
});

router.get('/:teamId/coaches', async (req, res) => {
  const teamId = parseId(req.params.teamId);
  if (!teamId) return res.status(400).json({ message: 'Enter a valid team ID.' });

  try {
    if (!(await hasTeamAccess(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      `SELECT u.id, u.name
       FROM team_coaches c JOIN users u ON u.id = c.user_id
       WHERE c.team_id = $1 ORDER BY u.name, u.id`,
      [teamId],
    );
    return res.json({ coaches: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load team coaches');
  }
});

router.post('/:teamId/coaches', requireRole('Owner'), async (req, res) => {
  const teamId = parseId(req.params.teamId);
  const { email } = req.body || {};
  if (!teamId || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ message: 'Enter a valid Coach account email.' });
  }

  try {
    if (!(await isTeamOwner(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const account = await db.query(
      "SELECT id, name, email FROM users WHERE LOWER(email) = $1 AND role = 'Coach'",
      [email.trim().toLowerCase()],
    );
    if (!account.rows[0]) {
      return res.status(400).json({ message: 'Create a Coach account before assigning them to a team.' });
    }

    await db.query(
      'INSERT INTO team_coaches (team_id, user_id, assigned_by) VALUES ($1, $2, $3)',
      [teamId, account.rows[0].id, req.user.id],
    );
    return res.status(201).json({ coach: account.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'assign coach');
  }
});

router.delete('/:teamId/coaches/:coachId', requireRole('Owner'), async (req, res) => {
  const teamId = parseId(req.params.teamId);
  const coachId = parseId(req.params.coachId);
  if (!teamId || !coachId) return res.status(400).json({ message: 'Enter valid team and Coach IDs.' });

  try {
    if (!(await isTeamOwner(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      'DELETE FROM team_coaches WHERE team_id = $1 AND user_id = $2 RETURNING user_id',
      [teamId, coachId],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Coach assignment not found.' });
    return res.json({ message: 'Coach removed from team.' });
  } catch (error) {
    return databaseError(res, error, 'remove coach');
  }
});

router.post('/:teamId/roster', requireRole('Owner'), async (req, res) => {
  const teamId = parseId(req.params.teamId);
  const { name, jersey_number: jerseyNumber, position, email } = req.body || {};
  if (!teamId || !validText(name, 100) || !validText(position, 50)
      || !Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 999) {
    return res.status(400).json({ message: 'Enter a valid name, jersey number, and position.' });
  }

  try {
    if (!(await isTeamOwner(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    let playerUserId = null;
    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ message: 'Enter a valid player account email.' });
      }

      const account = await db.query(
        'SELECT id, role FROM users WHERE LOWER(email) = $1',
        [email.trim().toLowerCase()],
      );
      if (!account.rows[0] || account.rows[0].role !== 'Player') {
        return res.status(400).json({ message: 'Create a Player account before linking it to the roster.' });
      }
      playerUserId = account.rows[0].id;
    }

    const result = await db.query(
      `INSERT INTO players (user_id, team_id, name, jersey_number, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, team_id, name, jersey_number, position, created_at`,
      [playerUserId, teamId, name.trim(), jerseyNumber, position.trim()],
    );
    return res.status(201).json({ player: result.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'add player');
  }
});

router.get('/:teamId/events', async (req, res) => {
  const teamId = parseId(req.params.teamId);
  if (!teamId) return res.status(400).json({ message: 'Enter a valid team ID.' });

  try {
    if (!(await hasTeamAccess(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      `SELECT e.id, e.team_id, e.event_type, e.title, e.event_date, e.event_time,
              e.location, e.opponent_team_id, t.name AS opponent_name, e.created_at
       FROM events e LEFT JOIN teams t ON t.id = e.opponent_team_id
       WHERE e.team_id = $1 ORDER BY e.event_date, e.event_time, e.id`,
      [teamId],
    );
    return res.json({ events: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load schedule');
  }
});

router.post('/:teamId/events', requireRole('Owner', 'Coach'), async (req, res) => {
  const teamId = parseId(req.params.teamId);
  const { event_type: eventType, title, event_date: eventDate, event_time: eventTime,
    location, opponent_team_id: opponentTeamId } = req.body || {};
  const parsedOpponentId = opponentTeamId === undefined || opponentTeamId === null
    ? null
    : parseId(String(opponentTeamId));

  if (!teamId || !['Practice', 'Game'].includes(eventType)
      || !validDate(eventDate) || !validTime(eventTime)
      || !validText(location, 255)
      || (title !== undefined && !validText(title, 100))
      || (opponentTeamId !== undefined && opponentTeamId !== null && !parsedOpponentId)
      || (parsedOpponentId && parsedOpponentId === teamId)) {
    return res.status(400).json({ message: 'Enter a valid event type, date, time, location, and title.' });
  }
  if (req.user.role === 'Coach' && (eventType !== 'Practice' || opponentTeamId != null)) {
    return res.status(403).json({ message: 'Coaches can schedule practices only.' });
  }

  try {
    const canSchedule = req.user.role === 'Owner'
      ? await isTeamOwner(teamId, req.user.id)
      : await isTeamCoach(teamId, req.user.id);
    if (!canSchedule) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      `INSERT INTO events (team_id, event_type, title, event_date, event_time, location, opponent_team_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, team_id, event_type, title, event_date, event_time, location, opponent_team_id, created_at`,
      [teamId, eventType, title ? title.trim() : eventType, eventDate, eventTime, location.trim(), parsedOpponentId],
    );
    return res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'schedule event');
  }
});

router.get('/:teamId/posts', async (req, res) => {
  const teamId = parseId(req.params.teamId);
  if (!teamId) return res.status(400).json({ message: 'Enter a valid team ID.' });

  try {
    if (!(await hasTeamAccess(teamId, req.user.id))) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      `SELECT p.id, p.team_id, p.author_id, u.name AS author_name, p.title, p.content, p.created_at
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.team_id = $1 ORDER BY p.created_at DESC, p.id DESC`,
      [teamId],
    );
    return res.json({ posts: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load announcements');
  }
});

router.post('/:teamId/posts', requireRole('Owner', 'Coach'), async (req, res) => {
  const teamId = parseId(req.params.teamId);
  const { title, content } = req.body || {};
  if (!teamId || !validText(title, 150) || typeof content !== 'string'
      || !content.trim() || content.length > 10000) {
    return res.status(400).json({ message: 'Enter a title and announcement content.' });
  }

  try {
    const canPost = req.user.role === 'Owner'
      ? await isTeamOwner(teamId, req.user.id)
      : await isTeamCoach(teamId, req.user.id);
    if (!canPost) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const result = await db.query(
      `INSERT INTO posts (team_id, author_id, title, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, team_id, author_id, title, content, created_at`,
      [teamId, req.user.id, title.trim(), content.trim()],
    );
    return res.status(201).json({ post: result.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'post announcement');
  }
});

module.exports = router;