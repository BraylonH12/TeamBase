const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const configuredAuthRateLimit = process.env.AUTH_RATE_LIMIT_MAX;
const authRateLimitMax = configuredAuthRateLimit === undefined
  ? (process.env.NODE_ENV === 'test' ? 1000 : 10)
  : Number(configuredAuthRateLimit);

if (!Number.isSafeInteger(authRateLimitMax) || authRateLimitMax < 1) {
  throw new Error('AUTH_RATE_LIMIT_MAX must be a positive integer.');
}

const apiRoutes = require('./routes');
const authRoutes = require('./routes/auth');
const db = require('./config/db');

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' },
});

app.use(helmet());
app.use(express.json());

app.use('/api', apiRoutes);
app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/signup', authRateLimit);
app.use('/api/auth', authRoutes);

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Request body must be valid JSON.' });
  }

  if (res.headersSent) return next(error);
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

if (require.main === module) {
  async function start() {
    if (process.env.NODE_ENV === 'production') {
      if (Buffer.byteLength(process.env.JWT_SECRET || '', 'utf8') < 32) {
        throw new Error('JWT_SECRET must be at least 32 bytes in production.');
      }
    } else if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      console.warn('JWT_SECRET is unset; using a temporary random development secret.');
    }

    await db.connect();
    app.listen(PORT, () => {
      console.log(`TeamBase server running on http://localhost:${PORT}`);
    });
  }

  start().catch((error) => {
    console.error('Failed to start TeamBase server:', error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
