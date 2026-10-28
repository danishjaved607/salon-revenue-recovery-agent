/**
 * tests/booking.test.js
 *
 * Milestone 2 — Part C: Safe Booking Confirmation and Double-Booking Prevention Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Isolated in-memory SQLite database (:memory:) seeded with Milestone 1 synthetic data.
 * Zero external packages required.
 *
 * Scope:
 *  1. Successful booking confirmation & slot recovery
 *  2. Missing IDs & invalid appointment / waitlist status
 *  3. Ineligible candidate revalidation (service, consent, date, time bucket, preference)
 *  4. Staff qualification & schedule / active appointment conflicts
 *  5. Customer double-booking conflict prevention
 *  6. Duplicate confirmation prevention (slot & waitlist entry)
 *  7. Transactional integrity and competing confirmation requests
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
  BookingConfirmationError,
  confirmBooking,
} = require('../services/bookingService');

const {
  getAppointmentById,
} = require('../services/cancellationService');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SUCCESSFUL BOOKING CONFIRMATION & SLOT RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Successful Confirmation & State Transitions', () => {

  it('successfully recovers a cancelled slot and books an eligible waitlist candidate', () => {
    const memDb = setupTestDb();

    // apt-001 is cancelled (svc-001, stf-001, 2024-11-20 10:00-11:00)
    // wl-001 is waiting (cus-001, svc-001, preferredStaffId: stf-001, priority 1)
    const result = confirmBooking('apt-001', 'wl-001', memDb);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.booking.appointmentId, 'apt-001');
    assert.strictEqual(result.booking.status, 'recovered');
    assert.strictEqual(result.booking.customerId, 'cus-001');
    assert.strictEqual(result.booking.waitlistId, 'wl-001');
    assert.ok(result.booking.confirmedAt);

    // Verify database state for appointment
    const directApt = getAppointmentById('apt-001', memDb);
    assert.strictEqual(directApt.status, 'recovered');
    assert.strictEqual(directApt.customerId, 'cus-001');
    assert.match(directApt.notes, /Recovered from waitlist entry wl-001/);

    // Verify database state for waitlist
    const directWl = memDb.prepare('SELECT * FROM waitlist WHERE id = ?').get('wl-001');
    assert.strictEqual(directWl.status, 'booked');

    // Verify customer bookingHistory updated
    const customer = memDb.prepare('SELECT * FROM customers WHERE id = ?').get('cus-001');
    const history = JSON.parse(customer.bookingHistory);
    assert.ok(history.includes('apt-001'), 'Customer bookingHistory must include recovered appointment ID');

    memDb.close();
  });

  it('updates matching offer status to accepted if an offer exists', () => {
    const memDb = setupTestDb();

    // Insert an offer record for wl-001 and apt-001
    memDb.prepare(`
      INSERT INTO offers
        (id, waitlistId, appointmentId, customerId, messageText, status, generatedAt, aiGenerated)
      VALUES
        ('off-test-01', 'wl-001', 'apt-001', 'cus-001', 'Slot offer text', 'sent', '2024-11-19T09:00:00Z', 0)
    `).run();

    confirmBooking('apt-001', 'wl-001', memDb);

    const offer = memDb.prepare('SELECT * FROM offers WHERE id = ?').get('off-test-01');
    assert.strictEqual(offer.status, 'accepted');
    assert.ok(offer.respondedAt, 'Offer must have respondedAt timestamp');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. INPUT VALIDATION & INVALID STATUSES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Input Validation & Invalid Statuses', () => {

  it('rejects missing appointmentId or waitlistId with INVALID_INPUT (400)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => confirmBooking('', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'INVALID_INPUT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    assert.throws(
      () => confirmBooking('apt-001', '', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
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
      () => confirmBooking('apt-ghost-999', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
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
      () => confirmBooking('apt-004', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
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
      () => confirmBooking('apt-003', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'INVALID_APPOINTMENT_STATUS');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects nonexistent waitlist entry with WAITLIST_NOT_FOUND (404)', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => confirmBooking('apt-001', 'wl-ghost-999', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'WAITLIST_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INELIGIBLE WAITLIST CANDIDATE REVALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Ineligible Candidate Revalidation', () => {

  it('rejects service mismatch with SERVICE_MISMATCH (400)', () => {
    const memDb = setupTestDb();

    // apt-001 is svc-001 (Hair Cut); wl-003 is svc-002 (Colour)
    assert.throws(
      () => confirmBooking('apt-001', 'wl-003', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
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
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'NO_CUSTOMER_CONSENT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    // Verify appointment was not modified
    const apt = getAppointmentById('apt-001', memDb);
    assert.strictEqual(apt.status, 'cancelled');

    memDb.close();
  });

  it('rejects candidate if waitlist consent was not given (400)', () => {
    const memDb = setupTestDb();

    // Revoke consent on wl-001
    memDb.prepare('UPDATE waitlist SET consentGiven = 0 WHERE id = ?').run('wl-001');

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'NO_WAITLIST_CONSENT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate if slot date is not in customer availableDates (400)', () => {
    const memDb = setupTestDb();

    // Update wl-001 availableDates to exclude 2024-11-20
    memDb.prepare('UPDATE waitlist SET availableDates = ? WHERE id = ?')
      .run(JSON.stringify(['2024-11-25']), 'wl-001');

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'DATE_NOT_AVAILABLE');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate if slot time bucket does not match availableTimeSlots (400)', () => {
    const memDb = setupTestDb();

    // Update wl-001 availableTimeSlots to only evening (apt-001 is 10:00 morning)
    memDb.prepare('UPDATE waitlist SET availableTimeSlots = ? WHERE id = ?')
      .run(JSON.stringify(['evening']), 'wl-001');

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'TIME_SLOT_NOT_AVAILABLE');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects candidate if preferred staff does not match and preferAnyStaff = 0 (400)', () => {
    const memDb = setupTestDb();

    // Update wl-001 to prefer stf-002 with preferAnyStaff = 0 (apt-001 is stf-001)
    memDb.prepare('UPDATE waitlist SET preferredStaffId = ?, preferAnyStaff = 0 WHERE id = ?')
      .run('stf-002', 'wl-001');

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'STAFF_PREFERENCE_MISMATCH');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STAFF CONFLICT & QUALIFICATION CHECKS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Staff Qualifications & Time Conflicts', () => {

  it('rejects confirmation if assigned staff is not qualified for the service (400)', () => {
    const memDb = setupTestDb();

    // Alter staff stf-001 specializations to exclude svc-001
    memDb.prepare('UPDATE staff SET specializations = ? WHERE id = ?')
      .run(JSON.stringify(['svc-004']), 'stf-001');

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'STAFF_NOT_QUALIFIED');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    memDb.close();
  });

  it('rejects confirmation and rolls back if staff has a conflicting active appointment (409)', () => {
    const memDb = setupTestDb();

    // Add a conflicting confirmed appointment for stf-001 on 2024-11-20 at 10:30 - 11:30
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES
        ('apt-conflict-staff-01', 'cus-006', 'svc-001', 'stf-001', '2024-11-20', '10:30', '11:30', 'confirmed')
    `).run();

    // apt-001 is 10:00 - 11:00 on 2024-11-20 (overlaps)
    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'STAFF_TIME_CONFLICT');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Verify rollback: apt-001 is still cancelled, wl-001 is still waiting
    const apt = getAppointmentById('apt-001', memDb);
    assert.strictEqual(apt.status, 'cancelled');

    const wl = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-001');
    assert.strictEqual(wl.status, 'waiting');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CUSTOMER DOUBLE-BOOKING CONFLICTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Customer Double-Booking Prevention', () => {

  it('rejects confirmation and rolls back if candidate has a conflicting active appointment (409)', () => {
    const memDb = setupTestDb();

    // cus-001 already has another confirmed appointment at 10:15 - 11:15 on 2024-11-20
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES
        ('apt-conflict-cus-01', 'cus-001', 'svc-004', 'stf-003', '2024-11-20', '10:15', '11:15', 'confirmed')
    `).run();

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'CUSTOMER_DOUBLE_BOOKED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Verify rollback
    const apt = getAppointmentById('apt-001', memDb);
    assert.strictEqual(apt.status, 'cancelled');

    const wl = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-001');
    assert.strictEqual(wl.status, 'waiting');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DUPLICATE CONFIRMATION PREVENTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Duplicate Confirmation Prevention', () => {

  it('prevents repeated confirmation of an already-recovered appointment slot (409)', () => {
    const memDb = setupTestDb();

    // First confirmation succeeds
    confirmBooking('apt-001', 'wl-001', memDb);

    // Second confirmation attempt on apt-001 with wl-002
    assert.throws(
      () => confirmBooking('apt-001', 'wl-002', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'SLOT_ALREADY_CONFIRMED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Verify wl-002 was not corrupted and remains in waiting status
    const wl2 = memDb.prepare('SELECT status FROM waitlist WHERE id = ?').get('wl-002');
    assert.strictEqual(wl2.status, 'waiting');

    memDb.close();
  });

  it('prevents reusing an already-booked waitlist entry for another slot (409)', () => {
    const memDb = setupTestDb();

    // Book wl-001 into apt-001
    confirmBooking('apt-001', 'wl-001', memDb);

    // Create another cancelled slot suitable for svc-001
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status, cancelledAt)
      VALUES
        ('apt-test-second-slot', 'cus-007', 'svc-001', 'stf-001', '2024-11-21', '10:00', '11:00', 'cancelled', '2024-11-20T10:00:00Z')
    `).run();

    // Attempting to book wl-001 again into second slot must fail
    assert.throws(
      () => confirmBooking('apt-test-second-slot', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.code, 'WAITLIST_ALREADY_BOOKED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Verify second slot remains cancelled and untouched
    const apt2 = getAppointmentById('apt-test-second-slot', memDb);
    assert.strictEqual(apt2.status, 'cancelled');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. COMPETING CONFIRMATIONS & CONCURRENCY SAFEGUARDS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part C: Competing Confirmation Requests & Atomicity', () => {

  it('ensures only one of two competing requests claims a cancelled slot', () => {
    const memDb = setupTestDb();

    // Two candidates wl-001 and wl-002 are eligible for apt-001
    // Request 1 arrives and executes
    const firstOutcome = confirmBooking('apt-001', 'wl-001', memDb);
    assert.strictEqual(firstOutcome.success, true);
    assert.strictEqual(firstOutcome.booking.customerId, 'cus-001');

    // Request 2 arrives competing for the same slot
    assert.throws(
      () => confirmBooking('apt-001', 'wl-002', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Verify slot remains assigned to Request 1
    const apt = getAppointmentById('apt-001', memDb);
    assert.strictEqual(apt.customerId, 'cus-001');
    assert.strictEqual(apt.status, 'recovered');

    memDb.close();
  });

  it('guarded UPDATE rolls back and raises CONCURRENT_MODIFICATION if state changed under race', () => {
    const memDb = setupTestDb();

    // If appointment is already recovered, confirmation rejects with 409
    memDb.prepare("UPDATE appointments SET status = 'recovered' WHERE id = ?").run('apt-001');

    assert.throws(
      () => confirmBooking('apt-001', 'wl-001', memDb),
      (err) => {
        assert.ok(err instanceof BookingConfirmationError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'SLOT_ALREADY_CONFIRMED');
        return true;
      }
    );

    memDb.close();
  });
});
