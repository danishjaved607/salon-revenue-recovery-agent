/**
 * services/replySimulator.js
 *
 * Milestone 4 — Part C: Simulated Customer Replies & Booking Confirmation
 *
 * Responsibilities:
 *  1. Process simulated customer responses:
 *     - YES: Customer accepts the offer -> executes booking confirmation through
 *            bookingService.confirmBooking(), transitioning appointment to 'recovered',
 *            waitlist entry to 'booked', and offer to 'accepted'.
 *     - NO: Customer declines the offer -> marks offer as 'declined', preserves
 *           appointment in 'cancelled' status without creating a booking.
 *     - NO_REPLY: Customer does not respond -> marks offer as 'no_reply', preserves
 *                 appointment in 'cancelled' status without creating a booking.
 *  2. Enforce human approval & offer lifecycle gating:
 *     - Only offers in 'sent' status can receive customer replies.
 *     - Offers in 'pending_approval' or 'approved' are rejected with INVALID_OFFER_STATUS (400).
 *  3. Guard against duplicate response processing:
 *     - Offers already processed ('accepted', 'declined', 'no_reply') or 'expired'
 *       are rejected with OFFER_ALREADY_PROCESSED (409) / OFFER_EXPIRED (409).
 *  4. Transactional integrity & double-booking prevention:
 *     - Operates within immediate SQLite transaction (BEGIN IMMEDIATE).
 *     - Concurrent attempts to accept competing offers for the same slot safely fail
 *       via live slot status revalidation in bookingService.confirmBooking.
 *  5. Revalidate appointment and waitlist conditions:
 *     - Customer consent, schedules, and staff qualifications are verified against
 *       live database state before confirming any booking.
 */

'use strict';

const { db } = require('../config/database');
const { getOfferById, updateOfferStatus, OfferError } = require('./offerService');
const { confirmBooking, BookingConfirmationError } = require('./bookingService');

class ReplySimulationError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'ReplySimulationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Execute a callback within an immediate SQLite transaction.
 *
 * @param {object} targetDb - SQLite DatabaseSync instance
 * @param {Function} fn - Operation to execute
 * @returns {*} Result of fn()
 */
function withTransaction(targetDb, fn) {
  let started = false;
  try {
    targetDb.exec('BEGIN IMMEDIATE;');
    started = true;
  } catch (err) {
    if (/cannot start a transaction/i.test(err.message)) {
      started = false;
    } else {
      throw err;
    }
  }

  try {
    const result = fn();
    if (started) {
      targetDb.exec('COMMIT;');
    }
    return result;
  } catch (err) {
    if (started) {
      try {
        targetDb.exec('ROLLBACK;');
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Process a simulated customer reply for an offer.
 *
 * @param {string} offerId - Target offer ID
 * @param {string} reply - 'YES' | 'NO' | 'NO_REPLY'
 * @param {object|DatabaseSync} [optionsOrDb={}] - Options (e.g. timestamp, notes) or database instance
 * @param {DatabaseSync} [maybeDb] - SQLite database instance
 * @returns {object} Structured outcome
 * @throws {ReplySimulationError|BookingConfirmationError|OfferError}
 */
function simulateCustomerReply(offerId, reply, optionsOrDb = {}, maybeDb = undefined) {
  let targetDb = db;
  let options = {};

  if (optionsOrDb && typeof optionsOrDb.prepare === 'function') {
    targetDb = optionsOrDb;
  } else {
    options = optionsOrDb || {};
    if (maybeDb && typeof maybeDb.prepare === 'function') {
      targetDb = maybeDb;
    }
  }

  if (!offerId || typeof offerId !== 'string') {
    throw new ReplySimulationError('A valid offer ID must be provided.', 'INVALID_INPUT', 400);
  }

  const normalizedReply = typeof reply === 'string' ? reply.trim().toUpperCase() : '';
  const validReplies = ['YES', 'NO', 'NO_REPLY'];
  if (!validReplies.includes(normalizedReply)) {
    throw new ReplySimulationError(
      `Invalid reply "${reply}". Allowed reply values: YES, NO, NO_REPLY.`,
      'INVALID_REPLY',
      400
    );
  }

  return withTransaction(targetDb, () => {
    // 1. Fetch current offer state
    const offer = getOfferById(offerId, targetDb);
    if (!offer) {
      throw new ReplySimulationError(
        `Offer with ID "${offerId}" does not exist.`,
        'OFFER_NOT_FOUND',
        404
      );
    }

    // 2. Guard against duplicate response processing
    if (['accepted', 'declined', 'no_reply'].includes(offer.status)) {
      throw new ReplySimulationError(
        `Cannot process reply: offer "${offerId}" has already been processed with status "${offer.status}".`,
        'OFFER_ALREADY_PROCESSED',
        409
      );
    }

    if (offer.status === 'expired') {
      throw new ReplySimulationError(
        `Cannot process reply: offer "${offerId}" has expired.`,
        'OFFER_EXPIRED',
        409
      );
    }

    // 3. Human approval & sending requirement: offers must be 'sent' before receiving a customer response
    if (offer.status !== 'sent') {
      throw new ReplySimulationError(
        `Cannot process reply: offer "${offerId}" is in status "${offer.status}". Offers must be in "sent" status to receive a customer response.`,
        'INVALID_OFFER_STATUS',
        400
      );
    }

    const timestamp = options.timestamp || options.respondedAt || new Date().toISOString();

    // 4. Branch on reply value
    if (normalizedReply === 'YES') {
      // Connect to existing bookingService.confirmBooking workflow
      const bookingNotes = options.notes
        ? options.notes
        : `Recovered via customer YES response to offer ${offer.id}`;

      const bookingResult = confirmBooking(
        offer.appointmentId,
        offer.waitlistId,
        {
          notes: bookingNotes,
          confirmedAt: timestamp,
        },
        targetDb
      );

      const refreshedOffer = getOfferById(offer.id, targetDb);

      return {
        success: true,
        message: `Customer accepted offer "${offer.id}". Recovery booking successfully confirmed for appointment "${offer.appointmentId}".`,
        reply: 'YES',
        status: 'accepted',
        appointmentRecovered: true,
        offer: refreshedOffer,
        booking: bookingResult,
      };
    }

    if (normalizedReply === 'NO') {
      const updatedOffer = updateOfferStatus(
        offer.id,
        'declined',
        { respondedAt: timestamp },
        targetDb
      );

      return {
        success: true,
        message: `Customer declined offer "${offer.id}". Appointment remains cancelled.`,
        reply: 'NO',
        status: 'declined',
        appointmentRecovered: false,
        offer: updatedOffer,
      };
    }

    if (normalizedReply === 'NO_REPLY') {
      const updatedOffer = updateOfferStatus(
        offer.id,
        'no_reply',
        { respondedAt: timestamp },
        targetDb
      );

      return {
        success: true,
        message: `No response recorded for offer "${offer.id}". Appointment remains cancelled.`,
        reply: 'NO_REPLY',
        status: 'no_reply',
        appointmentRecovered: false,
        offer: updatedOffer,
      };
    }
  });
}

module.exports = {
  simulateCustomerReply,
  ReplySimulationError,
  withTransaction,
};
