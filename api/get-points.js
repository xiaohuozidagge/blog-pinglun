const express = require('express');
const router = express.Router();

const { queryOne } = require('./db');

const USER_NOT_FOUND_RESPONSE = {
  success: false,
  code: 'USER_NOT_FOUND',
  error: 'User ID must be manually assigned by an administrator'
};

/**
 * Query user points.
 * GET /api/get-points?userId=xxx
 */
router.get('/get-points', async (req, res) => {
  const { userId } = req.query || {};

  if (!userId) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_USER_ID',
      error: 'Missing userId'
    });
  }

  try {
    const row = await queryOne('SELECT points FROM auto_comment_users WHERE user_id = ?', [userId]);
    console.log(`[get-points] userId=${userId}, row=${JSON.stringify(row)}, DB_PATH=${process.env.DB_PATH || 'default'}`);

    if (!row) {
      return res.status(404).json(USER_NOT_FOUND_RESPONSE);
    }

    return res.status(200).json({ success: true, points: row.points });
  } catch (err) {
    console.error('[get-points] database query failed:', err.message);
    return res.status(500).json({
      success: false,
      code: 'DATABASE_ERROR',
      error: 'Database query failed',
      message: err.message
    });
  }
});

module.exports = router;
