'use strict';

/**
 * errorHandler middleware
 * Catches errors passed via next(err) and returns a structured JSON response.
 * Must be registered as the LAST middleware in app.js.
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const isCorsError = err.message && err.message.startsWith('CORS policy rejection');
  const status = isCorsError ? 403 : (err.status || err.statusCode || 500);

  const isProduction = process.env.NODE_ENV === 'production';
  let message = err.message || 'Internal Server Error';

  // In production, mask unexpected 500 internal errors to avoid leaking database details or internals
  if (status >= 500 && isProduction) {
    message = 'Internal Server Error';
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${status} — ${err.message || message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    error: {
      code: err.code || (isCorsError ? 'CORS_FORBIDDEN' : (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST')),
      status,
      message,
    },
  });
};
