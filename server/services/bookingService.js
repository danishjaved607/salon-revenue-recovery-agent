/**
 * services/bookingService.js
 *
 * Milestone 2 — Part C: Safe Booking Confirmation and Double-Booking Prevention
 *
 * Responsibilities:
 *  1. Confirm recovery bookings only for valid, cancelled appointment slots and eligible waitlist entries.
 *  2. Revalidate all eligibility conditions (service, consent, staff qualifications, staff schedule,
 *     customer availability, and time conflicts) against live database state inside a transaction.
 *  3. Prevent overlapping active appointments for the staff member and customer.
 *  4. Execute guarded atomic database updates (WHERE status = 'cancelled' / status = 'waiting').
 *  5. Prevent duplicate confirmations of slots or waitlist entries.
 *  6. Maintain transactional integrity using SQLite BEGIN IMMEDIATE and automatic rollback on failure.
 */

'use strict';

const { db } = require('../config/database');
const { getAppointmentById } = require('./cancellationService');
const {
  checkStaffQualification,
  checkStaffAvailability,
  checkCandidateEligibility,
} = require('./matchingService');

class BookingConfirmationError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'BookingConfirmationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Execute a callback within an immediate SQLite transaction.
 * Guarantees that changes either all succeed or roll back together.
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
 * Confirm a recovery booking for a cancelled appointment slot and waitlist candidate.
 *
 * @param {string} appointmentId - Cancelled appointment ID
 * @param {string} waitlistId - Eligible waitlist entry ID
 * @param {object|DatabaseSync} [optionsOrDb={}] - Options or database instance
 * @param {DatabaseSync} [maybeDb] - SQLite database instance if options passed as 3rd arg
 * @returns {object} Structured confirmation outcome
 * @throws {BookingConfirmationError} If any validation, conflict, or concurrency check fails
 */
