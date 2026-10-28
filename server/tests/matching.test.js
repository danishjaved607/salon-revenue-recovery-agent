/**
 * tests/matching.test.js
 *
 * Milestone 2 — Part B: Waitlist Matching and Slot Eligibility Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Isolated in-memory SQLite database (:memory:) seeded with Milestone 1 synthetic data.
 * Zero external packages required.
 *
 * Scope:
 *  1. Missing or invalid appointment IDs
 *  2. Service compatibility
 *  3. Customer and waitlist consent
 *  4. Staff qualifications
 *  5. Staff schedules & availability (working days, hours, break, conflict)
 *  6. Customer availability, preferences & double-booking
 *  7. End-to-end matching on synthetic dataset with deterministic ranking
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
  MatchingError,
  timeToMinutes,
  intervalsOverlap,
  getDayOfWeek,
  getTimeBucket,
  checkStaffQualification,
  checkStaffAvailability,
  checkCandidateEligibility,
  findEligibleCandidates,
} = require('../services/matchingService');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. INPUT VALIDATION & APPOINTMENT STATUS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: Input Validation & Appointment Status', () => {

  it('rejects missing or empty appointment ID with INVALID_INPUT (400)', () => {
    const memDb = setupTestDb();
    assert.throws(
      () => findEligibleCandidates('', memDb),
      (err) => {
        assert.ok(err instanceof MatchingError);
        assert.strictEqual(err.code, 'INVALID_INPUT');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
    memDb.close();
  });

  it('rejects nonexistent appointment ID with APPOINTMENT_NOT_FOUND (404)', () => {
    const memDb = setupTestDb();
    assert.throws(
      () => findEligibleCandidates('apt-nonexistent-999', memDb),
      (err) => {
        assert.ok(err instanceof MatchingError);
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
      () => findEligibleCandidates('apt-004', memDb),
      (err) => {
        assert.ok(err instanceof MatchingError);
        assert.strictEqual(err.code, 'INVALID_APPOINTMENT_STATUS');
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /not cancelled/i);
        return true;
      }
    );
    memDb.close();
  });

  it('rejects completed appointment with INVALID_APPOINTMENT_STATUS (400)', () => {
    const memDb = setupTestDb();
    // apt-003 is completed in seed data
    assert.throws(
      () => findEligibleCandidates('apt-003', memDb),
      (err) => {
        assert.ok(err instanceof MatchingError);
        assert.strictEqual(err.code, 'INVALID_APPOINTMENT_STATUS');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SERVICE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: Service Compatibility', () => {

  it('approves candidate requesting the exact service of the cancelled slot', () => {
    const memDb = setupTestDb();
    const result = findEligibleCandidates('apt-001', memDb);

    // apt-001 is svc-001; wl-001 requests svc-001
    const match = result.eligibleCandidates.find(c => c.waitlistId === 'wl-001');
    assert.ok(match, 'wl-001 should be an eligible candidate');
    assert.strictEqual(match.serviceId, 'svc-001');

    memDb.close();
  });

  it('excludes candidates requesting a different service with SERVICE_MISMATCH', () => {
    const memDb = setupTestDb();
    const result = findEligibleCandidates('apt-001', memDb);

    // wl-003 requested svc-002; apt-001 is svc-001
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-003');
    assert.ok(excluded, 'wl-003 should be excluded');
    assert.strictEqual(excluded.reason, 'SERVICE_MISMATCH');
    assert.match(excluded.message, /requested service/i);

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CONSENT VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: Consent Verification', () => {

  it('excludes customers who have consentToOffers = 0 with NO_CUSTOMER_CONSENT', () => {
    const memDb = setupTestDb();

    // Insert a test waitlist entry for cus-003 (who has consentToOffers = 0)
    memDb.prepare(`
      INSERT INTO waitlist
        (id, customerId, serviceId, preferredStaffId, preferAnyStaff, availableDates, availableTimeSlots, priority, consentGiven, addedAt, status)
      VALUES
        ('wl-noconsent-cus', 'cus-003', 'svc-001', 'stf-001', 0, '["2024-11-20"]', '["morning"]', 1, 1, '2024-11-19T00:00:00Z', 'waiting')
    `).run();

    const result = findEligibleCandidates('apt-001', memDb);
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-noconsent-cus');
    assert.ok(excluded, 'Candidate without customer consent must be excluded');
    assert.ok(excluded.allReasons.includes('NO_CUSTOMER_CONSENT'));

    memDb.close();
  });

  it('excludes waitlist entries who have consentGiven = 0 with NO_WAITLIST_CONSENT', () => {
    const memDb = setupTestDb();

    // wl-005 in seed data has consentGiven = false (0)
    // Insert a matching entry for cus-001 with consentGiven = 0
    memDb.prepare(`
      INSERT INTO waitlist
        (id, customerId, serviceId, preferredStaffId, preferAnyStaff, availableDates, availableTimeSlots, priority, consentGiven, addedAt, status)
      VALUES
        ('wl-noconsent-entry', 'cus-001', 'svc-001', 'stf-001', 0, '["2024-11-20"]', '["morning"]', 1, 0, '2024-11-19T00:00:00Z', 'waiting')
    `).run();

    const result = findEligibleCandidates('apt-001', memDb);
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-noconsent-entry');
    assert.ok(excluded, 'Waitlist entry without consentGiven must be excluded');
    assert.ok(excluded.allReasons.includes('NO_WAITLIST_CONSENT'));

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STAFF QUALIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: Staff Qualifications', () => {

  it('verifies staff is qualified when specializations include serviceId', () => {
    const memDb = setupTestDb();
    const staff = memDb.prepare('SELECT * FROM staff WHERE id = ?').get('stf-001');
    const qualified = checkStaffQualification(staff, 'svc-001');
    assert.strictEqual(qualified, true);

    const unqualified = checkStaffQualification(staff, 'svc-004'); // Nails service
    assert.strictEqual(unqualified, false);
    memDb.close();
  });

  it('marks slot as unavailable when assigned staff is not qualified for the service', () => {
    const memDb = setupTestDb();

    // Create cancelled appointment with staff stf-003 (nails) assigned to svc-001 (hair)
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status, cancelledAt, cancellationReason)
      VALUES
        ('apt-test-unqualified', 'cus-001', 'svc-001', 'stf-003', '2024-11-20', '10:00', '11:00', 'cancelled', '2024-11-19T10:00:00Z', 'Testing')
    `).run();

    const result = findEligibleCandidates('apt-test-unqualified', memDb);
    assert.strictEqual(result.staffAssigned.isQualified, false);
    assert.strictEqual(result.slotAvailable, false);
    assert.strictEqual(result.eligibleCandidates.length, 0);

    const firstExcluded = result.excludedCandidates[0];
    assert.strictEqual(firstExcluded.reason, 'STAFF_NOT_QUALIFIED');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STAFF SCHEDULES & AVAILABILITY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: Staff Working Schedules & Conflicts', () => {

  it('flags staff as unavailable when slot falls on a non-working day', () => {
    const memDb = setupTestDb();

    // stf-001 works Mon-Fri. 2024-11-24 is a Sunday.
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status, cancelledAt)
      VALUES
        ('apt-test-sunday', 'cus-001', 'svc-001', 'stf-001', '2024-11-24', '10:00', '11:00', 'cancelled', '2024-11-23T10:00:00Z')
    `).run();

    const result = findEligibleCandidates('apt-test-sunday', memDb);
    assert.strictEqual(result.staffAssigned.isAvailable, false);
    assert.strictEqual(result.slotAvailable, false);
    assert.ok(result.staffAssigned.issues.some(i => i.code === 'STAFF_NOT_WORKING_DAY'));

    memDb.close();
  });

  it('flags staff as unavailable when slot is outside working hours', () => {
    const memDb = setupTestDb();

    // stf-001 working hours: 09:00 - 18:00. Slot: 08:00 - 09:00
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status, cancelledAt)
      VALUES
        ('apt-test-early', 'cus-001', 'svc-001', 'stf-001', '2024-11-20', '08:00', '09:00', 'cancelled', '2024-11-19T10:00:00Z')
    `).run();

    const result = findEligibleCandidates('apt-test-early', memDb);
    assert.strictEqual(result.staffAssigned.isAvailable, false);
    assert.ok(result.staffAssigned.issues.some(i => i.code === 'STAFF_OUTSIDE_WORKING_HOURS'));

    memDb.close();
  });

  it('flags staff as unavailable when slot overlaps with scheduled break', () => {
    const memDb = setupTestDb();

    // stf-001 break: 13:00 - 14:00. Slot: 13:00 - 14:00
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status, cancelledAt)
      VALUES
        ('apt-test-break', 'cus-001', 'svc-001', 'stf-001', '2024-11-20', '13:00', '14:00', 'cancelled', '2024-11-19T10:00:00Z')
    `).run();

    const result = findEligibleCandidates('apt-test-break', memDb);
    assert.strictEqual(result.staffAssigned.isAvailable, false);
    assert.ok(result.staffAssigned.issues.some(i => i.code === 'STAFF_ON_BREAK'));

    memDb.close();
  });

  it('flags staff as unavailable when staff has an active overlapping appointment', () => {
    const memDb = setupTestDb();

    // Add confirmed appointment for stf-001 on 2024-11-20 from 10:30 to 11:30
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES
        ('apt-conflict-staff', 'cus-006', 'svc-001', 'stf-001', '2024-11-20', '10:30', '11:30', 'confirmed')
    `).run();

    // apt-001 is on 2024-11-20 from 10:00 to 11:00 (overlaps with 10:30-11:30)
    const result = findEligibleCandidates('apt-001', memDb);
    assert.strictEqual(result.staffAssigned.isAvailable, false);
    assert.ok(result.staffAssigned.issues.some(i => i.code === 'STAFF_TIME_CONFLICT'));

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CUSTOMER AVAILABILITY, PREFERENCES & CONFLICTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: Customer Availability, Preferences & Conflicts', () => {

  it('excludes candidate when slot date is not in availableDates', () => {
    const memDb = setupTestDb();

    // wl-007 has availableDates: ["2024-11-30"]. apt-001 is 2024-11-20.
    const result = findEligibleCandidates('apt-001', memDb);
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-007');
    assert.ok(excluded.allReasons.includes('DATE_NOT_AVAILABLE'));

    memDb.close();
  });

  it('excludes candidate when slot time bucket is not in availableTimeSlots', () => {
    const memDb = setupTestDb();

    // Insert waitlist entry with availableTimeSlots: ["evening"]
    memDb.prepare(`
      INSERT INTO waitlist
        (id, customerId, serviceId, preferredStaffId, preferAnyStaff, availableDates, availableTimeSlots, priority, consentGiven, addedAt, status)
      VALUES
        ('wl-evening-only', 'cus-001', 'svc-001', 'stf-001', 0, '["2024-11-20"]', '["evening"]', 1, 1, '2024-11-19T00:00:00Z', 'waiting')
    `).run();

    // apt-001 is at 10:00 (morning)
    const result = findEligibleCandidates('apt-001', memDb);
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-evening-only');
    assert.ok(excluded.allReasons.includes('TIME_SLOT_NOT_AVAILABLE'));

    memDb.close();
  });

  it('excludes candidate when preferredStaffId does not match and preferAnyStaff = 0', () => {
    const memDb = setupTestDb();

    // Insert entry preferring stf-002 (Zara) with preferAnyStaff = 0 for apt-001 (stf-001)
    memDb.prepare(`
      INSERT INTO waitlist
        (id, customerId, serviceId, preferredStaffId, preferAnyStaff, availableDates, availableTimeSlots, priority, consentGiven, addedAt, status)
      VALUES
        ('wl-staff-pref', 'cus-001', 'svc-001', 'stf-002', 0, '["2024-11-20"]', '["morning"]', 1, 1, '2024-11-19T00:00:00Z', 'waiting')
    `).run();

    const result = findEligibleCandidates('apt-001', memDb);
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-staff-pref');
    assert.ok(excluded.allReasons.includes('STAFF_PREFERENCE_MISMATCH'));

    memDb.close();
  });

  it('accepts candidate when preferAnyStaff = 1 even with null preferredStaffId', () => {
    const memDb = setupTestDb();
    // wl-002 has preferAnyStaff: true, preferredStaffId: null
    const result = findEligibleCandidates('apt-001', memDb);
    const match = result.eligibleCandidates.find(c => c.waitlistId === 'wl-002');
    assert.ok(match, 'wl-002 must be eligible due to preferAnyStaff = true');

    memDb.close();
  });

  it('excludes candidate who already has a conflicting active appointment', () => {
    const memDb = setupTestDb();

    // Give cus-001 an active appointment at 10:00 - 11:00 on 2024-11-20
    memDb.prepare(`
      INSERT INTO appointments
        (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES
        ('apt-cus-conflict', 'cus-001', 'svc-004', 'stf-003', '2024-11-20', '10:00', '11:00', 'confirmed')
    `).run();

    const result = findEligibleCandidates('apt-001', memDb);
    // wl-001 belongs to cus-001
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-001');
    assert.ok(excluded, 'cus-001 must be excluded due to conflicting booking');
    assert.ok(excluded.allReasons.includes('CUSTOMER_DOUBLE_BOOKED'));

    memDb.close();
  });

  it('excludes waitlist entries that are not in waiting status (e.g. booked)', () => {
    const memDb = setupTestDb();
    // wl-010 has status: "booked"
    const result = findEligibleCandidates('apt-001', memDb);
    const excluded = result.excludedCandidates.find(c => c.waitlistId === 'wl-010');
    assert.ok(excluded.allReasons.includes('WAITLIST_NOT_WAITING'));

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. END-TO-END MATCHING & DETERMINISTIC RANKING ON SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part B: End-to-End Matching & Ranking', () => {

  it('identifies and ranks eligible candidates in priority order (priority ASC, addedAt ASC)', () => {
    const memDb = setupTestDb();
    const result = findEligibleCandidates('apt-001', memDb);

    assert.strictEqual(result.slotAvailable, true);
    assert.strictEqual(result.slot.appointmentId, 'apt-001');
    assert.strictEqual(result.slot.date, '2024-11-20');
    assert.strictEqual(result.slot.dayOfWeek, 'Wed');
    assert.strictEqual(result.slot.timeBucket, 'morning');

    assert.strictEqual(result.staffAssigned.isQualified, true);
    assert.strictEqual(result.staffAssigned.isAvailable, true);

    // Seed data has wl-001 (priority 1) and wl-002 (priority 2) matching apt-001
    assert.strictEqual(result.eligibleCandidates.length, 2);
    assert.strictEqual(result.eligibleCandidates[0].waitlistId, 'wl-001');
    assert.strictEqual(result.eligibleCandidates[0].priority, 1);
    assert.strictEqual(result.eligibleCandidates[1].waitlistId, 'wl-002');
    assert.strictEqual(result.eligibleCandidates[1].priority, 2);

    // Summary counts match
    assert.strictEqual(result.summary.totalChecked, 10);
    assert.strictEqual(result.summary.eligibleCount, 2);
    assert.strictEqual(result.summary.excludedCount, 8);

    memDb.close();
  });

  it('provides detailed explanation for every excluded candidate', () => {
    const memDb = setupTestDb();
    const result = findEligibleCandidates('apt-001', memDb);

    result.excludedCandidates.forEach(excluded => {
      assert.ok(excluded.waitlistId, 'Must have waitlistId');
      assert.ok(excluded.customerId, 'Must have customerId');
      assert.ok(excluded.reason, 'Must have primary reason code');
      assert.ok(typeof excluded.message === 'string' && excluded.message.length > 0, 'Must have human readable explanation');
      assert.ok(Array.isArray(excluded.allReasons) && excluded.allReasons.length > 0, 'Must list all failure reasons');
    });

    memDb.close();
  });
});
