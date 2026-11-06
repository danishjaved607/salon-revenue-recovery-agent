/**
 * tests/e2eIntegration.test.js
 *
 * Milestone 6 — Step 1: End-to-End HTTP Route Integration Testing
 *
 * Requirements:
 *  1. Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 *  2. Uses isolated in-memory SQLite databases (:memory:) seeded with synthetic data.
 *  3. Starts an actual HTTP server on a dynamically assigned port (port 0).
 *  4. Tests complete recovery workflow using apt-001 and eligible candidate wl-002.
 *  5. Tests negative reply workflows (NO and NO_REPLY) on separate appointments.
 *  6. Tests human approval and lifecycle restrictions.
 *  7. Tests candidate validation and duplicate active offers.
 *  8. Tests concurrent competing YES reply requests for the same slot.
 *  9. Verifies HTTP status codes and standard error envelopes.
 * 10. Guarantees servers and database connections are closed after every test.
 * 11. Never touches or mutates server/db/salon.db.
 */

'use strict';

// Ensure tests never make live OpenAI API calls and always use deterministic fallback templates
process.env.OPENAI_API_KEY = '';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

const app = require('../app');
const {
  createTables,
  seedAll,
} = require('../config/database');

/**
 * Creates an isolated in-memory SQLite database instance seeded with synthetic data.
 * @returns {DatabaseSync}
 */
function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

/**
 * Starts an ephemeral HTTP test server with injected test database.
 * @param {DatabaseSync} memDb
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
function createTestServer(memDb) {
  app.locals.db = memDb;

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

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FULL HTTP RECOVERY WORKFLOW (apt-001 + wl-002)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 6 — Step 1: Full HTTP Recovery Workflow (apt-001 + wl-002)', () => {

  it('completes the entire recovery lifecycle via HTTP REST endpoints and updates dashboard revenue', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // Step 1: Retrieve cancelled appointments via HTTP GET
      const cancelledRes = await fetch(`${testServer.url}/api/appointments/cancelled`);
      assert.strictEqual(cancelledRes.status, 200);
      assert.match(cancelledRes.headers.get('content-type'), /application\/json/);
      const cancelledData = await cancelledRes.json();

      assert.strictEqual(cancelledData.success, true);
      assert.ok(Array.isArray(cancelledData.appointments));
      assert.ok(cancelledData.count > 0);

      const targetSlot = cancelledData.appointments.find((a) => a.id === 'apt-001');
      assert.ok(targetSlot, 'apt-001 must be present in cancelled appointments queue');
      assert.strictEqual(targetSlot.status, 'cancelled');
      assert.strictEqual(targetSlot.serviceId, 'svc-001');
      assert.strictEqual(targetSlot.servicePrice, 2500, 'Hair Cut & Blow-Dry price is 2500 PKR');

      // Step 2: Retrieve matching eligible candidates via HTTP GET
      const matchesRes = await fetch(`${testServer.url}/api/appointments/apt-001/matches`);
      assert.strictEqual(matchesRes.status, 200);
      const matchesData = await matchesRes.json();

      assert.strictEqual(matchesData.success, true);
      assert.strictEqual(matchesData.slot.appointmentId, 'apt-001');
      assert.ok(Array.isArray(matchesData.eligibleCandidates));

      const candidateWl002 = matchesData.eligibleCandidates.find((c) => c.waitlistId === 'wl-002');
      assert.ok(candidateWl002, 'wl-002 (Noor Fatima) must be eligible for apt-001');
      assert.strictEqual(candidateWl002.customerId, 'cus-004');

      // Step 3: Create a recovery offer via HTTP POST
      const createOfferRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: 'apt-001',
          waitlistId: 'wl-002',
        }),
      });

      assert.strictEqual(createOfferRes.status, 201);
      const createOfferData = await createOfferRes.json();
      assert.strictEqual(createOfferData.success, true);
      assert.ok(createOfferData.offer.id);
      assert.strictEqual(createOfferData.offer.appointmentId, 'apt-001');
      assert.strictEqual(createOfferData.offer.waitlistId, 'wl-002');
      assert.strictEqual(createOfferData.offer.status, 'pending_approval');
      const offerId = createOfferData.offer.id;

      // Step 4: Approve the offer via HTTP PATCH (Human-in-the-Loop)
      const approveRes = await fetch(`${testServer.url}/api/offers/${offerId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      assert.strictEqual(approveRes.status, 200);
      const approveData = await approveRes.json();
      assert.strictEqual(approveData.success, true);
      assert.strictEqual(approveData.offer.status, 'approved');
      assert.ok(approveData.offer.approvedAt);

      // Step 5: Mark the offer as sent via HTTP PATCH
      const sendRes = await fetch(`${testServer.url}/api/offers/${offerId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      assert.strictEqual(sendRes.status, 200);
      const sendData = await sendRes.json();
      assert.strictEqual(sendData.success, true);
      assert.strictEqual(sendData.offer.status, 'sent');
      assert.ok(sendData.offer.sentAt);

      // Step 6: Simulate customer YES response via HTTP POST
      const replyRes = await fetch(`${testServer.url}/api/offers/${offerId}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'YES' }),
      });

      assert.strictEqual(replyRes.status, 200);
      const replyData = await replyRes.json();
      assert.strictEqual(replyData.success, true);
      assert.strictEqual(replyData.reply, 'YES');
      assert.strictEqual(replyData.status, 'accepted');
      assert.strictEqual(replyData.appointmentRecovered, true);
      assert.ok(replyData.booking);
      assert.strictEqual(replyData.booking.appointment.id, 'apt-001');
      assert.strictEqual(replyData.booking.appointment.status, 'recovered');
      assert.strictEqual(replyData.booking.appointment.customerId, 'cus-004');
      assert.strictEqual(replyData.booking.waitlist.id, 'wl-002');
      assert.strictEqual(replyData.booking.waitlist.status, 'booked');

      // Step 7: Verify database state directly in the isolated SQLite instance
      const dbApt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get('apt-001');
      assert.strictEqual(dbApt.status, 'recovered');
      assert.strictEqual(dbApt.customerId, 'cus-004');

      const dbWl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-002');
      assert.strictEqual(dbWl.status, 'booked');

      // Step 8: Verify dashboard metrics via HTTP GET
      const dashboardRes = await fetch(`${testServer.url}/api/dashboard/metrics`);
      assert.strictEqual(dashboardRes.status, 200);
      const dashboardData = await dashboardRes.json();

      assert.strictEqual(dashboardData.success, true);
      assert.strictEqual(dashboardData.metrics.currency, 'PKR');
      assert.strictEqual(dashboardData.metrics.recoveredBookingsCount, 1);
      assert.strictEqual(dashboardData.metrics.recoveredRevenue, 2500);
      assert.strictEqual(dashboardData.metrics.offersAcceptedCount, 1);
      assert.ok(dashboardData.metrics.appointmentRecoveryRate > 0);
      assert.ok(dashboardData.metrics.offerAcceptanceRate > 0);
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NEGATIVE REPLY SCENARIOS (NO and NO_REPLY)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 6 — Step 1: Negative Reply Scenarios (NO and NO_REPLY)', () => {

  it('NO reply: marks offer as declined without recovering appointment or modifying revenue', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // Create offer for apt-002 (svc-003, 12000 PKR) and wl-008
      const createRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-002', waitlistId: 'wl-008' }),
      });
      const { offer } = await createRes.json();

      // Approve and send
      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      // Customer declines with NO
      const replyRes = await fetch(`${testServer.url}/api/offers/${offer.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'NO' }),
      });

      assert.strictEqual(replyRes.status, 200);
      const replyData = await replyRes.json();
      assert.strictEqual(replyData.success, true);
      assert.strictEqual(replyData.reply, 'NO');
      assert.strictEqual(replyData.status, 'declined');
      assert.strictEqual(replyData.appointmentRecovered, false);

      // Verify appointment remains cancelled and waitlist remains waiting
      const dbApt = memDb.prepare('SELECT status FROM appointments WHERE id = ?').get('apt-002');
      assert.strictEqual(dbApt.status, 'cancelled');

      const dbWl = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-008');
      assert.strictEqual(dbWl.status, 'waiting');

      // Verify dashboard revenue remains 0
      const dashboardRes = await fetch(`${testServer.url}/api/dashboard/metrics`);
      const { metrics } = await dashboardRes.json();
      assert.strictEqual(metrics.recoveredBookingsCount, 0);
      assert.strictEqual(metrics.recoveredRevenue, 0);
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('NO_REPLY: marks offer as no_reply without recovering appointment or modifying revenue', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // Create offer for apt-008 (svc-008, 5500 PKR) and wl-006
      const createRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-008', waitlistId: 'wl-006' }),
      });
      const { offer } = await createRes.json();

      // Approve and send
      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      // Customer does not reply
      const replyRes = await fetch(`${testServer.url}/api/offers/${offer.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'NO_REPLY' }),
      });

      assert.strictEqual(replyRes.status, 200);
      const replyData = await replyRes.json();
      assert.strictEqual(replyData.success, true);
      assert.strictEqual(replyData.reply, 'NO_REPLY');
      assert.strictEqual(replyData.status, 'no_reply');
      assert.strictEqual(replyData.appointmentRecovered, false);

      // Verify appointment remains cancelled and waitlist remains waiting
      const dbApt = memDb.prepare('SELECT status FROM appointments WHERE id = ?').get('apt-008');
      assert.strictEqual(dbApt.status, 'cancelled');

      const dbWl = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-006');
      assert.strictEqual(dbWl.status, 'waiting');

      // Verify dashboard revenue remains 0
      const dashboardRes = await fetch(`${testServer.url}/api/dashboard/metrics`);
      const { metrics } = await dashboardRes.json();
      assert.strictEqual(metrics.recoveredBookingsCount, 0);
      assert.strictEqual(metrics.recoveredRevenue, 0);
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. HUMAN APPROVAL AND OFFER LIFECYCLE RESTRICTIONS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 6 — Step 1: Human Approval & Offer Lifecycle Restrictions', () => {

  it('rejects direct creation with status "sent" (400 INVALID_STATUS)', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      const res = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: 'apt-001',
          waitlistId: 'wl-001',
          status: 'sent',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'INVALID_STATUS');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('rejects sending an unapproved offer directly from pending_approval (400 OFFER_NOT_APPROVED)', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // Create offer in pending_approval
      const createRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-001' }),
      });
      const { offer } = await createRes.json();
      assert.strictEqual(offer.status, 'pending_approval');

      // Attempt to jump directly to sent
      const sendRes = await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      assert.strictEqual(sendRes.status, 400);
      const sendData = await sendRes.json();
      assert.strictEqual(sendData.success, false);
      assert.strictEqual(sendData.error.code, 'OFFER_NOT_APPROVED');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('rejects customer reply simulation when offer is not in "sent" status (400 INVALID_OFFER_STATUS)', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      const createRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-001' }),
      });
      const { offer } = await createRes.json();

      // Test reply while pending_approval
      const replyPendingRes = await fetch(`${testServer.url}/api/offers/${offer.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'YES' }),
      });
      assert.strictEqual(replyPendingRes.status, 400);
      const pendingData = await replyPendingRes.json();
      assert.strictEqual(pendingData.error.code, 'INVALID_OFFER_STATUS');

      // Approve offer to 'approved'
      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      // Test reply while approved (not yet sent)
      const replyApprovedRes = await fetch(`${testServer.url}/api/offers/${offer.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'YES' }),
      });
      assert.strictEqual(replyApprovedRes.status, 400);
      const approvedData = await replyApprovedRes.json();
      assert.strictEqual(approvedData.error.code, 'INVALID_OFFER_STATUS');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('rejects duplicate reply submissions on already-processed offers (409 OFFER_ALREADY_PROCESSED)', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      const createRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-001' }),
      });
      const { offer } = await createRes.json();

      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      await fetch(`${testServer.url}/api/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      // First reply succeeds
      const firstRes = await fetch(`${testServer.url}/api/offers/${offer.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'YES' }),
      });
      assert.strictEqual(firstRes.status, 200);

      // Second reply attempt must fail with 409 Conflict
      const secondRes = await fetch(`${testServer.url}/api/offers/${offer.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: 'YES' }),
      });
      assert.strictEqual(secondRes.status, 409);
      const secondData = await secondRes.json();
      assert.strictEqual(secondData.success, false);
      assert.strictEqual(secondData.error.code, 'OFFER_ALREADY_PROCESSED');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CANDIDATE AND OFFER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 6 — Step 1: Candidate and Offer Validation', () => {

  it('rejects offer creation for an ineligible candidate with service mismatch (400 SERVICE_MISMATCH)', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // apt-001 is Hair Cut (svc-001), while wl-003 is Colour (svc-002)
      const res = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: 'apt-001',
          waitlistId: 'wl-003',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'SERVICE_MISMATCH');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('rejects creating a duplicate active offer for the same slot and waitlist candidate (409 DUPLICATE_ACTIVE_OFFER)', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // Create initial offer
      const firstRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-001' }),
      });
      assert.strictEqual(firstRes.status, 201);

      // Attempt second offer for the identical candidate and slot
      const duplicateRes = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-001' }),
      });

      assert.strictEqual(duplicateRes.status, 409);
      const duplicateData = await duplicateRes.json();
      assert.strictEqual(duplicateData.success, false);
      assert.strictEqual(duplicateData.error.code, 'DUPLICATE_ACTIVE_OFFER');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. COMPETING BOOKING REQUESTS (CONCURRENCY SAFETY)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 6 — Step 1: Competing Booking Requests (Concurrency Safety)', () => {

  it('confirms exactly one booking when two competing YES responses target the same cancelled slot', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      // apt-001 has two eligible candidates: wl-001 (Sara Malik) and wl-002 (Noor Fatima)
      const resOffer1 = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-001' }),
      });
      const { offer: offer1 } = await resOffer1.json();

      const resOffer2 = await fetch(`${testServer.url}/api/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: 'apt-001', waitlistId: 'wl-002' }),
      });
      const { offer: offer2 } = await resOffer2.json();

      // Approve both
      await fetch(`${testServer.url}/api/offers/${offer1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      await fetch(`${testServer.url}/api/offers/${offer2.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      // Mark both as sent
      await fetch(`${testServer.url}/api/offers/${offer1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      await fetch(`${testServer.url}/api/offers/${offer2.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      // Concurrently submit simulated YES replies for both offers
      const [reply1, reply2] = await Promise.all([
        fetch(`${testServer.url}/api/offers/${offer1.id}/simulate-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reply: 'YES' }),
        }),
        fetch(`${testServer.url}/api/offers/${offer2.id}/simulate-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reply: 'YES' }),
        }),
      ]);

      const body1 = await reply1.json();
      const body2 = await reply2.json();

      const successfulResponses = [body1, body2].filter((b) => b.success === true && b.appointmentRecovered === true);
      const failedResponses = [body1, body2].filter((b) => b.success === false);

      // Exactly one booking must succeed
      assert.strictEqual(successfulResponses.length, 1, 'Exactly one concurrent booking request must succeed');
      assert.strictEqual(failedResponses.length, 1, 'The competing booking request must be rejected');

      // The rejected request must have an error status (400 or 409) and error code
      const rejectedStatus = reply1.status === 200 ? reply2.status : reply1.status;
      assert.ok([400, 409].includes(rejectedStatus), `Expected 400 or 409 for competing request, got ${rejectedStatus}`);
      assert.ok(failedResponses[0].error.code, 'Rejected response must provide an error code');

      // Verify database integrity in SQLite: only one appointment recovered
      const recoveredApts = memDb.prepare("SELECT * FROM appointments WHERE id = ? AND status = 'recovered'").all('apt-001');
      assert.strictEqual(recoveredApts.length, 1, 'Database must contain exactly 1 recovered appointment for apt-001');

      // Verify waitlist status: one booked, one waiting
      const wl1 = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-001');
      const wl2 = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-002');
      const statuses = [wl1.status, wl2.status].sort();
      assert.deepStrictEqual(statuses, ['booked', 'waiting'], 'One candidate must be booked and the other must remain waiting');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. HTTP ROUTE COVERAGE AND ERROR ENVELOPES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 6 — Step 1: HTTP Route Coverage & Error Envelopes', () => {

  it('GET /api/appointments/:id/matches — returns 404 with error envelope for non-existent appointment', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      const res = await fetch(`${testServer.url}/api/appointments/apt-nonexistent-999/matches`);
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'APPOINTMENT_NOT_FOUND');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('PATCH /api/offers/:id/status — returns 404 with error envelope for non-existent offer', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      const res = await fetch(`${testServer.url}/api/offers/off-nonexistent-999/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'OFFER_NOT_FOUND');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

  it('POST /api/offers/:id/simulate-reply — returns 400 with INVALID_REPLY when reply is missing or empty', async () => {
    const memDb = setupTestDb();
    const testServer = await createTestServer(memDb);

    try {
      const res = await fetch(`${testServer.url}/api/offers/off-any-id/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'INVALID_REPLY');
    } finally {
      await testServer.close();
      memDb.close();
      delete app.locals.db;
    }
  });

});
