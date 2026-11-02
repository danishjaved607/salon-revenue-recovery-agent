/**
 * services/offerService.js
 *
 * Milestone 3 — Part A: Appointment Offer Creation and Tracking
 *
 * Responsibilities:
 *  1. Record offers linking an eligible waitlist candidate to a cancelled appointment slot.
 *  2. Revalidate live database conditions (appointment status, waitlist status, customer consent,
 *     service match, staff qualification and schedule availability, customer schedule conflict)
 *     before creating an offer.
 *  3. Prevent duplicate active offers ('pending_approval', 'approved', 'sent') for the same waitlist
 *     entry and cancelled appointment.
 *  4. Store creation timestamp in 'generatedAt' conforming strictly to the existing SQLite schema.
 *  5. Query and track offers with filtering by appointmentId, waitlistId, customerId, or status.
 *  6. Provide lifecycle status updates ('pending_approval' -> 'approved' -> 'sent' -> 'accepted'/'declined'/'expired').
 */

'use strict';

const { randomUUID } = require('node:crypto');
const { db } = require('../config/database');
const { getAppointmentById } = require('./cancellationService');
const {
  checkStaffQualification,
  checkStaffAvailability,
  checkCandidateEligibility,
} = require('./matchingService');
const {
  generateFallbackMessage,
  draftOfferMessage,
} = require('./messageDraftingService');

class OfferError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'OfferError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Execute a callback within an immediate SQLite transaction.
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
 * Retrieve an offer by its ID, joined with customer, appointment, service, and staff metadata.
 *
 * @param {string} id - Offer ID
 * @param {object} [targetDb=db] - SQLite database instance
 * @returns {object|null}
 */
function getOfferById(id, targetDb = db) {
  if (!id || typeof id !== 'string') return null;

  return targetDb.prepare(`
    SELECT
      o.id,
      o.waitlistId,
      o.appointmentId,
      o.customerId,
      o.messageText,
      o.status,
      o.generatedAt,
      o.approvedAt,
      o.sentAt,
      o.respondedAt,
      o.aiGenerated,
      c.name AS customerName,
      c.phone AS customerPhone,
      c.email AS customerEmail,
      a.date AS appointmentDate,
      a.startTime AS appointmentStartTime,
      a.endTime AS appointmentEndTime,
      s.name AS serviceName,
      st.name AS staffName
    FROM offers o
    LEFT JOIN customers c ON o.customerId = c.id
    LEFT JOIN appointments a ON o.appointmentId = a.id
    LEFT JOIN services s ON a.serviceId = s.id
    LEFT JOIN staff st ON a.staffId = st.id
    WHERE o.id = ?
  `).get(id) || null;
}

/**
 * Query offers with optional filters.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.appointmentId]
 * @param {string} [filters.waitlistId]
 * @param {string} [filters.customerId]
 * @param {string} [filters.status]
 * @param {object} [targetDb=db]
 * @returns {Array<object>}
 */
