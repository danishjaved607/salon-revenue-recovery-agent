'use strict';

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');

// ── Environment Configuration ───────────────────────────────────────────────
// Load from repository root .env first, then server/.env for robust local development
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { agentRateLimiter, mutationRateLimiter } = require('./middleware/rateLimiter');

const app = express();

// Enable trust proxy for Render / cloud reverse proxy environments
app.set('trust proxy', 1);

// ── Minimum Public-Demo Security Protections ────────────────────────────────
// 1. Disable X-Powered-By to prevent framework fingerprinting
app.disable('x-powered-by');

// 2. HTTP Security Headers via Helmet (allow cross-origin API resources for SPA)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 3. Dedicated CORS Origin Allowlist Configuration
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
  : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, server-to-server, Render uptime health checks)
    if (!origin) {
      return callback(null, true);
    }
    const normalizedOrigin = origin.trim().replace(/\/+$/, '');
    if (configuredOrigins.includes(normalizedOrigin) || configuredOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy rejection: Origin "${origin}" is not authorized.`), false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());
app.use(require('./middleware/requestLogger'));

// ── Routes with Public Protection Rate Limiters ─────────────────────────────
// Mutating endpoints (appointments, offers) are protected by general mutation rate limiter
app.use('/api/appointments', mutationRateLimiter, require('./routes/appointments'));
app.use('/api/offers',       mutationRateLimiter, require('./routes/offers'));
app.use('/api/dashboard',    require('./routes/dashboard'));

// AI Agent route is protected by stricter rate limiter to guard OpenAI credits
app.use('/api/agent',        agentRateLimiter, require('./routes/agent'));

// ── Health-check (exempt from rate limiting for Render monitoring) ───────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler (must be last) ─────────────────────────────────────────────
app.use(require('./middleware/errorHandler'));

module.exports = app;
