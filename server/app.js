'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.VITE_API_BASE_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(require('./middleware/requestLogger'));

// ── Routes (wired in Milestones 2+) ─────────────────────────────────────────
// app.use('/api/appointments', require('./routes/appointments'));
// app.use('/api/waitlist',     require('./routes/waitlist'));
// app.use('/api/offers',       require('./routes/offers'));
// app.use('/api/dashboard',    require('./routes/dashboard'));

// ── Health-check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler (must be last) ─────────────────────────────────────────────
app.use(require('./middleware/errorHandler'));

module.exports = app;
