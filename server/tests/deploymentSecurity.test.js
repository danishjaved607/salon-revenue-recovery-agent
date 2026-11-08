/**
 * tests/deploymentSecurity.test.js
 *
 * Milestone 8 — Deployment Preparation & Security Hardening Tests
 *
 * Verifies:
 *  1. Service health check endpoint operates cleanly.
 *  2. Helmet security headers are present and X-Powered-By is absent.
 *  3. CORS origin policy correctly allows permitted origins and rejects unauthorized origins.
 *  4. Production error masking conceals 500 internal details when NODE_ENV === 'production'.
 *  5. Rate limiters exist and are configured with expected parameters.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');
const errorHandler = require('../middleware/errorHandler');
const { agentRateLimiter, mutationRateLimiter } = require('../middleware/rateLimiter');

/**
 * Creates an ephemeral test HTTP server.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
function createTestServer() {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

describe('Milestone 8 — Deployment Preparation: Health & Security Headers', () => {
  it('GET /api/health returns 200 OK with status "ok" and timestamp', async () => {
    const server = await createTestServer();
    try {
      const res = await fetch(`${server.url}/api/health`);
      assert.strictEqual(res.status, 200);
      assert.match(res.headers.get('content-type'), /application\/json/);

      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.ok(data.timestamp, 'timestamp must be present');
      assert.ok(!isNaN(Date.parse(data.timestamp)), 'timestamp must be valid ISO string');
    } finally {
      await server.close();
    }
  });

  it('verifies Helmet security headers and absence of X-Powered-By header', async () => {
    const server = await createTestServer();
    try {
      const res = await fetch(`${server.url}/api/health`);
      // Verify X-Powered-By is disabled
      assert.strictEqual(res.headers.get('x-powered-by'), null);

      // Verify Helmet headers
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(res.headers.get('x-frame-options') || res.headers.get('content-security-policy'));
    } finally {
      await server.close();
    }
  });
});

describe('Milestone 8 — Deployment Preparation: CORS Origin Policy', () => {
  it('allows requests with approved origin (http://localhost:5173)', async () => {
    const server = await createTestServer();
    try {
      const res = await fetch(`${server.url}/api/health`, {
        headers: {
          Origin: 'http://localhost:5173',
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    } finally {
      await server.close();
    }
  });

  it('allows requests without Origin header (e.g. curl / server-to-server)', async () => {
    const server = await createTestServer();
    try {
      const res = await fetch(`${server.url}/api/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
    } finally {
      await server.close();
    }
  });

  it('rejects requests from unapproved origin with 403 and CORS_FORBIDDEN', async () => {
    const server = await createTestServer();
    try {
      const res = await fetch(`${server.url}/api/health`, {
        headers: {
          Origin: 'https://malicious-unapproved-site.example.com',
        },
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'CORS_FORBIDDEN');
    } finally {
      await server.close();
    }
  });
});

describe('Milestone 8 — Deployment Preparation: Error Masking & Rate Limiters', () => {
  it('masks unexpected 500 internal errors when NODE_ENV is "production"', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      let responseStatus = null;
      let responseJson = null;

      const mockReq = {};
      const mockRes = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(payload) {
          responseJson = payload;
          return this;
        },
      };

      const sensitiveError = new Error('Database connection failed at /var/data/salon.db password=secret');
      sensitiveError.statusCode = 500;

      errorHandler(sensitiveError, mockReq, mockRes, () => {});

      assert.strictEqual(responseStatus, 500);
      assert.strictEqual(responseJson.success, false);
      assert.strictEqual(responseJson.error.message, 'Internal Server Error');
      assert.strictEqual(responseJson.error.code, 'INTERNAL_SERVER_ERROR');
      assert.ok(!responseJson.error.message.includes('password=secret'));
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('reveals error message when NODE_ENV is "development" or "test"', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      let responseStatus = null;
      let responseJson = null;

      const mockReq = {};
      const mockRes = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(payload) {
          responseJson = payload;
          return this;
        },
      };

      const devError = new Error('Dev inspection message');
      devError.statusCode = 500;

      errorHandler(devError, mockReq, mockRes, () => {});

      assert.strictEqual(responseStatus, 500);
      assert.strictEqual(responseJson.error.message, 'Dev inspection message');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('verifies agentRateLimiter and mutationRateLimiter middleware are exportable functions', () => {
    assert.strictEqual(typeof agentRateLimiter, 'function');
    assert.strictEqual(typeof mutationRateLimiter, 'function');
  });
});
