const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const apiRoutes = require('./routes');
const authRoutes = require('./routes/auth');

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
  app.listen(PORT, () => {
    console.log(`TeamBase server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
