/**
 * tests/revenue.test.js
 *
 * Milestone 3 — Part C: Revenue Tracking and Dashboard Metrics Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Isolated in-memory SQLite database (:memory:) seeded with synthetic data.
 * Zero external packages or network dependencies.
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
  getRevenueMetrics,
  safePercentage,
} = require('../services/revenueService');

const {
  createOffer,
} = require('../services/offerService');

const {
  confirmBooking,
} = require('../services/bookingService');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REVENUE & RECOVERY METRICS ON INITIAL SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part C: Revenue Metrics Initial State', () => {

  it('correctly calculates initial zero recovered count and zero recovered revenue', () => {
    const memDb = setupTestDb();
    const metrics = getRevenueMetrics(memDb);

    assert.strictEqual(metrics.recoveredBookingsCount, 0);
    assert.strictEqual(metrics.recoveredRevenue, 0);
    assert.strictEqual(metrics.currency, 'PKR');
    assert.strictEqual(metrics.appointmentRecoveryRate, 0);

    // Initial seed contains 6 cancelled appointments
    assert.strictEqual(metrics.cancelledBookingsCount, 6);
    assert.strictEqual(metrics.totalCancellations, 6);
    assert.ok(metrics.lostRevenue > 0, 'Lost revenue should be sum of cancelled slot prices');

    memDb.close();
  });

  it('correctly reports zero offers and zero acceptance rate on seed data', () => {
    const memDb = setupTestDb();
    const metrics = getRevenueMetrics(memDb);

    assert.strictEqual(metrics.offersCreatedCount, 0);
    assert.strictEqual(metrics.offersAcceptedCount, 0);
    assert.strictEqual(metrics.offerAcceptanceRate, 0);
    assert.strictEqual(metrics.offersBreakdownByStatus.accepted, 0);
    assert.strictEqual(metrics.offersBreakdownByStatus.pending_approval, 0);

    memDb.close();
  });

  it('includes service-level breakdown for all catalog services', () => {
    const memDb = setupTestDb();
    const metrics = getRevenueMetrics(memDb);

    assert.ok(Array.isArray(metrics.breakdownByService));
    assert.strictEqual(metrics.breakdownByService.length, 10, 'Seed data has 10 services');

    metrics.breakdownByService.forEach(svc => {
      assert.ok(svc.serviceId);
      assert.ok(svc.serviceName);
      assert.ok(svc.category);
      assert.ok(svc.price > 0);
      assert.strictEqual(svc.currency, 'PKR');
      assert.strictEqual(svc.recoveredCount, 0);
      assert.strictEqual(svc.recoveredRevenue, 0);
    });

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SAFE ZERO-DENOMINATOR CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part C: Zero-Denominator Handling', () => {

  it('safePercentage returns 0 on zero or negative denominators without NaN or Infinity', () => {
    assert.strictEqual(safePercentage(0, 0), 0);
    assert.strictEqual(safePercentage(5, 0), 0);
    assert.strictEqual(safePercentage(5, -10), 0);
    assert.strictEqual(safePercentage(0, 10), 0);
    assert.strictEqual(safePercentage(1, 3), 33.33);
    assert.strictEqual(safePercentage(1, 2), 50);
  });

  it('handles empty database with zero appointments and zero offers safely', () => {
    const emptyDb = new DatabaseSync(':memory:');
    emptyDb.exec('PRAGMA foreign_keys = ON;');
    createTables(emptyDb); // Empty tables without seed rows

    const metrics = getRevenueMetrics(emptyDb);

    assert.strictEqual(metrics.recoveredBookingsCount, 0);
    assert.strictEqual(metrics.recoveredRevenue, 0);
    assert.strictEqual(metrics.cancelledBookingsCount, 0);
    assert.strictEqual(metrics.totalCancellations, 0);
    assert.strictEqual(metrics.appointmentRecoveryRate, 0);
    assert.strictEqual(metrics.offersCreatedCount, 0);
    assert.strictEqual(metrics.offersAcceptedCount, 0);
    assert.strictEqual(metrics.offerAcceptanceRate, 0);
    assert.strictEqual(metrics.breakdownByService.length, 0);

    emptyDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REVENUE & RECOVERY WORKFLOW INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part C: Workflow Integration & Dynamic Calculation', () => {

  it('updates revenue, recovery rate, and accepted offers when a booking is confirmed', () => {
    const memDb = setupTestDb();

    // 1. Initial baseline
    const initialMetrics = getRevenueMetrics(memDb);
    assert.strictEqual(initialMetrics.recoveredBookingsCount, 0);
    assert.strictEqual(initialMetrics.recoveredRevenue, 0);
    assert.strictEqual(initialMetrics.cancelledBookingsCount, 6);

    // 2. Create offer for apt-001 (svc-001: Hair Cut & Blow-Dry, 2500 PKR) and wl-001
    const offer = createOffer('apt-001', 'wl-001', memDb);
    assert.ok(offer.id);

    const midMetrics = getRevenueMetrics(memDb);
    assert.strictEqual(midMetrics.offersCreatedCount, 1);
    assert.strictEqual(midMetrics.offersAcceptedCount, 0);
    assert.strictEqual(midMetrics.offerAcceptanceRate, 0);

    // 3. Confirm recovery of apt-001 with wl-001
    const confirmResult = confirmBooking('apt-001', 'wl-001', memDb);
    assert.strictEqual(confirmResult.success, true);
    assert.strictEqual(confirmResult.booking.status, 'recovered');

    // 4. Verify updated revenue and metrics
    const finalMetrics = getRevenueMetrics(memDb);

    // Recovered booking count increased from 0 to 1
    assert.strictEqual(finalMetrics.recoveredBookingsCount, 1);

    // Recovered revenue increased by exactly service price (2500 PKR)
    assert.strictEqual(finalMetrics.recoveredRevenue, 2500);

    // Cancelled count decreased by 1 (from 6 to 5)
    assert.strictEqual(finalMetrics.cancelledBookingsCount, 5);

    // Total cancellations remains 6 (1 recovered + 5 currently cancelled)
    assert.strictEqual(finalMetrics.totalCancellations, 6);

    // Appointment recovery rate is 1 / 6 * 100 = 16.67%
    assert.strictEqual(finalMetrics.appointmentRecoveryRate, 16.67);

    // Linked offer transitioned to accepted
    assert.strictEqual(finalMetrics.offersCreatedCount, 1);
    assert.strictEqual(finalMetrics.offersAcceptedCount, 1);
    assert.strictEqual(finalMetrics.offerAcceptanceRate, 100);
    assert.strictEqual(finalMetrics.offersBreakdownByStatus.accepted, 1);

    // Breakdown for svc-001 reflects recovered booking and revenue
    const svc1 = finalMetrics.breakdownByService.find(s => s.serviceId === 'svc-001');
    assert.ok(svc1);
    assert.strictEqual(svc1.recoveredCount, 1);
    assert.strictEqual(svc1.recoveredRevenue, 2500);

    memDb.close();
  });

  it('correctly reflects multiple recoveries across different services and prices', () => {
    const memDb = setupTestDb();

    // Recover apt-001 (svc-001, price: 2500 PKR) with wl-001
    confirmBooking('apt-001', 'wl-001', memDb);

    // Recover apt-002 (svc-003, price: 12000 PKR) with wl-008
    confirmBooking('apt-002', 'wl-008', memDb);

    const metrics = getRevenueMetrics(memDb);

    assert.strictEqual(metrics.recoveredBookingsCount, 2);
    assert.strictEqual(metrics.recoveredRevenue, 14500, '2500 + 12000 = 14500 PKR');
    assert.strictEqual(metrics.cancelledBookingsCount, 4);
    assert.strictEqual(metrics.totalCancellations, 6);
    assert.strictEqual(metrics.appointmentRecoveryRate, 33.33, '2 / 6 = 33.33%');

    // Check top service in breakdown is svc-003 (12000 PKR)
    assert.strictEqual(metrics.breakdownByService[0].serviceId, 'svc-003');
    assert.strictEqual(metrics.breakdownByService[0].recoveredRevenue, 12000);

    assert.strictEqual(metrics.breakdownByService[1].serviceId, 'svc-001');
    assert.strictEqual(metrics.breakdownByService[1].recoveredRevenue, 2500);

    memDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DASHBOARD API ROUTE RESPONSE STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part C: Dashboard Route Contract', () => {

  it('provides complete metrics contract required by the dashboard UI', () => {
    const memDb = setupTestDb();
    const metrics = getRevenueMetrics(memDb);

    // Verify all required dashboard contract fields are present
    const requiredKeys = [
      'currency',
      'recoveredBookingsCount',
      'recoveredRevenue',
      'cancelledBookingsCount',
      'lostRevenue',
      'totalCancellations',
      'appointmentRecoveryRate',
      'offersCreatedCount',
      'offersAcceptedCount',
      'offerAcceptanceRate',
      'offersBreakdownByStatus',
      'breakdownByService',
    ];

    requiredKeys.forEach(key => {
      assert.ok(key in metrics, `Metrics payload must contain key "${key}"`);
    });

    memDb.close();
  });
});
