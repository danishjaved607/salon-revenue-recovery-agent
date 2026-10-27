'use strict';

/**
 * errorHandler middleware
 * Catches errors passed via next(err) and returns a structured JSON response.
 * Must be registered as the LAST middleware in app.js.
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${status} — ${message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(status).json({
    error: {
      status,
      message,
    },
  });
};
