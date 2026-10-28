/**
 * tests/cancellation.test.js
 *
 * Milestone 2 — Part A: Cancellation Detection and Validation Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Uses an in-memory database (:memory:) seeded with Milestone 1 synthetic data.
 * Zero external packages required.
 *
 * Scope:
 *  1. Cancellation detection (identifying cancelled slots from seed data)
 *  2. Pre-cancellation state validation
 *  3. Successful cancellation of confirmed appointments
 *  4. Nonexistent appointment handling
 *  5. Invalid state prevention (e.g. completed appointments)
 *  6. Repeated cancellation prevention & data protection
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const {
  createTables,
  seedAll,
} = require('../config/database');

const {
  getAppointmentById,
  getCancelledAppointments,
  validateCancellation,
  cancelAppointment,
  CancellationError,
} = require('../services/cancellationService');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CANCELLATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part A: Cancellation Detection', () => {

  it('identifies all cancelled appointments from existing seed data', () => {
    const memDb = setupTestDb();
    const cancelled = getCancelledAppointments(memDb);

    assert.ok(Array.isArray(cancelled), 'Should return an array');
    assert.ok(cancelled.length >= 2, 'Seed data contains at least 2 cancelled appointments');

    cancelled.forEach(apt => {
      assert.strictEqual(apt.status, 'cancelled');
      assert.ok(apt.cancelledAt, 'Cancelled appointment must have cancelledAt timestamp');
      assert.ok(typeof apt.cancellationReason === 'string', 'cancellationReason should be a string');
      // Joined fields
      assert.ok(apt.customerName, 'Should join customer name');
      assert.ok(apt.serviceName, 'Should join service name');
      assert.ok(apt.staffName, 'Should join staff name');
    });

    memDb.close();
  });

  it('filters cancelled appointments by specific date', () => {
    const memDb = setupTestDb();
    const cancelledNov20 = getCancelledAppointments(memDb, { date: '2024-11-20' });

    assert.ok(Array.isArray(cancelledNov20));
    assert.strictEqual(cancelledNov20.length, 1);
    assert.strictEqual(cancelledNov20[0].id, 'apt-001');
    assert.strictEqual(cancelledNov20[0].date, '2024-11-20');

    memDb.close();
  });

  it('supports raw mode returning appointment records without joins', () => {
    const memDb = setupTestDb();
    const rawCancelled = getCancelledAppointments(memDb, { raw: true });

    assert.ok(rawCancelled.length >= 2);
    const sample = rawCancelled[0];
    assert.ok(sample.id);
    assert.ok(sample.customerId);
    assert.strictEqual(sample.customerName, undefined, 'Raw mode should not include joined customerName');

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CANCELLATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part A: Pre-Cancellation State Validation', () => {

  it('approves a confirmed appointment for cancellation', () => {
    const memDb = setupTestDb();
    const check = validateCancellation('apt-004', memDb);

    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.appointment.id, 'apt-004');
    assert.strictEqual(check.appointment.status, 'confirmed');
    assert.strictEqual(check.error, undefined);

    memDb.close();
  });

  it('rejects a nonexistent appointment with 404 APPOINTMENT_NOT_FOUND', () => {
    const memDb = setupTestDb();
    const check = validateCancellation('apt-nonexistent-999', memDb);

    assert.strictEqual(check.valid, false);
    assert.strictEqual(check.error.code, 'APPOINTMENT_NOT_FOUND');
    assert.strictEqual(check.error.statusCode, 404);

    memDb.close();
  });

  it('rejects an already cancelled appointment with 409 ALREADY_CANCELLED', () => {
    const memDb = setupTestDb();
    const check = validateCancellation('apt-001', memDb);

    assert.strictEqual(check.valid, false);
    assert.strictEqual(check.error.code, 'ALREADY_CANCELLED');
    assert.strictEqual(check.error.statusCode, 409);
    assert.strictEqual(check.appointment.id, 'apt-001');

    memDb.close();
  });

  it('rejects a completed appointment with 400 INVALID_STATUS', () => {
    const memDb = setupTestDb();
    const check = validateCancellation('apt-003', memDb);

    assert.strictEqual(check.valid, false);
    assert.strictEqual(check.error.code, 'INVALID_STATUS');
    assert.strictEqual(check.error.statusCode, 400);
    assert.match(check.error.message, /already completed/i);

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CANCELLATION EXECUTION & DATA INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 2 — Part A: Cancellation Execution & Data Integrity', () => {

  it('successfully cancels a confirmed appointment with reason and timestamp', () => {
    const memDb = setupTestDb();

    // apt-004 is confirmed in seed data
    const before = getAppointmentById('apt-004', memDb);
    assert.strictEqual(before.status, 'confirmed');
    assert.strictEqual(before.cancelledAt, null);

    const fixedTime = '2024-11-21T10:00:00.000Z';
    const reason = 'Client scheduling conflict';
    const updated = cancelAppointment('apt-004', {
      reason,
      cancelledAt: fixedTime,
      notes: 'Customer notified by phone',
    }, memDb);

    // Verify returned record
    assert.strictEqual(updated.id, 'apt-004');
    assert.strictEqual(updated.status, 'cancelled');
    assert.strictEqual(updated.cancelledAt, fixedTime);
    assert.strictEqual(updated.cancellationReason, reason);
    assert.strictEqual(updated.notes, 'Customer notified by phone');

    // Verify database state directly
    const directCheck = getAppointmentById('apt-004', memDb);
    assert.strictEqual(directCheck.status, 'cancelled');

    // Verify it now appears in getCancelledAppointments()
    const allCancelled = getCancelledAppointments(memDb);
    const found = allCancelled.find(a => a.id === 'apt-004');
    assert.ok(found, 'Newly cancelled appointment must be detected by getCancelledAppointments');

    memDb.close();
  });

  it('defaults cancellation reason and sets ISO timestamp if not explicitly provided', () => {
    const memDb = setupTestDb();

    // apt-007 is confirmed in seed data
    const updated = cancelAppointment('apt-007', {}, memDb);
    assert.strictEqual(updated.status, 'cancelled');
    assert.ok(updated.cancelledAt, 'Should automatically generate cancelledAt timestamp');
    assert.strictEqual(updated.cancellationReason, 'Customer requested cancellation');

    memDb.close();
  });

  it('throws APPOINTMENT_NOT_FOUND when attempting to cancel a nonexistent appointment', () => {
    const memDb = setupTestDb();

    assert.throws(
      () => cancelAppointment('fake-apt-id', {}, memDb),
      (err) => {
        assert.ok(err instanceof CancellationError);
        assert.strictEqual(err.code, 'APPOINTMENT_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    memDb.close();
  });

  it('throws INVALID_STATUS and preserves data when attempting to cancel completed appointment', () => {
    const memDb = setupTestDb();

    const before = getAppointmentById('apt-003', memDb);
    assert.strictEqual(before.status, 'completed');

    assert.throws(
      () => cancelAppointment('apt-003', { reason: 'Try to cancel' }, memDb),
      (err) => {
        assert.ok(err instanceof CancellationError);
        assert.strictEqual(err.code, 'INVALID_STATUS');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    // Verify apt-003 was not modified or corrupted
    const after = getAppointmentById('apt-003', memDb);
    assert.deepStrictEqual(after, before, 'Completed appointment must remain untouched');

    memDb.close();
  });

  it('prevents repeated cancellation and preserves original cancellation data', () => {
    const memDb = setupTestDb();

    // apt-009 is confirmed in seed data
    // First cancellation
    const firstCancelTime = '2024-11-21T09:00:00.000Z';
    const firstReason = 'Initial valid cancellation';
    cancelAppointment('apt-009', {
      reason: firstReason,
      cancelledAt: firstCancelTime,
    }, memDb);

    const firstState = getAppointmentById('apt-009', memDb);
    assert.strictEqual(firstState.status, 'cancelled');
    assert.strictEqual(firstState.cancelledAt, firstCancelTime);
    assert.strictEqual(firstState.cancellationReason, firstReason);

    // Repeated cancellation attempt
    assert.throws(
      () => cancelAppointment('apt-009', {
        reason: 'Overwriting reason should fail',
        cancelledAt: '2024-11-22T12:00:00.000Z',
      }, memDb),
      (err) => {
        assert.ok(err instanceof CancellationError);
        assert.strictEqual(err.code, 'ALREADY_CANCELLED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    // Verify original cancellation timestamp and reason were NOT overwritten
    const stateAfterSecondAttempt = getAppointmentById('apt-009', memDb);
    assert.strictEqual(stateAfterSecondAttempt.cancelledAt, firstCancelTime);
    assert.strictEqual(stateAfterSecondAttempt.cancellationReason, firstReason);

    memDb.close();
  });
});
