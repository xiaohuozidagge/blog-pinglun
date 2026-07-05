const express = require('express');
const router = express.Router();

const { execute, queryOne } = require('./db');

const POINTS_REFUND = 1;
const DAILY_REFUND_LIMIT = 50;

const USER_NOT_FOUND_RESPONSE = {
  success: false,
  code: 'USER_NOT_FOUND',
  error: 'User ID must be manually assigned by an administrator'
};

/**
 * Refund user points.
 * POST /api/refund-points
 * Body: { userId, batchId, url, reason }
 */
router.post('/refund-points', async (req, res) => {
  const { userId, batchId, url, reason } = req.body || {};

  if (!userId) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_USER_ID',
      error: 'Missing userId'
    });
  }

  try {
    const userRow = await queryOne('SELECT points FROM auto_comment_users WHERE user_id = ?', [userId]);
    if (!userRow) {
      return res.status(404).json(USER_NOT_FOUND_RESPONSE);
    }

    const today = new Date().toISOString().slice(0, 10);
    const countRow = await queryOne(
      `
        SELECT COUNT(*) as count FROM refund_points_log
        WHERE user_id = ?
          AND DATE(created_at) = ?
      `,
      [userId, today]
    );
    const todayCount = countRow ? Number(countRow.count) || 0 : 0;

    if (todayCount >= DAILY_REFUND_LIMIT) {
      console.log(`[refund-points] user ${userId} reached daily refund limit (${DAILY_REFUND_LIMIT})`);
      return res.status(200).json({
        success: false,
        error: 'Daily refund limit reached',
        dailyLimit: DAILY_REFUND_LIMIT,
        todayCount
      });
    }

    const currentPoints = Number(userRow.points) || 0;
    const newPoints = currentPoints + POINTS_REFUND;
    const updateResult = await execute(
      `
        UPDATE auto_comment_users
        SET points = points + ?,
            updated_at = NOW()
        WHERE user_id = ?
      `,
      [POINTS_REFUND, userId]
    );

    if (updateResult && updateResult.affectedRows === 0) {
      return res.status(404).json(USER_NOT_FOUND_RESPONSE);
    }

    await execute(
      `
        INSERT INTO refund_points_log (user_id, batch_id, url, points, reason, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [userId, batchId || null, url || null, POINTS_REFUND, reason || null]
    );

    console.log(`[refund-points] user ${userId} refunded +${POINTS_REFUND}, remaining ${newPoints}, today ${todayCount + 1}/${DAILY_REFUND_LIMIT}`);

    return res.status(200).json({
      success: true,
      refundedPoints: POINTS_REFUND,
      remainingPoints: newPoints,
      todayRefundCount: todayCount + 1,
      dailyLimit: DAILY_REFUND_LIMIT
    });
  } catch (err) {
    console.error('[refund-points] error:', err.message);
    return res.status(500).json({
      success: false,
      code: 'DATABASE_ERROR',
      error: 'Internal server error',
      message: err.message
    });
  }
});

module.exports = router;
