const jwt = require('jsonwebtoken');
const db = require('../config/db');

function getToken(req) {
  const authorization = req.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('teambase_token='));

  return cookie ? decodeURIComponent(cookie.slice('teambase_token='.length)) : null;
}

async function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Authentication is not configured on this server.' });
  }

  let token;
  try {
    token = getToken(req);
  } catch {
    return res.status(401).json({ message: 'Authentication is required.' });
  }
  if (!token) {
    return res.status(401).json({ message: 'Authentication is required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sub || !/^\d+$/.test(payload.sub)) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    const result = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [payload.sub],
    );
    if (!result.rows[0]) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    req.user = result.rows[0];
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    console.error('Authentication lookup failed:', error.message);
    return res.status(503).json({ message: 'Unable to verify your account right now.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole };