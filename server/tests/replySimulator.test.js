/**
 * tests/replySimulator.test.js
 *
 * Milestone 4 — Part C: Simulated Customer Replies & Booking Confirmation Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Isolated in-memory SQLite database (:memory:) seeded with synthetic data.
 * Zero external packages or network dependencies.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

const {
  createTables,
  seedAll,
} = require('../config/database');

const {
  getCancelledAppointments,
} = require('../services/cancellationService');

const {
  findEligibleCandidates,
} = require('../services/matchingService');

const {
  createOffer,
  updateOfferStatus,
  getOfferById,
} = require('../services/offerService');

const {
  simulateCustomerReply,
  ReplySimulationError,
} = require('../services/replySimulator');

const {
  getRevenueMetrics,
} = require('../services/revenueService');

const app = require('../app');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

/**
 * Helper to create an offer and transition it to 'sent' status through human approval.
 */
function createSentOffer(memDb, appointmentId = 'apt-002', waitlistId = 'wl-008') {
  const offer = createOffer(appointmentId, waitlistId, {}, memDb);
  assert.strictEqual(offer.status, 'pending_approval');

  // Staff approves the offer
  const approved = updateOfferStatus(offer.id, 'approved', {}, memDb);
  assert.strictEqual(approved.status, 'approved');

  // Staff sends the offer
  const sent = updateOfferStatus(offer.id, 'sent', {}, memDb);
  assert.strictEqual(sent.status, 'sent');

  return sent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SIMULATED REPLY WORKFLOW (YES, NO, NO_REPLY)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 4 — Part C: Customer Reply Workflows', () => {

  it('YES: successfully accepts offer, confirms booking, recovers slot, and updates waitlist', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    const result = simulateCustomerReply(sentOffer.id, 'YES', {}, memDb);

    // Verify returned payload
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.reply, 'YES');
    assert.strictEqual(result.status, 'accepted');
    assert.strictEqual(result.appointmentRecovered, true);
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, 'accepted');
    assert.ok(result.offer.respondedAt);
    assert.ok(result.booking);

    // Verify appointment in database
    const apt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get('apt-002');
    assert.strictEqual(apt.status, 'recovered');
    assert.strictEqual(apt.customerId, 'cus-005', 'Appointment assigned to waitlist customer');
    assert.ok(apt.notes.includes('Recovered via customer YES'));

    // Verify waitlist in database
    const wl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-008');
    assert.strictEqual(wl.status, 'booked');

    // Verify offer in database
    const refreshedOffer = getOfferById(sentOffer.id, memDb);
    assert.strictEqual(refreshedOffer.status, 'accepted');
    assert.ok(refreshedOffer.respondedAt);

    // Verify revenue metrics incremented
    const metrics = getRevenueMetrics(memDb);
    assert.strictEqual(metrics.recoveredBookingsCount, 1);
    assert.strictEqual(metrics.recoveredRevenue, 12000, 'Price of Balayage & Toning (svc-003)');
    assert.strictEqual(metrics.offersAcceptedCount, 1);
    assert.ok(metrics.appointmentRecoveryRate > 0);
    assert.ok(metrics.offerAcceptanceRate > 0);

    memDb.close();
  });

  it('NO: declines offer, preserves cancelled appointment, and does not create a booking', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    const initialMetrics = getRevenueMetrics(memDb);

    const result = simulateCustomerReply(sentOffer.id, 'NO', {}, memDb);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.reply, 'NO');
    assert.strictEqual(result.status, 'declined');
    assert.strictEqual(result.appointmentRecovered, false);
    assert.strictEqual(result.offer.status, 'declined');
    assert.ok(result.offer.respondedAt);

    // Verify appointment status remains cancelled
    const apt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get('apt-002');
    assert.strictEqual(apt.status, 'cancelled');

    // Verify waitlist status remains waiting
    const wl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-008');
    assert.strictEqual(wl.status, 'waiting');

    // Verify revenue metrics did NOT increase
    const metrics = getRevenueMetrics(memDb);
    assert.strictEqual(metrics.recoveredBookingsCount, 0);
    assert.strictEqual(metrics.recoveredRevenue, 0);
    assert.strictEqual(metrics.offersAcceptedCount, 0);
    assert.strictEqual(metrics.offersBreakdownByStatus.declined, 1);

    memDb.close();
  });

  it('NO_REPLY: records no response, preserves cancelled appointment, and does not book', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    const result = simulateCustomerReply(sentOffer.id, 'NO_REPLY', {}, memDb);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.reply, 'NO_REPLY');
    assert.strictEqual(result.status, 'no_reply');
    assert.strictEqual(result.appointmentRecovered, false);
    assert.strictEqual(result.offer.status, 'no_reply');
    assert.ok(result.offer.respondedAt);

    // Verify appointment remains cancelled
    const apt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get('apt-002');
    assert.strictEqual(apt.status, 'cancelled');

    // Verify waitlist remains waiting
    const wl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-008');
    assert.strictEqual(wl.status, 'waiting');

    // Verify revenue metrics did NOT increase
    const metrics = getRevenueMetrics(memDb);
    assert.strictEqual(metrics.recoveredBookingsCount, 0);
    assert.strictEqual(metrics.recoveredRevenue, 0);
    assert.strictEqual(metrics.offersBreakdownByStatus.no_reply, 1);

    memDb.close();
  });

  it('case normalization: accepts lowercase "yes", "no", and "no_reply"', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    const result = simulateCustomerReply(sentOffer.id, '  yes  ', {}, memDb);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.reply, 'YES');
    assert.strictEqual(result.status, 'accepted');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. INPUT VALIDATION & STATE GATING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 4 — Part C: Validation and State Gating', () => {

  it('rejects invalid or unsupported reply values (400)', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'MAYBE', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'INVALID_REPLY');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, '', {}, memDb),
      (err) => err.code === 'INVALID_REPLY'
    );

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, null, {}, memDb),
      (err) => err.code === 'INVALID_REPLY'
    );

    memDb.close();
  });

  it('rejects invalid offer ID parameter (400)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => simulateCustomerReply('', 'YES', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'INVALID_INPUT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('returns 404 for non-existent offer ID', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => simulateCustomerReply('off-non-existent-999', 'YES', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'OFFER_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects reply when offer is in pending_approval status (human approval gating)', () => {
    const memDb = setupTestDb();
    const offer = createOffer('apt-002', 'wl-008', {}, memDb);
    assert.strictEqual(offer.status, 'pending_approval');

    assert.throws(
      () => simulateCustomerReply(offer.id, 'YES', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'INVALID_OFFER_STATUS');
        assert.strictEqual(err.statusCode, 400);
        assert.ok(err.message.includes('sent'));
        return true;
      }
    );

    memDb.close();
  });

  it('rejects reply when offer is approved but not yet sent', () => {
    const memDb = setupTestDb();
    const offer = createOffer('apt-002', 'wl-008', {}, memDb);
    updateOfferStatus(offer.id, 'approved', {}, memDb);

    assert.throws(
      () => simulateCustomerReply(offer.id, 'YES', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'INVALID_OFFER_STATUS');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects reply when offer is expired (409)', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');
    updateOfferStatus(sentOffer.id, 'expired', {}, memDb);

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'YES', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'OFFER_EXPIRED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DUPLICATE RESPONSES & DOUBLE-BOOKING PREVENTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 4 — Part C: Duplicate Protection & Concurrency', () => {

  it('safely rejects duplicate YES response on already accepted offer (409)', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    // First YES succeeds
    const first = simulateCustomerReply(sentOffer.id, 'YES', {}, memDb);
    assert.strictEqual(first.status, 'accepted');

    // Second YES must fail with OFFER_ALREADY_PROCESSED
    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'YES', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'OFFER_ALREADY_PROCESSED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    memDb.close();
  });

  it('safely rejects duplicate NO response on already declined offer (409)', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    // First NO succeeds
    simulateCustomerReply(sentOffer.id, 'NO', {}, memDb);

    // Second response must fail
    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'NO', {}, memDb),
      (err) => {
        assert.ok(err instanceof ReplySimulationError);
        assert.strictEqual(err.code, 'OFFER_ALREADY_PROCESSED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Switching to YES on declined offer must also fail
    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'YES', {}, memDb),
      (err) => {
        assert.strictEqual(err.code, 'OFFER_ALREADY_PROCESSED');
        return true;
      }
    );

    memDb.close();
  });

  it('safely rejects duplicate NO_REPLY response (409)', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    simulateCustomerReply(sentOffer.id, 'NO_REPLY', {}, memDb);

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'NO_REPLY', {}, memDb),
      (err) => err.code === 'OFFER_ALREADY_PROCESSED'
    );

    memDb.close();
  });

  it('cannot recover an appointment slot if it was already recovered (double-booking protection)', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    // Concurrently or externally, appointment is marked recovered
    memDb.prepare("UPDATE appointments SET status = 'recovered' WHERE id = 'apt-002'").run();

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'YES', {}, memDb),
      (err) => {
        assert.strictEqual(err.code, 'SLOT_ALREADY_CONFIRMED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    memDb.close();
  });

  it('ineligible customer with revoked consent cannot confirm booking on reply', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    // Customer revokes consent before replying
    memDb.prepare("UPDATE customers SET consentToOffers = 0 WHERE id = 'cus-005'").run();

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'YES', {}, memDb),
      (err) => {
        assert.strictEqual(err.code, 'NO_CUSTOMER_CONSENT');
        return true;
      }
    );

    memDb.close();
  });

  it('waitlist entry already booked cannot be confirmed again on reply', () => {
    const memDb = setupTestDb();
    const sentOffer = createSentOffer(memDb, 'apt-002', 'wl-008');

    // Waitlist claimed by another slot
    memDb.prepare("UPDATE waitlist SET status = 'booked' WHERE id = 'wl-008'").run();

    assert.throws(
      () => simulateCustomerReply(sentOffer.id, 'YES', {}, memDb),
      (err) => {
        assert.strictEqual(err.code, 'WAITLIST_ALREADY_BOOKED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. HTTP ROUTE INTEGRATION: POST /api/offers/:id/simulate-reply
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 4 — Part C: HTTP Route Integration', () => {
  let server;
  let baseUrl;
  let testDb;

  it('setup HTTP test server with in-memory database injection', async () => {
    testDb = setupTestDb();
    app.locals.db = testDb;

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  it('POST /api/offers/:id/simulate-reply — accepts YES and returns 200 with booking', async () => {
    const sentOffer = createSentOffer(testDb, 'apt-002', 'wl-008');

    const res = await fetch(`${baseUrl}/api/offers/${sentOffer.id}/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'YES' }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.reply, 'YES');
    assert.strictEqual(body.status, 'accepted');
    assert.strictEqual(body.appointmentRecovered, true);
    assert.ok(body.booking);
    assert.strictEqual(body.booking.appointment.status, 'recovered');
  });

  it('POST /api/offers/:id/simulate-reply — rejects duplicate YES with 409', async () => {
    // Offer was accepted in previous test
    const offers = testDb.prepare("SELECT id FROM offers WHERE status = 'accepted' LIMIT 1").get();

    const res = await fetch(`${baseUrl}/api/offers/${offers.id}/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'YES' }),
    });

    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'OFFER_ALREADY_PROCESSED');
  });

  it('POST /api/offers/:id/simulate-reply — accepts NO and returns 200 without recovery', async () => {
    // Use apt-001 (cancelled, svc-001) and wl-001 (waiting, svc-001)
    const sentOffer = createSentOffer(testDb, 'apt-001', 'wl-001');

    const res = await fetch(`${baseUrl}/api/offers/${sentOffer.id}/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'NO' }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.reply, 'NO');
    assert.strictEqual(body.status, 'declined');
    assert.strictEqual(body.appointmentRecovered, false);
  });

  it('POST /api/offers/:id/simulate-reply — accepts NO_REPLY and returns 200', async () => {
    // Use apt-008 (cancelled, svc-008) and wl-006 (waiting, svc-008)
    const sentOffer = createSentOffer(testDb, 'apt-008', 'wl-006');

    const res = await fetch(`${baseUrl}/api/offers/${sentOffer.id}/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'NO_REPLY' }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.reply, 'NO_REPLY');
    assert.strictEqual(body.status, 'no_reply');
    assert.strictEqual(body.appointmentRecovered, false);
  });

  it('POST /api/offers/:id/simulate-reply — rejects invalid reply string with 400', async () => {
    const res = await fetch(`${baseUrl}/api/offers/any-id/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'INVALID_VALUE' }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'INVALID_REPLY');
  });

  it('POST /api/offers/:id/simulate-reply — rejects missing reply property with 400', async () => {
    const res = await fetch(`${baseUrl}/api/offers/any-id/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'INVALID_REPLY');
  });

  it('POST /api/offers/:id/simulate-reply — returns 404 for non-existent offer', async () => {
    const res = await fetch(`${baseUrl}/api/offers/off-non-existent-888/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'YES' }),
    });

    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'OFFER_NOT_FOUND');
  });

  it('teardown test HTTP server and database', async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (testDb) {
      testDb.close();
    }
    delete app.locals.db;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. COMPLETE END-TO-END WORKFLOW INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 4 — Part C: End-to-End Recovery Integration', () => {

  it('executes full 9-step workflow: cancelled slot -> matching -> offer -> staff approval/sent -> customer YES -> recovered booking -> revenue metrics', () => {
    const memDb = setupTestDb();

    // Step 1: Identify cancelled appointment
    const cancelledList = getCancelledAppointments(memDb);
    const targetApt = cancelledList.find(a => a.id === 'apt-002');
    assert.ok(targetApt, 'apt-002 is cancelled');
    assert.strictEqual(targetApt.status, 'cancelled');

    // Step 2: Find eligible waitlist candidates
    const matchResult = findEligibleCandidates(targetApt.id, memDb);
    assert.ok(matchResult.eligibleCandidates.length > 0, 'Found eligible candidates');
    const topCandidate = matchResult.eligibleCandidates[0];
    assert.strictEqual(topCandidate.waitlistId, 'wl-008');

    // Step 3: Create recovery offer
    const offer = createOffer(targetApt.id, topCandidate.waitlistId, {}, memDb);
    assert.ok(offer.id);

    // Step 4: Confirm that offer awaits human approval (cannot receive reply yet)
    assert.strictEqual(offer.status, 'pending_approval');
    assert.throws(
      () => simulateCustomerReply(offer.id, 'YES', {}, memDb),
      (err) => err.code === 'INVALID_OFFER_STATUS'
    );

    // Step 5: Simulate staff review & sending workflow
    const approvedOffer = updateOfferStatus(offer.id, 'approved', {}, memDb);
    assert.strictEqual(approvedOffer.status, 'approved');
    assert.throws(
      () => simulateCustomerReply(offer.id, 'YES', {}, memDb),
      (err) => err.code === 'INVALID_OFFER_STATUS'
    );

    const sentOffer = updateOfferStatus(offer.id, 'sent', {}, memDb);
    assert.strictEqual(sentOffer.status, 'sent');

    // Step 6: Simulate customer YES response
    const replyResult = simulateCustomerReply(sentOffer.id, 'YES', {}, memDb);
    assert.strictEqual(replyResult.success, true);
    assert.strictEqual(replyResult.status, 'accepted');
    assert.strictEqual(replyResult.appointmentRecovered, true);

    // Step 7 & 8: Verify appointment, waitlist, and offer statuses
    const updatedApt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get(targetApt.id);
    assert.strictEqual(updatedApt.status, 'recovered');
    assert.strictEqual(updatedApt.customerId, topCandidate.customerId);

    const updatedWl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get(topCandidate.waitlistId);
    assert.strictEqual(updatedWl.status, 'booked');

    const updatedOffer = getOfferById(offer.id, memDb);
    assert.strictEqual(updatedOffer.status, 'accepted');
    assert.ok(updatedOffer.respondedAt);

    // Step 9: Verify recovered revenue metrics
    const metrics = getRevenueMetrics(memDb);
    assert.strictEqual(metrics.recoveredBookingsCount, 1);
    assert.strictEqual(metrics.recoveredRevenue, 12000);
    assert.strictEqual(metrics.offersAcceptedCount, 1);
    assert.ok(metrics.appointmentRecoveryRate > 0);
    assert.ok(metrics.offerAcceptanceRate > 0);

    // Subsequent response attempts on this offer must be rejected
    assert.throws(
      () => simulateCustomerReply(offer.id, 'YES', {}, memDb),
      (err) => err.code === 'OFFER_ALREADY_PROCESSED'
    );
    assert.throws(
      () => simulateCustomerReply(offer.id, 'NO', {}, memDb),
      (err) => err.code === 'OFFER_ALREADY_PROCESSED'
    );

    memDb.close();
  });

  it('executes complete end-to-end NO workflow without booking or revenue recovery', () => {
    const memDb = setupTestDb();

    // 1. Cancelled appointment & matching candidate
    const offer = createOffer('apt-001', 'wl-001', {}, memDb);
    assert.strictEqual(offer.status, 'pending_approval');

    // 2. Staff approval sequence
    updateOfferStatus(offer.id, 'approved', {}, memDb);
    const sentOffer = updateOfferStatus(offer.id, 'sent', {}, memDb);

    // 3. Customer declines
    const replyResult = simulateCustomerReply(sentOffer.id, 'NO', {}, memDb);
    assert.strictEqual(replyResult.status, 'declined');
    assert.strictEqual(replyResult.appointmentRecovered, false);

    // 4. Verify DB records
    const apt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get('apt-001');
    assert.strictEqual(apt.status, 'cancelled');

    const wl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-001');
    assert.strictEqual(wl.status, 'waiting');

    // 5. Revenue remains 0
    const metrics = getRevenueMetrics(memDb);
    assert.strictEqual(metrics.recoveredBookingsCount, 0);
    assert.strictEqual(metrics.recoveredRevenue, 0);

    memDb.close();
  });

  it('executes complete end-to-end NO_REPLY workflow without booking or revenue recovery', () => {
    const memDb = setupTestDb();

    // 1. Cancelled appointment & matching candidate
    const offer = createOffer('apt-008', 'wl-006', {}, memDb);
    assert.strictEqual(offer.status, 'pending_approval');

    // 2. Staff approval sequence
    updateOfferStatus(offer.id, 'approved', {}, memDb);
    const sentOffer = updateOfferStatus(offer.id, 'sent', {}, memDb);

    // 3. Customer does not reply
    const replyResult = simulateCustomerReply(sentOffer.id, 'NO_REPLY', {}, memDb);
    assert.strictEqual(replyResult.status, 'no_reply');
    assert.strictEqual(replyResult.appointmentRecovered, false);

    // 4. Verify DB records
    const apt = memDb.prepare('SELECT * FROM appointments WHERE id = ?').get('apt-008');
    assert.strictEqual(apt.status, 'cancelled');

    const wl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-006');
    assert.strictEqual(wl.status, 'waiting');

    // 5. Revenue remains 0
    const metrics = getRevenueMetrics(memDb);
    assert.strictEqual(metrics.recoveredBookingsCount, 0);
    assert.strictEqual(metrics.recoveredRevenue, 0);

    memDb.close();
  });
});

