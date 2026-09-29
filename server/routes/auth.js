const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const router = express.Router();
const SESSION_DURATION_SECONDS = 60 * 60;

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setAuthCookie(res, user) {
  const token = jwt.sign(
    { email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { subject: String(user.id), expiresIn: SESSION_DURATION_SECONDS },
  );

  res.cookie('teambase_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_SECONDS * 1000,
    path: '/',
  });
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ message: 'Enter your email and password.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Login is not configured on this server.' });
  }

  try {
    const result = await db.query(
      'SELECT id, email, password_hash, role FROM users WHERE LOWER(email) = $1',
      [normalizedEmail],
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    setAuthCookie(res, user);

    return res.json({
      message: 'Login successful.',
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login request failed:', error.message);
    return res.status(503).json({ message: 'Unable to process login right now.' });
  }
});

router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ message: 'Enter your email and password.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 bytes.' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Sign up is not configured on this server.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role',
      [normalizedEmail, passwordHash],
    );
    const user = result.rows[0];

    setAuthCookie(res, user);
    return res.status(201).json({
      message: 'Account created.',
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    console.error('Sign-up request failed:', error.message);
    return res.status(503).json({ message: 'Unable to create an account right now.' });
  }
});

module.exports = router;