function getOffers(filters = {}, targetDb = db) {
  let query = `
    SELECT
      o.id,
      o.waitlistId,
      o.appointmentId,
      o.customerId,
      o.messageText,
      o.status,
      o.generatedAt,
      o.approvedAt,
      o.sentAt,
      o.respondedAt,
      o.aiGenerated,
      c.name AS customerName,
      c.phone AS customerPhone,
      c.email AS customerEmail,
      a.date AS appointmentDate,
      a.startTime AS appointmentStartTime,
      a.endTime AS appointmentEndTime,
      s.name AS serviceName,
      st.name AS staffName
    FROM offers o
    LEFT JOIN customers c ON o.customerId = c.id
    LEFT JOIN appointments a ON o.appointmentId = a.id
    LEFT JOIN services s ON a.serviceId = s.id
    LEFT JOIN staff st ON a.staffId = st.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.appointmentId) {
    query += ' AND o.appointmentId = ?';
    params.push(filters.appointmentId);
  }
  if (filters.waitlistId) {
    query += ' AND o.waitlistId = ?';
    params.push(filters.waitlistId);
  }
  if (filters.customerId) {
    query += ' AND o.customerId = ?';
    params.push(filters.customerId);
  }
  if (filters.status) {
    query += ' AND o.status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY o.generatedAt DESC';
  return targetDb.prepare(query).all(...params);
}

/**
 * Create a new offer for an eligible waitlist candidate on a cancelled appointment slot.
 *
 * @param {string} appointmentId - Cancelled appointment ID
 * @param {string} waitlistId - Eligible waitlist entry ID
 * @param {object|DatabaseSync} [optionsOrDb={}] - Optional messageText, status, timestamps, or db
 * @param {DatabaseSync} [maybeDb] - SQLite database instance
 * @returns {object} The created offer record
 * @throws {OfferError} On validation failure, conflict, or duplicate active offer
 */
function createOffer(appointmentId, waitlistId, optionsOrDb = {}, maybeDb = undefined) {
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

  if (!appointmentId || typeof appointmentId !== 'string') {
    throw new OfferError('A valid appointment ID must be provided.', 'INVALID_INPUT', 400);
  }
  if (!waitlistId || typeof waitlistId !== 'string') {
    throw new OfferError('A valid waitlist ID must be provided.', 'INVALID_INPUT', 400);
  }

  return withTransaction(targetDb, () => {
    // 1. Revalidate appointment state
    const appointment = getAppointmentById(appointmentId, targetDb);
    if (!appointment) {
      throw new OfferError(
        `Appointment with ID "${appointmentId}" does not exist.`,
        'APPOINTMENT_NOT_FOUND',
        404
      );
    }

    if (appointment.status !== 'cancelled') {
      throw new OfferError(
        `Cannot create offer: appointment "${appointmentId}" is not in cancelled status (current status: "${appointment.status}").`,
        'INVALID_APPOINTMENT_STATUS',
        400
      );
    }

    // 2. Revalidate waitlist candidate state
    const candidate = targetDb.prepare(`
      SELECT
        w.id,
        w.customerId,
        w.serviceId,
        w.preferredStaffId,
        w.preferAnyStaff,
        w.availableDates,
        w.availableTimeSlots,
        w.priority,
        w.consentGiven,
        w.addedAt,
        w.status,
        c.name AS customerName,
        c.phone AS customerPhone,
        c.email AS customerEmail,
        c.consentToOffers AS customerConsentToOffers,
        c.bookingHistory AS customerBookingHistory,
        s.name AS serviceName,
        s.category AS serviceCategory,
        s.durationMinutes AS serviceDurationMinutes,
        s.price AS servicePrice,
        s.currency AS serviceCurrency
      FROM waitlist w
      JOIN customers c ON w.customerId = c.id
      JOIN services s  ON w.serviceId = s.id
      WHERE w.id = ?
    `).get(waitlistId);

    if (!candidate) {
      throw new OfferError(
        `Waitlist entry with ID "${waitlistId}" does not exist.`,
        'WAITLIST_NOT_FOUND',
        404
      );
    }

    if (candidate.status !== 'waiting') {
      throw new OfferError(
        `Cannot create offer: waitlist entry "${waitlistId}" is in "${candidate.status}" status, expected "waiting".`,
        'INVALID_WAITLIST_STATUS',
        400
      );
    }

    // 3. Revalidate staff qualification and schedule availability
    const staff = targetDb.prepare('SELECT * FROM staff WHERE id = ?').get(appointment.staffId);
    appointment.staffName = staff ? staff.name : appointment.staffId;
    const service = targetDb.prepare('SELECT * FROM services WHERE id = ?').get(appointment.serviceId);
    appointment.serviceName = service ? service.name : appointment.serviceId;

    const isStaffQualified = staff ? checkStaffQualification(staff, appointment.serviceId) : false;
    if (!isStaffQualified) {
      throw new OfferError(
        `Assigned staff member "${staff ? staff.name : appointment.staffId}" is not qualified to perform service "${appointment.serviceName}".`,
        'STAFF_NOT_QUALIFIED',
        400
      );
    }

    const staffAvailability = checkStaffAvailability(
      staff,
      appointment.date,
      appointment.startTime,
      appointment.endTime,
      targetDb,
      appointment.id
    );

    if (!staffAvailability.isAvailable) {
      const primaryIssue = staffAvailability.issues[0];
      const isConflict = primaryIssue.code === 'STAFF_TIME_CONFLICT';
      throw new OfferError(
        primaryIssue.message,
        primaryIssue.code,
        isConflict ? 409 : 400
      );
    }

    // 4. Revalidate candidate eligibility (service, consent, dates, time bucket, preferences, customer conflicts)
    const candidateEvaluation = checkCandidateEligibility(candidate, appointment, targetDb);
    if (!candidateEvaluation.isEligible) {
      const primaryIssue = candidateEvaluation.issues[0];
      const isConflict = primaryIssue.code === 'CUSTOMER_DOUBLE_BOOKED';
      throw new OfferError(
        primaryIssue.message,
        primaryIssue.code,
        isConflict ? 409 : 400
      );
    }

    // 5. Prevent duplicate active offers for the same waitlist entry and appointment slot
    const existingActiveOffer = targetDb.prepare(`
      SELECT * FROM offers
      WHERE waitlistId = ?
        AND appointmentId = ?
        AND status IN ('pending_approval', 'approved', 'sent')
    `).get(waitlistId, appointmentId);

    if (existingActiveOffer) {
      throw new OfferError(
        `An active offer ("${existingActiveOffer.id}") with status "${existingActiveOffer.status}" already exists for waitlist entry "${waitlistId}" and appointment "${appointmentId}".`,
        'DUPLICATE_ACTIVE_OFFER',
        409
      );
    }

    // 6. Build and insert the offer record conforming to existing schema
    const offerId = options.id || `off-${randomUUID()}`;
    const initialStatus = options.status || 'pending_approval';
    const validStatuses = ['pending_approval', 'approved', 'sent', 'accepted', 'declined', 'no_reply', 'expired'];
    if (!validStatuses.includes(initialStatus)) {
      throw new OfferError(
        `Invalid offer status "${initialStatus}". Valid statuses: ${validStatuses.join(', ')}.`,
        'INVALID_STATUS',
        400
      );
    }

    // Human approval requirement: offers cannot be created directly in 'sent' status
    if (initialStatus === 'sent') {
      throw new OfferError(
        'Offers cannot be created directly with status "sent". Offers must be approved by staff before being sent.',
        'INVALID_STATUS',
        400
      );
    }

    const generatedAt = options.generatedAt || new Date().toISOString();
    const approvedAt = options.approvedAt || (initialStatus === 'approved' ? generatedAt : null);
    const sentAt = null;

    let messageText;
    let aiGenerated = 0;

    if (options.messageText && typeof options.messageText === 'string') {
      // Manual custom message text provided by caller — client cannot claim AI generation
      messageText = options.messageText.trim();
      aiGenerated = 0;
    } else if (options.draftedMessage && typeof options.draftedMessage.messageText === 'string') {
      // Pre-drafted message from AI drafting service
      messageText = options.draftedMessage.messageText;
      aiGenerated = options.draftedMessage.aiGenerated ? 1 : 0;
    } else {
      // Deterministic fallback template
      let bookingHistory = [];
      try {
        bookingHistory = JSON.parse(candidate.customerBookingHistory || '[]');
      } catch (_) {}

      let availableTimeSlots = [];
      try {
        availableTimeSlots = JSON.parse(candidate.availableTimeSlots || '[]');
      } catch (_) {}

      const context = {
        customer: {
          name: candidate.customerName,
          bookingHistory,
        },
        service: {
          id: service.id,
          name: service.name,
          category: service.category,
          durationMinutes: service.durationMinutes,
          price: service.price,
          currency: service.currency,
        },
        appointment: {
          id: appointment.id,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
        },
        staff: {
          id: staff.id,
          name: staff.name,
        },
        waitlist: {
          id: candidate.id,
          priority: candidate.priority,
          availableTimeSlots,
        },
      };
      messageText = generateFallbackMessage(context);
      aiGenerated = 0;
    }

    targetDb.prepare(`
      INSERT INTO offers (
        id, waitlistId, appointmentId, customerId,
        messageText, status, generatedAt, approvedAt, sentAt, respondedAt, aiGenerated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      offerId,
      waitlistId,
      appointmentId,
      candidate.customerId,
      messageText,
      initialStatus,
      generatedAt,
      approvedAt,
      sentAt,
      aiGenerated
    );

    return getOfferById(offerId, targetDb);
  });
}

