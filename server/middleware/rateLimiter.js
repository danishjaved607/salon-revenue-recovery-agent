'use strict';

const { rateLimit } = require('express-rate-limit');

/**
 * rateLimiter.js
 *
 * Protects public demo API endpoints from abuse, credit draining, and denial-of-service:
 * - Stricter rate limit for AI Agent chat (POST /api/agent/chat) to protect OpenAI API credits.
 * - General mutation rate limit for state-altering endpoints (POST, PATCH, PUT, DELETE).
 * - Health-check and read-only endpoints are never throttled by mutation limits.
 * - Automatically skipped in automated test runs (NODE_ENV === 'test').
 */

// Strict rate limit for the OpenAI-powered agent concierge
const agentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15-minute window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many AI agent requests from this IP. Please try again after 15 minutes.',
    },
  },
});

// General mutation rate limit for mutating requests (POST, PATCH, PUT, DELETE)
const mutationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // 120 mutation requests per 15-minute window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    const mutatingMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
    return !mutatingMethods.includes(req.method);
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many modification requests from this IP. Please try again after 15 minutes.',
    },
  },
});

module.exports = {
  agentRateLimiter,
  mutationRateLimiter,
};
