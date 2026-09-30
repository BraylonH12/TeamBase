const express = require('express');
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('Owner'));

function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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

function databaseError(res, error, action) {
  if (error.code === '23503') {
    return res.status(400).json({ message: 'A referenced team does not exist.' });
  }

  console.error(`${action} failed:`, error.message);
  return res.status(503).json({ message: `Unable to ${action} right now.` });
}

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT gr.id, gr.sender_team_id, sender.name AS sender_team_name,
              gr.receiver_team_id, receiver.name AS receiver_team_name,
              gr.proposed_date, gr.proposed_time, gr.location, gr.status, gr.created_at
       FROM game_requests gr
       JOIN teams sender ON sender.id = gr.sender_team_id
       JOIN teams receiver ON receiver.id = gr.receiver_team_id
       WHERE sender.owner_id = $1 OR receiver.owner_id = $1
       ORDER BY gr.created_at DESC, gr.id DESC`,
      [req.user.id],
    );
    return res.json({ game_requests: result.rows });
  } catch (error) {
    return databaseError(res, error, 'load game requests');
  }
});

router.post('/', async (req, res) => {
  const { team_id: senderValue, opponent_team_id: receiverValue,
    proposed_date: proposedDate, proposed_time: proposedTime, location } = req.body || {};
  const senderTeamId = parseId(String(senderValue ?? ''));
  const receiverTeamId = parseId(String(receiverValue ?? ''));

  if (!senderTeamId || !receiverTeamId || senderTeamId === receiverTeamId
      || !validDate(proposedDate) || !validTime(proposedTime)
      || typeof location !== 'string' || !location.trim() || location.trim().length > 255) {
    return res.status(400).json({ message: 'Enter valid teams, date, time, and location.' });
  }

  try {
    const sender = await db.query(
      'SELECT id FROM teams WHERE id = $1 AND owner_id = $2',
      [senderTeamId, req.user.id],
    );
    if (!sender.rows[0]) {
      return res.status(404).json({ message: 'Your sending team was not found.' });
    }

    const receiver = await db.query('SELECT id FROM teams WHERE id = $1', [receiverTeamId]);
    if (!receiver.rows[0]) {
      return res.status(404).json({ message: 'Opponent team not found.' });
    }

    const result = await db.query(
      `INSERT INTO game_requests
         (sender_team_id, receiver_team_id, proposed_date, proposed_time, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sender_team_id, receiver_team_id, proposed_date, proposed_time, location, status, created_at`,
      [senderTeamId, receiverTeamId, proposedDate, proposedTime, location.trim()],
    );
    return res.status(201).json({ game_request: result.rows[0] });
  } catch (error) {
    return databaseError(res, error, 'send game request');
  }
});

router.patch('/:requestId', async (req, res) => {
  const requestId = parseId(req.params.requestId);
  const { status } = req.body || {};
  if (!requestId || !['Accepted', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Choose Accepted or Rejected for a valid request.' });
  }

  try {
    const updated = await db.transaction(async (client) => {
      const requestResult = await client.query(
        `SELECT gr.*, sender.name AS sender_team_name, receiver.name AS receiver_team_name,
                receiver.owner_id AS receiver_owner_id
         FROM game_requests gr
         JOIN teams sender ON sender.id = gr.sender_team_id
         JOIN teams receiver ON receiver.id = gr.receiver_team_id
         WHERE gr.id = $1 FOR UPDATE OF gr`,
        [requestId],
      );
      const gameRequest = requestResult.rows[0];
      if (!gameRequest) {
        return { error: 'not_found' };
      }
      if (String(gameRequest.receiver_owner_id) !== String(req.user.id)) {
        return { error: 'forbidden' };
      }
      if (gameRequest.status !== 'Pending') {
        return { error: 'not_pending' };
      }

      if (status === 'Accepted') {
        await client.query(
          `INSERT INTO events
             (team_id, event_type, title, event_date, event_time, location, opponent_team_id)
           VALUES ($1, 'Game', $2, $3, $4, $5, $6),
                  ($6, 'Game', $7, $3, $4, $5, $1)`,
          [
            gameRequest.sender_team_id,
            `Game vs ${gameRequest.receiver_team_name}`,
            gameRequest.proposed_date,
            gameRequest.proposed_time,
            gameRequest.location,
            gameRequest.receiver_team_id,
            `Game vs ${gameRequest.sender_team_name}`,
          ],
        );
      }

      const result = await client.query(
        'UPDATE game_requests SET status = $1 WHERE id = $2 RETURNING id, sender_team_id, receiver_team_id, proposed_date, proposed_time, location, status, created_at',
        [status, requestId],
      );
      return { request: result.rows[0] };
    });

    if (updated.error === 'not_found') {
      return res.status(404).json({ message: 'Game request not found.' });
    }
    if (updated.error === 'forbidden') {
      return res.status(403).json({ message: 'Only the receiving team owner can respond.' });
    }
    if (updated.error === 'not_pending') {
      return res.status(409).json({ message: 'This game request has already been answered.' });
    }

    return res.json({ game_request: updated.request });
  } catch (error) {
    return databaseError(res, error, 'respond to game request');
  }
});

module.exports = router;