function confirmBooking(appointmentId, waitlistId, optionsOrDb = {}, maybeDb = undefined) {
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
    throw new BookingConfirmationError('A valid appointment ID must be provided.', 'INVALID_INPUT', 400);
  }
  if (!waitlistId || typeof waitlistId !== 'string') {
    throw new BookingConfirmationError('A valid waitlist ID must be provided.', 'INVALID_INPUT', 400);
  }

  return withTransaction(targetDb, () => {
    // 1. Fetch current appointment state
    const appointment = getAppointmentById(appointmentId, targetDb);
    if (!appointment) {
      throw new BookingConfirmationError(
        `Appointment with ID "${appointmentId}" does not exist.`,
        'APPOINTMENT_NOT_FOUND',
        404
      );
    }

    if (appointment.status === 'recovered') {
      throw new BookingConfirmationError(
        `Appointment "${appointmentId}" has already been recovered and confirmed.`,
        'SLOT_ALREADY_CONFIRMED',
        409
      );
    }

    if (appointment.status !== 'cancelled') {
      throw new BookingConfirmationError(
        `Cannot confirm booking: appointment "${appointmentId}" is not in cancelled status (current status: "${appointment.status}").`,
        'INVALID_APPOINTMENT_STATUS',
        400
      );
    }

    // 2. Fetch current waitlist candidate state
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
      throw new BookingConfirmationError(
        `Waitlist entry with ID "${waitlistId}" does not exist.`,
        'WAITLIST_NOT_FOUND',
        404
      );
    }

    if (candidate.status === 'booked') {
      throw new BookingConfirmationError(
        `Waitlist entry "${waitlistId}" has already been booked.`,
        'WAITLIST_ALREADY_BOOKED',
        409
      );
    }

    if (candidate.status !== 'waiting') {
      throw new BookingConfirmationError(
        `Waitlist entry "${waitlistId}" is in "${candidate.status}" status, expected "waiting".`,
        'INVALID_WAITLIST_STATUS',
        400
      );
    }

    // 3. Load service & staff
    const service = targetDb.prepare('SELECT * FROM services WHERE id = ?').get(appointment.serviceId);
    appointment.serviceName = service ? service.name : appointment.serviceId;

    const staff = targetDb.prepare('SELECT * FROM staff WHERE id = ?').get(appointment.staffId);
    appointment.staffName = staff ? staff.name : appointment.staffId;

    // 4. Staff qualification check
    const isStaffQualified = staff ? checkStaffQualification(staff, appointment.serviceId) : false;
    if (!isStaffQualified) {
      throw new BookingConfirmationError(
        `Assigned staff member "${staff ? staff.name : appointment.staffId}" is not qualified to perform service "${appointment.serviceName}".`,
        'STAFF_NOT_QUALIFIED',
        400
      );
    }

    // 5. Staff working schedule and appointment conflict check (revalidation)
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
      throw new BookingConfirmationError(
        primaryIssue.message,
        primaryIssue.code,
        isConflict ? 409 : 400
      );
    }

    // 6. Candidate eligibility check against live DB state (revalidation)
    const candidateEvaluation = checkCandidateEligibility(candidate, appointment, targetDb);
    if (!candidateEvaluation.isEligible) {
      const primaryIssue = candidateEvaluation.issues[0];
      const isConflict = primaryIssue.code === 'CUSTOMER_DOUBLE_BOOKED';
      throw new BookingConfirmationError(
        primaryIssue.message,
        primaryIssue.code,
        isConflict ? 409 : 400
      );
    }

    // 7. Atomic guarded updates
    // Update appointment: must still be 'cancelled'
    const recoveryNote = options.notes
      ? options.notes
      : `Recovered from waitlist entry ${candidate.id} for customer ${candidate.customerName}`;
    const fullNotes = appointment.notes
      ? `${appointment.notes} | ${recoveryNote}`
      : recoveryNote;

    const aptUpdateResult = targetDb.prepare(`
      UPDATE appointments
      SET status = 'recovered',
          customerId = ?,
          notes = ?
      WHERE id = ? AND status = 'cancelled'
    `).run(candidate.customerId, fullNotes, appointment.id);

    if (aptUpdateResult.changes === 0) {
      throw new BookingConfirmationError(
        `Failed to confirm booking: appointment slot "${appointment.id}" was concurrently claimed or modified.`,
        'CONCURRENT_MODIFICATION',
        409
      );
    }

    // Update waitlist: must still be 'waiting'
    const wlUpdateResult = targetDb.prepare(`
      UPDATE waitlist
      SET status = 'booked'
      WHERE id = ? AND status = 'waiting'
    `).run(candidate.id);

    if (wlUpdateResult.changes === 0) {
      throw new BookingConfirmationError(
        `Failed to confirm booking: waitlist entry "${candidate.id}" was concurrently claimed or modified.`,
        'CONCURRENT_MODIFICATION',
        409
      );
    }

    // Update customer booking history
    let bookingHistory = [];
    try {
      bookingHistory = JSON.parse(candidate.customerBookingHistory || '[]');
    } catch (_) {
      bookingHistory = [];
    }
    if (!bookingHistory.includes(appointment.id)) {
      bookingHistory.push(appointment.id);
      targetDb.prepare(`
        UPDATE customers
        SET bookingHistory = ?
        WHERE id = ?
      `).run(JSON.stringify(bookingHistory), candidate.customerId);
    }

    // Update offer if one exists for this waitlist & appointment
    const confirmedTimestamp = options.confirmedAt || new Date().toISOString();
    targetDb.prepare(`
      UPDATE offers
      SET status = 'accepted',
          respondedAt = ?
      WHERE waitlistId = ? AND appointmentId = ? AND status IN ('pending_approval', 'approved', 'sent')
    `).run(confirmedTimestamp, candidate.id, appointment.id);

    // Fetch refreshed records
    const updatedAppointment = getAppointmentById(appointment.id, targetDb);
    const updatedWaitlist = targetDb.prepare('SELECT * FROM waitlist WHERE id = ?').get(candidate.id);

    return {
      success: true,
      message: 'Booking successfully confirmed and slot recovered.',
      booking: {
        appointmentId: updatedAppointment.id,
        status: updatedAppointment.status,
        date: updatedAppointment.date,
        startTime: updatedAppointment.startTime,
        endTime: updatedAppointment.endTime,
        serviceId: updatedAppointment.serviceId,
        serviceName: candidate.serviceName,
        staffId: updatedAppointment.staffId,
        staffName: staff.name,
        customerId: updatedAppointment.customerId,
        customerName: candidate.customerName,
        customerPhone: candidate.customerPhone,
        customerEmail: candidate.customerEmail,
        waitlistId: updatedWaitlist.id,
        confirmedAt: confirmedTimestamp,
      },
      appointment: updatedAppointment,
      waitlist: updatedWaitlist,
    };
  });
}

module.exports = {
  BookingConfirmationError,
  withTransaction,
  confirmBooking,
};
