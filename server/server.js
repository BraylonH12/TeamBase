const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const apiRoutes = require('./routes');
const authRoutes = require('./routes/auth');
const db = require('./config/db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRoutes);
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
    if (!process.env.JWT_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production.');
      }

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