/**
 * Update the lifecycle status of an offer (e.g. approve, send, expire).
 *
 * @param {string} offerId - Offer ID
 * @param {string} newStatus - Target status
 * @param {object} [details={}] - Optional timestamp overrides
 * @param {object} [targetDb=db] - Database instance
 * @returns {object} Updated offer record
 * @throws {OfferError}
 */
function updateOfferStatus(offerId, newStatus, details = {}, targetDb = db) {
  const validStatuses = ['pending_approval', 'approved', 'sent', 'accepted', 'declined', 'no_reply', 'expired'];
  if (!validStatuses.includes(newStatus)) {
    throw new OfferError(
      `Invalid offer status "${newStatus}". Valid statuses: ${validStatuses.join(', ')}.`,
      'INVALID_STATUS',
      400
    );
  }

  const existing = getOfferById(offerId, targetDb);
  if (!existing) {
    throw new OfferError(`Offer with ID "${offerId}" does not exist.`, 'OFFER_NOT_FOUND', 404);
  }

  // Human approval requirement: offer cannot transition directly from pending_approval to sent
  if (newStatus === 'sent' && existing.status !== 'approved') {
    throw new OfferError(
      `Cannot send offer "${offerId}": offer must be approved before being sent (current status: "${existing.status}").`,
      'OFFER_NOT_APPROVED',
      400
    );
  }

  const timestamp = details.timestamp || new Date().toISOString();
  let approvedAt = existing.approvedAt;
  let sentAt = existing.sentAt;
  let respondedAt = existing.respondedAt;

  if (newStatus === 'approved') {
    approvedAt = details.approvedAt || timestamp;
  } else if (newStatus === 'sent') {
    sentAt = details.sentAt || timestamp;
  } else if (['accepted', 'declined', 'no_reply'].includes(newStatus)) {
    respondedAt = details.respondedAt || timestamp;
  }

  targetDb.prepare(`
    UPDATE offers
    SET status = ?,
        approvedAt = ?,
        sentAt = ?,
        respondedAt = ?
    WHERE id = ?
  `).run(newStatus, approvedAt, sentAt, respondedAt, offerId);

  return getOfferById(offerId, targetDb);
}

