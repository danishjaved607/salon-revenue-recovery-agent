/**
 * tests/setup.test.js
 *
 * Milestone 1 — Database Initialization & Seed Loading Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Zero external packages required.
 * All database tests run against an in-memory SQLite database (`:memory:`).
 *
 * Scope:
 *  1. Synthetic JSON dataset validation (schema, required fields, constraints)
 *  2. Database schema creation (tables and columns)
 *  3. Safe & idempotent seed loading (first run counts, second run no-op)
 *  4. Relational integrity & foreign key constraints
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const {
  createTables,
  initialise,
  loadJson,
} = require('../config/database');

const DATA_DIR = path.resolve(__dirname, '../data');

function createInMemoryDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SYNTHETIC JSON DATASET VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 1 — Synthetic JSON Datasets', () => {

  it('services.json contains valid records with required attributes', () => {
    const services = loadJson('services.json');
    assert.ok(Array.isArray(services), 'services.json must be an array');
    assert.ok(services.length >= 10, 'Must have at least 10 services');

    services.forEach(s => {
      assert.ok(typeof s.id === 'string' && s.id.startsWith('svc-'), 'Service id must start with svc-');
      assert.ok(typeof s.name === 'string' && s.name.length > 0, 'Service name must be non-empty');
      assert.ok(['hair', 'nails', 'skin', 'massage', 'brows'].includes(s.category), `Unexpected category: ${s.category}`);
      assert.ok(typeof s.durationMinutes === 'number' && s.durationMinutes > 0, 'durationMinutes must be positive');
      assert.ok(typeof s.price === 'number' && s.price > 0, 'price must be positive');
      assert.strictEqual(s.currency, 'PKR', 'currency must be PKR');
    });
  });

  it('staff.json contains valid staff with specializations and schedules', () => {
    const staff = loadJson('staff.json');
    const services = loadJson('services.json');
    const serviceIds = new Set(services.map(s => s.id));

    assert.ok(Array.isArray(staff), 'staff.json must be an array');
    assert.ok(staff.length >= 5, 'Must have at least 5 staff members');

    staff.forEach(st => {
      assert.ok(typeof st.id === 'string' && st.id.startsWith('stf-'), 'Staff id must start with stf-');
      assert.ok(typeof st.name === 'string' && st.name.length > 0, 'Staff name must be non-empty');
      assert.ok(Array.isArray(st.specializations) && st.specializations.length > 0, 'Specializations must not be empty');
      st.specializations.forEach(sId => {
        assert.ok(serviceIds.has(sId), `Staff specialization references unknown service: ${sId}`);
      });
      assert.ok(Array.isArray(st.workingDays) && st.workingDays.length > 0, 'workingDays must not be empty');
      assert.ok(st.workingHours && typeof st.workingHours.start === 'string', 'workingHours.start required');
      assert.ok(st.workingHours && typeof st.workingHours.end === 'string', 'workingHours.end required');
    });
  });

  it('customers.json contains valid customer records with consent flags', () => {
    const customers = loadJson('customers.json');
    assert.ok(Array.isArray(customers), 'customers.json must be an array');
    assert.ok(customers.length >= 10, 'Must have at least 10 customers');

    let consentCount = 0;
    customers.forEach(c => {
      assert.ok(typeof c.id === 'string' && c.id.startsWith('cus-'), 'Customer id must start with cus-');
      assert.ok(typeof c.name === 'string' && c.name.length > 0, 'Customer name must be non-empty');
      assert.ok(typeof c.consentToOffers === 'boolean', 'consentToOffers must be a boolean');
      if (c.consentToOffers) consentCount++;
      assert.ok(['email', 'phone'].includes(c.preferredContactMethod), 'preferredContactMethod must be email or phone');
      assert.ok(Array.isArray(c.bookingHistory), 'bookingHistory must be an array');
    });

    // Ensure realistic variance (both consented and non-consented customers exist)
    assert.ok(consentCount > 0 && consentCount < customers.length, 'Should include both consented and non-consented customers');
  });

  it('appointments.json contains valid appointments with realistic statuses and valid FK references', () => {
    const appointments = loadJson('appointments.json');
    const customers = new Set(loadJson('customers.json').map(c => c.id));
    const services = new Set(loadJson('services.json').map(s => s.id));
    const staff = new Set(loadJson('staff.json').map(st => st.id));

    assert.ok(Array.isArray(appointments), 'appointments.json must be an array');
    assert.ok(appointments.length >= 10, 'Must have at least 10 appointments');

    const validStatuses = ['confirmed', 'cancelled', 'recovered', 'completed'];
    let cancelledCount = 0;

    appointments.forEach(a => {
      assert.ok(typeof a.id === 'string' && a.id.startsWith('apt-'), 'Appointment id must start with apt-');
      assert.ok(customers.has(a.customerId), `Appointment references non-existent customer: ${a.customerId}`);
      assert.ok(services.has(a.serviceId), `Appointment references non-existent service: ${a.serviceId}`);
      assert.ok(staff.has(a.staffId), `Appointment references non-existent staff: ${a.staffId}`);
      assert.ok(validStatuses.includes(a.status), `Invalid appointment status: ${a.status}`);
      if (a.status === 'cancelled') cancelledCount++;
    });

    assert.ok(cancelledCount >= 2, 'Must include cancelled appointments for revenue recovery scenarios');
  });

  it('waitlist.json contains realistic waitlist entries with valid FK references', () => {
    const waitlist = loadJson('waitlist.json');
    const customers = new Set(loadJson('customers.json').map(c => c.id));
    const services = new Set(loadJson('services.json').map(s => s.id));
    const staff = new Set(loadJson('staff.json').map(st => st.id));

    assert.ok(Array.isArray(waitlist), 'waitlist.json must be an array');
    assert.ok(waitlist.length >= 10, 'Must have at least 10 waitlist entries');

    waitlist.forEach(w => {
      assert.ok(typeof w.id === 'string' && w.id.startsWith('wl-'), 'Waitlist id must start with wl-');
      assert.ok(customers.has(w.customerId), `Waitlist references non-existent customer: ${w.customerId}`);
      assert.ok(services.has(w.serviceId), `Waitlist references non-existent service: ${w.serviceId}`);
      if (w.preferredStaffId) {
        assert.ok(staff.has(w.preferredStaffId), `Waitlist references non-existent staff: ${w.preferredStaffId}`);
      }
      assert.ok(Array.isArray(w.availableDates) && w.availableDates.length > 0, 'availableDates must not be empty');
      assert.ok(Array.isArray(w.availableTimeSlots) && w.availableTimeSlots.length > 0, 'availableTimeSlots must not be empty');
      assert.ok(typeof w.priority === 'number' && w.priority >= 1 && w.priority <= 5, 'priority must be 1..5');
      assert.ok(typeof w.consentGiven === 'boolean', 'consentGiven must be a boolean');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DATABASE SCHEMA INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 1 — Database Schema Initialization', () => {

  it('creates all required tables in SQLite', () => {
    const memDb = createInMemoryDb();
    createTables(memDb);

    const tables = memDb.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all().map(r => r.name);

    const requiredTables = ['services', 'staff', 'customers', 'appointments', 'waitlist', 'offers'];
    requiredTables.forEach(tableName => {
      assert.ok(tables.includes(tableName), `Table "${tableName}" should be created`);
    });

    memDb.close();
  });

  it('defines correct columns on services table', () => {
    const memDb = createInMemoryDb();
    createTables(memDb);

    const cols = memDb.prepare('PRAGMA table_info(services)').all().map(c => c.name);
    assert.deepStrictEqual(cols, ['id', 'name', 'category', 'durationMinutes', 'price', 'currency', 'description']);

    memDb.close();
  });

  it('defines correct columns on appointments table', () => {
    const memDb = createInMemoryDb();
    createTables(memDb);

    const cols = memDb.prepare('PRAGMA table_info(appointments)').all().map(c => c.name);
    assert.deepStrictEqual(cols, [
      'id', 'customerId', 'serviceId', 'staffId', 'date',
      'startTime', 'endTime', 'status', 'cancelledAt', 'cancellationReason', 'notes',
    ]);

    memDb.close();
  });

  it('defines correct columns on waitlist table', () => {
    const memDb = createInMemoryDb();
    createTables(memDb);

    const cols = memDb.prepare('PRAGMA table_info(waitlist)').all().map(c => c.name);
    assert.deepStrictEqual(cols, [
      'id', 'customerId', 'serviceId', 'preferredStaffId', 'preferAnyStaff',
      'availableDates', 'availableTimeSlots', 'priority', 'consentGiven', 'addedAt', 'status',
    ]);

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SAFE & IDEMPOTENT SEED LOADING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 1 — Safe & Idempotent Seed Loading', () => {

  it('seeds all tables in dependency order with accurate row counts', () => {
    const memDb = createInMemoryDb();
    const seedResult = initialise(memDb);

    const servicesCount = loadJson('services.json').length;
    const staffCount = loadJson('staff.json').length;
    const customersCount = loadJson('customers.json').length;
    const appointmentsCount = loadJson('appointments.json').length;
    const waitlistCount = loadJson('waitlist.json').length;

    assert.strictEqual(seedResult.services, servicesCount, 'Seeded services count mismatch');
    assert.strictEqual(seedResult.staff, staffCount, 'Seeded staff count mismatch');
    assert.strictEqual(seedResult.customers, customersCount, 'Seeded customers count mismatch');
    assert.strictEqual(seedResult.appointments, appointmentsCount, 'Seeded appointments count mismatch');
    assert.strictEqual(seedResult.waitlist, waitlistCount, 'Seeded waitlist count mismatch');

    // Verify DB counts match JSON counts
    const countQuery = (t) => memDb.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    assert.strictEqual(countQuery('services'), servicesCount);
    assert.strictEqual(countQuery('staff'), staffCount);
    assert.strictEqual(countQuery('customers'), customersCount);
    assert.strictEqual(countQuery('appointments'), appointmentsCount);
    assert.strictEqual(countQuery('waitlist'), waitlistCount);

    memDb.close();
  });

  it('is completely idempotent: re-running initialization does not duplicate rows', () => {
    const memDb = createInMemoryDb();

    // First run
    const firstRun = initialise(memDb);
    assert.ok(firstRun.services > 0);

    const countQuery = (t) => memDb.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    const servicesBefore = countQuery('services');
    const appointmentsBefore = countQuery('appointments');
    const waitlistBefore = countQuery('waitlist');

    // Second run
    const secondRun = initialise(memDb);

    // Each seed function should return 0 new inserts
    assert.strictEqual(secondRun.services, 0, 'Second run should not re-insert services');
    assert.strictEqual(secondRun.staff, 0, 'Second run should not re-insert staff');
    assert.strictEqual(secondRun.customers, 0, 'Second run should not re-insert customers');
    assert.strictEqual(secondRun.appointments, 0, 'Second run should not re-insert appointments');
    assert.strictEqual(secondRun.waitlist, 0, 'Second run should not re-insert waitlist');

    // Counts in tables must remain identical
    assert.strictEqual(countQuery('services'), servicesBefore);
    assert.strictEqual(countQuery('appointments'), appointmentsBefore);
    assert.strictEqual(countQuery('waitlist'), waitlistBefore);

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FOREIGN KEY CONSTRAINT ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 1 — Foreign Key Constraint Enforcement', () => {

  it('rejects appointments referencing a non-existent customer', () => {
    const memDb = createInMemoryDb();
    initialise(memDb);

    const stmt = memDb.prepare(`
      INSERT INTO appointments (id, customerId, serviceId, staffId, date, startTime, endTime, status)
      VALUES ('apt-fake', 'cus-nonexistent', 'svc-001', 'stf-001', '2024-11-20', '10:00', '11:00', 'confirmed')
    `);

    assert.throws(() => {
      stmt.run();
    }, /FOREIGN KEY/i, 'Inserting appointment with invalid customerId should fail FK constraint');

    memDb.close();
  });

  it('rejects waitlist entries referencing a non-existent service', () => {
    const memDb = createInMemoryDb();
    initialise(memDb);

    const stmt = memDb.prepare(`
      INSERT INTO waitlist (id, customerId, serviceId, preferredStaffId, preferAnyStaff, availableDates, availableTimeSlots, priority, consentGiven, addedAt, status)
      VALUES ('wl-fake', 'cus-001', 'svc-nonexistent', NULL, 1, '["2024-11-20"]', '["morning"]', 1, 1, '2024-11-15T10:00:00Z', 'waiting')
    `);

    assert.throws(() => {
      stmt.run();
    }, /FOREIGN KEY/i, 'Inserting waitlist entry with invalid serviceId should fail FK constraint');

    memDb.close();
  });
});
