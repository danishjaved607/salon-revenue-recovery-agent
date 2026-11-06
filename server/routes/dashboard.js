/**
 * routes/dashboard.js
 *
 * Express routes for revenue recovery dashboard metrics (Milestone 3 — Part C).
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getRevenueMetrics } = require('../services/revenueService');

// GET /api/dashboard/metrics — Retrieve revenue tracking and recovery metrics
router.get('/metrics', (req, res, next) => {
  try {
    const targetDb = req.app?.locals?.db || undefined;
    const metrics = getRevenueMetrics(targetDb);
    res.json({
      success: true,
      metrics,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