/**
 * Retrieve offers for a specific appointment slot, validating that the appointment exists.
 *
 * @param {string} appointmentId - Appointment ID
 * @param {object} [targetDb=db] - SQLite database instance
 * @returns {Array<object>} List of offers for the slot
 * @throws {OfferError} If appointment ID is invalid (400) or appointment does not exist (404)
 */
function getOffersForAppointment(appointmentId, targetDb = db) {
  if (!appointmentId || typeof appointmentId !== 'string') {
    throw new OfferError('A valid appointment ID must be provided.', 'INVALID_INPUT', 400);
  }

  const appointment = getAppointmentById(appointmentId, targetDb);
  if (!appointment) {
    throw new OfferError(
      `Appointment with ID "${appointmentId}" does not exist.`,
      'APPOINTMENT_NOT_FOUND',
      404
    );
  }

  return getOffers({ appointmentId }, targetDb);
}

/**
 * Asynchronously create an offer, utilizing AI message drafting with automatic fallback.
 *
 * @param {string} appointmentId - Cancelled appointment slot ID
 * @param {string} waitlistId - Waitlist entry ID
 * @param {object|DatabaseSync} [optionsOrDb={}] - Options (status, custom messageText, openAi overrides) or db
 * @param {DatabaseSync} [maybeDb] - SQLite database instance
 * @returns {Promise<object>} Created offer record
 */
async function createOfferAsync(appointmentId, waitlistId, optionsOrDb = {}, maybeDb = undefined) {
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

  // If no manual custom message was provided, draft using AI (with automated fallback)
  if (!options.messageText) {
    const appointment = getAppointmentById(appointmentId, targetDb);
    const candidate = targetDb.prepare(`
      SELECT
        w.id, w.customerId, w.serviceId, w.priority, w.availableTimeSlots,
        c.name AS customerName, c.bookingHistory AS customerBookingHistory,
        s.name AS serviceName, s.category AS serviceCategory, s.durationMinutes AS serviceDurationMinutes,
        s.price AS servicePrice, s.currency AS serviceCurrency
      FROM waitlist w
      JOIN customers c ON w.customerId = c.id
      JOIN services s  ON w.serviceId = s.id
      WHERE w.id = ?
    `).get(waitlistId);

    if (appointment && candidate) {
      const staff = targetDb.prepare('SELECT * FROM staff WHERE id = ?').get(appointment.staffId);

      let bookingHistory = [];
      try {
        bookingHistory = JSON.parse(candidate.customerBookingHistory || '[]');
      } catch (_) {}

      let availableTimeSlots = [];
      try {
        availableTimeSlots = JSON.parse(candidate.availableTimeSlots || '[]');
      } catch (_) {}

      const context = {
        customer: {
          name: candidate.customerName,
          bookingHistory,
        },
        service: {
          id: candidate.serviceId,
          name: candidate.serviceName,
          category: candidate.serviceCategory,
          durationMinutes: candidate.serviceDurationMinutes,
          price: candidate.servicePrice,
          currency: candidate.serviceCurrency,
        },
        appointment: {
          id: appointment.id,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
        },
        staff: {
          id: staff ? staff.id : appointment.staffId,
          name: staff ? staff.name : 'our specialist',
        },
        waitlist: {
          id: candidate.id,
          priority: candidate.priority,
          availableTimeSlots,
        },
      };

      const draftingOptions = {
        client: options.openAiClient,
        apiKey: options.openAiApiKey,
        model: options.openAiModel,
        timeoutMs: options.openAiTimeoutMs,
      };

      const drafted = await draftOfferMessage(context, draftingOptions);
      options = { ...options, draftedMessage: drafted };
    }
  }

  return createOffer(appointmentId, waitlistId, options, targetDb);
}

module.exports = {
  OfferError,
  withTransaction,
  getOfferById,
  getOffers,
  getOffersForAppointment,
  createOffer,
  createOfferAsync,
  updateOfferStatus,
};
