/**
 * services/revenueService.js
 *
 * Milestone 3 — Part C: Revenue Tracking and Dashboard Metrics
 *
 * Responsibilities:
 *  1. Calculate total recovered bookings and total recovered revenue from appointments and services.
 *  2. Calculate total offers created, accepted offers, and offer acceptance rate.
 *  3. Calculate appointment recovery rate (recovered vs total historical cancellations).
 *  4. Provide clean service-level revenue breakdown using existing schema without schema modifications.
 *  5. Guard against zero denominators safely, avoiding NaN and Infinity.
 */

'use strict';

const { db } = require('../config/database');

/**
 * Safely compute a percentage and round to 2 decimal places.
 * Returns 0 if denominator is 0.
 *
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
function safePercentage(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100 * 100) / 100;
}

/**
 * Retrieve comprehensive revenue, recovery, and offer performance metrics.
 *
 * @param {object} [targetDb=db] - SQLite DatabaseSync instance
 * @returns {object} Dashboard metrics payload
 */
function getRevenueMetrics(targetDb = db) {
  // 1. Appointments & revenue aggregations
  const appointmentStats = targetDb.prepare(`
    SELECT
      COUNT(CASE WHEN a.status = 'recovered' THEN 1 END) AS recoveredCount,
      COALESCE(SUM(CASE WHEN a.status = 'recovered' THEN s.price ELSE 0 END), 0) AS recoveredRevenue,
      COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancelledCount,
      COALESCE(SUM(CASE WHEN a.status = 'cancelled' THEN s.price ELSE 0 END), 0) AS lostRevenue
    FROM appointments a
    JOIN services s ON a.serviceId = s.id
  `).get() || { recoveredCount: 0, recoveredRevenue: 0, cancelledCount: 0, lostRevenue: 0 };

  const recoveredCount = appointmentStats.recoveredCount || 0;
  const recoveredRevenue = Number(appointmentStats.recoveredRevenue) || 0;
  const cancelledCount = appointmentStats.cancelledCount || 0;
  const lostRevenue = Number(appointmentStats.lostRevenue) || 0;
  const totalCancellations = recoveredCount + cancelledCount;
  const appointmentRecoveryRate = safePercentage(recoveredCount, totalCancellations);

  // 2. Offer aggregations
  const offerStats = targetDb.prepare(`
    SELECT
      COUNT(*) AS totalOffers,
      COUNT(CASE WHEN status = 'accepted' THEN 1 END) AS acceptedOffers,
      COUNT(CASE WHEN status = 'pending_approval' THEN 1 END) AS pendingApprovalOffers,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approvedOffers,
      COUNT(CASE WHEN status = 'sent' THEN 1 END) AS sentOffers,
      COUNT(CASE WHEN status = 'declined' THEN 1 END) AS declinedOffers,
      COUNT(CASE WHEN status = 'expired' THEN 1 END) AS expiredOffers
    FROM offers
  `).get() || {
    totalOffers: 0,
    acceptedOffers: 0,
    pendingApprovalOffers: 0,
    approvedOffers: 0,
    sentOffers: 0,
    declinedOffers: 0,
    expiredOffers: 0,
  };

  const totalOffers = offerStats.totalOffers || 0;
  const acceptedOffers = offerStats.acceptedOffers || 0;
  const offerAcceptanceRate = safePercentage(acceptedOffers, totalOffers);

  // 3. Currency resolution
  const currencyRow = targetDb.prepare('SELECT currency FROM services LIMIT 1').get();
  const currency = currencyRow ? currencyRow.currency : 'PKR';

  // 4. Clean breakdown by service using existing schema
  const serviceRows = targetDb.prepare(`
    SELECT
      s.id AS serviceId,
      s.name AS serviceName,
      s.category,
      s.price,
      s.currency,
      COUNT(CASE WHEN a.status = 'recovered' THEN 1 END) AS recoveredCount,
      COALESCE(SUM(CASE WHEN a.status = 'recovered' THEN s.price ELSE 0 END), 0) AS recoveredRevenue
    FROM services s
    LEFT JOIN appointments a ON s.id = a.serviceId
    GROUP BY s.id, s.name, s.category, s.price, s.currency
    ORDER BY recoveredRevenue DESC, recoveredCount DESC, s.name ASC
  `).all();

  const breakdownByService = serviceRows.map(row => ({
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    category: row.category,
    price: row.price,
    currency: row.currency,
    recoveredCount: row.recoveredCount || 0,
    recoveredRevenue: Number(row.recoveredRevenue) || 0,
  }));

  return {
    currency,
    recoveredBookingsCount: recoveredCount,
    recoveredRevenue,
    cancelledBookingsCount: cancelledCount,
    lostRevenue,
    totalCancellations,
    appointmentRecoveryRate,
    offersCreatedCount: totalOffers,
    offersAcceptedCount: acceptedOffers,
    offerAcceptanceRate,
    offersBreakdownByStatus: {
      pending_approval: offerStats.pendingApprovalOffers || 0,
      approved: offerStats.approvedOffers || 0,
      sent: offerStats.sentOffers || 0,
      accepted: acceptedOffers,
      declined: offerStats.declinedOffers || 0,
      expired: offerStats.expiredOffers || 0,
    },
    breakdownByService,
  };
}

module.exports = {
  getRevenueMetrics,
  safePercentage,
};
