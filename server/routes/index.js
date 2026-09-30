const express = require('express');

const router = express.Router();

router.use('/teams', require('./teams'));
router.use('/game-requests', require('./gameRequests'));

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TeamBase API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
