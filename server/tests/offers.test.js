/**
 * tests/offers.test.js
 *
 * Milestone 3 — Part A: Appointment Offer Creation and Tracking Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Isolated in-memory SQLite database (:memory:) seeded with Milestone 1 synthetic data.
 * Zero external packages required.
 *
 * Scope:
 *  1. Successful offer creation & data storage
 *  2. Querying and tracking offers with filters
 *  3. Appointment state revalidation (existence, cancelled status)
 *  4. Waitlist candidate revalidation (existence, waiting status)
 *  5. Live eligibility revalidation (service, consent, schedule, conflict)
 *  6. Duplicate active offer prevention (409 DUPLICATE_ACTIVE_OFFER)
 *  7. Offer lifecycle updates and timestamp tracking
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const {
  createTables,
  seedAll,
} = require('../config/database');

const {
  OfferError,
  createOffer,
  getOfferById,
  getOffers,
  getOffersForAppointment,
  updateOfferStatus,
} = require('../services/offerService');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SUCCESSFUL OFFER CREATION & TRACKING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part A: Successful Offer Creation & Tracking', () => {

  it('creates an offer linking an eligible waitlist entry to a cancelled slot with default pending_approval status', () => {
    const memDb = setupTestDb();

    // apt-001 is cancelled (svc-001, stf-001, 2024-11-20 10:00-11:00)
    // wl-001 is waiting (cus-001, svc-001, stf-001, priority 1)
    const offer = createOffer('apt-001', 'wl-001', memDb);

    assert.ok(offer.id, 'Offer must have a generated ID');
    assert.strictEqual(offer.appointmentId, 'apt-001');
    assert.strictEqual(offer.waitlistId, 'wl-001');
    assert.strictEqual(offer.customerId, 'cus-001');
    assert.strictEqual(offer.status, 'pending_approval');
    assert.ok(offer.generatedAt, 'generatedAt timestamp must be recorded');
    assert.strictEqual(offer.approvedAt, null);
    assert.strictEqual(offer.sentAt, null);
    assert.strictEqual(offer.respondedAt, null);
    assert.strictEqual(offer.aiGenerated, 0);

    // Joined metadata
    assert.strictEqual(offer.customerName, 'Sara Malik');
    assert.strictEqual(offer.serviceName, 'Hair Cut & Blow-Dry');
    assert.strictEqual(offer.staffName, 'Ayesha Khan');
    assert.match(offer.messageText, /Hair Cut & Blow-Dry/);

    memDb.close();
  });

  it('creates an offer with custom messageText and initial approved/sent status', () => {
    const memDb = setupTestDb();

    const customText = 'Special priority slot available for you!';
    const offer = createOffer('apt-001', 'wl-001', {
      messageText: customText,
      status: 'sent',
    }, memDb);

    assert.strictEqual(offer.messageText, customText);
    assert.strictEqual(offer.status, 'sent');
    assert.ok(offer.generatedAt);
    assert.ok(offer.approvedAt, 'approvedAt should be set when created in sent status');
    assert.ok(offer.sentAt, 'sentAt should be set when created in sent status');

    memDb.close();
  });

  it('retrieves an offer by ID and returns joined metadata', () => {
    const memDb = setupTestDb();
    const created = createOffer('apt-001', 'wl-001', memDb);

    const fetched = getOfferById(created.id, memDb);
    assert.deepStrictEqual(fetched, created);

    memDb.close();
  });

  it('queries offers with filtering by appointmentId, waitlistId, and status', () => {
    const memDb = setupTestDb();

    // Create offer for wl-001 on apt-001
    const off1 = createOffer('apt-001', 'wl-001', { status: 'pending_approval' }, memDb);
    // Create offer for wl-002 on apt-001
    const off2 = createOffer('apt-001', 'wl-002', { status: 'approved' }, memDb);

    // Query all offers for apt-001
    const allForApt = getOffers({ appointmentId: 'apt-001' }, memDb);
    assert.strictEqual(allForApt.length, 2);

    // Query by status
    const pendingOffers = getOffers({ status: 'pending_approval' }, memDb);
    assert.ok(pendingOffers.some(o => o.id === off1.id));
    assert.ok(!pendingOffers.some(o => o.id === off2.id));

    // Query by waitlistId
    const wl1Offers = getOffers({ waitlistId: 'wl-001' }, memDb);
    assert.strictEqual(wl1Offers.length, 1);
    assert.strictEqual(wl1Offers[0].id, off1.id);

    memDb.close();
  });

  it('retrieves offers for an existing appointment via getOffersForAppointment', () => {
    const memDb = setupTestDb();

    // Create an offer for apt-001
    const created = createOffer('apt-001', 'wl-001', memDb);

    const offers = getOffersForAppointment('apt-001', memDb);
    assert.strictEqual(offers.length, 1);
    assert.strictEqual(offers[0].id, created.id);
    assert.strictEqual(offers[0].appointmentId, 'apt-001');

    memDb.close();
  });

  it('rejects getOffersForAppointment with 404 APPOINTMENT_NOT_FOUND when appointment does not exist (GET /api/appointments/:id/offers)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => getOffersForAppointment('apt-nonexistent', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'APPOINTMENT_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        assert.match(err.message, /does not exist/i);
        return true;
      }
    );

    // Verify HTTP handler response simulation returns 404
    function handleGetOffers(req, res) {
      try {
        const offers = getOffersForAppointment(req.params.id, memDb);
        return res.status(200).json({ success: true, count: offers.length, offers });
      } catch (err) {
        if (err instanceof OfferError) {
          return res.status(err.statusCode).json({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    }

    let capturedStatus = 200;
    let capturedBody = null;
    const mockRes = {
      status(code) { capturedStatus = code; return this; },
      json(data) { capturedBody = data; return this; },
    };

    handleGetOffers({ params: { id: 'apt-does-not-exist' } }, mockRes);
    assert.strictEqual(capturedStatus, 404);
    assert.strictEqual(capturedBody.success, false);
    assert.strictEqual(capturedBody.error.code, 'APPOINTMENT_NOT_FOUND');

    memDb.close();
  });

  it('rejects getOffersForAppointment with 400 INVALID_INPUT when appointment ID is missing', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => getOffersForAppointment('', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_INPUT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. APPOINTMENT STATE REVALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part A: Appointment State Revalidation', () => {

  it('rejects missing appointment ID with INVALID_INPUT (400)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => createOffer('', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_INPUT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects nonexistent appointment with APPOINTMENT_NOT_FOUND (404)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => createOffer('apt-nonexistent', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'APPOINTMENT_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects confirmed appointment with INVALID_APPOINTMENT_STATUS (400)', () => {
    const memDb = setupTestDb();

    // apt-004 is confirmed in seed data
    assert.throws(
      () => createOffer('apt-004', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_APPOINTMENT_STATUS');
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /not in cancelled status/i);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects completed appointment with INVALID_APPOINTMENT_STATUS (400)', () => {
    const memDb = setupTestDb();

    // apt-003 is completed in seed data
    assert.throws(
      () => createOffer('apt-003', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_APPOINTMENT_STATUS');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WAITLIST CANDIDATE REVALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part A: Waitlist Candidate Revalidation', () => {

  it('rejects missing waitlist ID with INVALID_INPUT (400)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => createOffer('apt-001', '', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_INPUT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects nonexistent waitlist entry with WAITLIST_NOT_FOUND (404)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => createOffer('apt-001', 'wl-nonexistent', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'WAITLIST_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects waitlist entry not in waiting status with INVALID_WAITLIST_STATUS (400)', () => {
    const memDb = setupTestDb();

    // wl-010 is booked in seed data
    assert.throws(
      () => createOffer('apt-001', 'wl-010', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_WAITLIST_STATUS');
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /expected "waiting"/i);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. LIVE ELIGIBILITY REVALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part A: Live Eligibility Revalidation', () => {

  it('rejects service mismatch with SERVICE_MISMATCH (400)', () => {
    const memDb = setupTestDb();

    // apt-001 is svc-001 (Hair Cut); wl-003 is svc-002 (Colour)
    assert.throws(
      () => createOffer('apt-001', 'wl-003', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'SERVICE_MISMATCH');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate if customer offer consent was revoked (400)', () => {
    const memDb = setupTestDb();

    // Revoke consent for cus-001
    memDb.prepare('UPDATE customers SET consentToOffers = 0 WHERE id = ?').run('cus-001');

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'NO_CUSTOMER_CONSENT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate if waitlist consent was revoked (400)', () => {
    const memDb = setupTestDb();

    // Revoke consent on wl-001
    memDb.prepare('UPDATE waitlist SET consentGiven = 0 WHERE id = ?').run('wl-001');

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'NO_WAITLIST_CONSENT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate when slot date is not in availableDates (400)', () => {
    const memDb = setupTestDb();

    // Exclude 2024-11-20 from wl-001
    memDb.prepare('UPDATE waitlist SET availableDates = ? WHERE id = ?')
      .run(JSON.stringify(['2024-11-25']), 'wl-001');

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'DATE_NOT_AVAILABLE');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate when slot time bucket is not in availableTimeSlots (400)', () => {
    const memDb = setupTestDb();

    // Set wl-001 to only accept evening slots (apt-001 is 10:00 morning)
    memDb.prepare('UPDATE waitlist SET availableTimeSlots = ? WHERE id = ?')
      .run(JSON.stringify(['evening']), 'wl-001');

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'TIME_SLOT_NOT_AVAILABLE');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate when preferred staff does not match and preferAnyStaff = 0 (400)', () => {
    const memDb = setupTestDb();

    // Update wl-001 to prefer stf-002 without preferAnyStaff (apt-001 is stf-001)
    memDb.prepare('UPDATE waitlist SET preferredStaffId = ?, preferAnyStaff = 0 WHERE id = ?')
      .run('stf-002', 'wl-001');

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'STAFF_PREFERENCE_MISMATCH');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects offer creation if staff has an active schedule conflict (409)', () => {
    const memDb = setupTestDb();

    // Add overlapping confirmed appointment for stf-001 on 2024-11-20 at 10:30-11:30
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES
        ('apt-conflict-stf', 'cus-006', 'svc-001', 'stf-001', '2024-11-20', '10:30', '11:30', 'confirmed')
    `).run();

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'STAFF_TIME_CONFLICT');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects offer creation if candidate customer already has an active appointment at that time (409)', () => {
    const memDb = setupTestDb();

    // Add overlapping booking for cus-001 on 2024-11-20 at 10:15-11:15
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES
        ('apt-conflict-cus', 'cus-001', 'svc-004', 'stf-003', '2024-11-20', '10:15', '11:15', 'confirmed')
    `).run();

    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'CUSTOMER_DOUBLE_BOOKED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DUPLICATE ACTIVE OFFER PREVENTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part A: Duplicate Active Offer Prevention', () => {

  it('prevents creating a second active offer for the same waitlist entry and appointment (409)', () => {
    const memDb = setupTestDb();

    // Create first active offer (pending_approval)
    const firstOffer = createOffer('apt-001', 'wl-001', memDb);
    assert.strictEqual(firstOffer.status, 'pending_approval');

    // Attempt to create second offer for same pair
    assert.throws(
      () => createOffer('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'DUPLICATE_ACTIVE_OFFER');
        assert.strictEqual(err.statusCode, 409);
        assert.match(err.message, /active offer/i);
        return true;
      }
    );

    // Verify only 1 offer exists in database
    const offers = getOffers({ appointmentId: 'apt-001', waitlistId: 'wl-001' }, memDb);
    assert.strictEqual(offers.length, 1);

    memDb.close();
  });

  it('allows creating a new offer if prior offer for this pair is in terminal status (e.g. declined/expired)', () => {
    const memDb = setupTestDb();

    // Create first offer and transition to declined
    const first = createOffer('apt-001', 'wl-001', memDb);
    updateOfferStatus(first.id, 'declined', {}, memDb);

    // Now creating a new offer should succeed since the prior is inactive
    const second = createOffer('apt-001', 'wl-001', memDb);
    assert.ok(second.id);
    assert.notStrictEqual(second.id, first.id);
    assert.strictEqual(second.status, 'pending_approval');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. OFFER LIFECYCLE UPDATES & STATUS TRACKING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part A: Offer Lifecycle Updates', () => {

  it('updates offer status to approved and sets approvedAt timestamp', () => {
    const memDb = setupTestDb();
    const offer = createOffer('apt-001', 'wl-001', memDb);
    assert.strictEqual(offer.status, 'pending_approval');
    assert.strictEqual(offer.approvedAt, null);

    const updated = updateOfferStatus(offer.id, 'approved', {}, memDb);
    assert.strictEqual(updated.status, 'approved');
    assert.ok(updated.approvedAt, 'approvedAt must be set');

    memDb.close();
  });

  it('updates offer status to sent and sets sentAt timestamp', () => {
    const memDb = setupTestDb();
    const offer = createOffer('apt-001', 'wl-001', memDb);

    const updated = updateOfferStatus(offer.id, 'sent', {}, memDb);
    assert.strictEqual(updated.status, 'sent');
    assert.ok(updated.sentAt, 'sentAt must be set');
    assert.ok(updated.approvedAt, 'approvedAt must also be populated when sent');

    memDb.close();
  });

  it('updates offer status to declined or expired', () => {
    const memDb = setupTestDb();
    const offer = createOffer('apt-001', 'wl-001', memDb);

    const expired = updateOfferStatus(offer.id, 'expired', {}, memDb);
    assert.strictEqual(expired.status, 'expired');

    memDb.close();
  });

  it('rejects updating with an invalid status string (400)', () => {
    const memDb = setupTestDb();
    const offer = createOffer('apt-001', 'wl-001', memDb);

    assert.throws(
      () => updateOfferStatus(offer.id, 'invalid_status_xyz', {}, memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'INVALID_STATUS');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects updating a nonexistent offer ID with 404', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => updateOfferStatus('off-nonexistent-999', 'approved', {}, memDb),
      (err) => {
        assert.ok(err instanceof OfferError);
        assert.strictEqual(err.code, 'OFFER_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    memDb.close();
  });
});
