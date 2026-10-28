/**
 * services/cancellationService.js
 *
 * Milestone 2 — Part A: Cancellation Detection and Validation
 *
 * Responsibilities:
 *  1. Identify cancelled appointments using the existing SQLite schema.
 *  2. Validate that an appointment exists and is in a state that permits cancellation ('confirmed').
 *  3. Prevent invalid, already-cancelled, or completed appointments from being cancelled.
 *  4. Execute atomic updates to prevent double-cancellations and state corruption.
 */

'use strict';

const { db } = require('../config/database');

class CancellationError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'CancellationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Retrieve an appointment by its ID.
 * @param {string} id - Appointment ID
 * @param {object} [targetDb=db] - SQLite database instance
 * @returns {object|null} Appointment record or null if not found
 */
function getAppointmentById(id, targetDb = db) {
  if (!id || typeof id !== 'string') {
    return null;
  }
  return targetDb.prepare('SELECT * FROM appointments WHERE id = ?').get(id) || null;
}

/**
 * Retrieve all cancelled appointments.
 * Optionally filter by date and include joined service/customer/staff details.
 *
 * @param {object} [targetDb=db] - SQLite database instance
 * @param {object} [options={}] - Filter options
 * @param {string} [options.date] - Optional date filter (YYYY-MM-DD)
 * @param {boolean} [options.raw=false] - Return raw appointment rows without joins
 * @returns {Array<object>} List of cancelled appointments
 */
function getCancelledAppointments(targetDb = db, options = {}) {
  if (options.raw) {
    let query = 'SELECT * FROM appointments WHERE status = ?';
    const params = ['cancelled'];
    if (options.date) {
      query += ' AND date = ?';
      params.push(options.date);
    }
    query += ' ORDER BY date ASC, startTime ASC';
    return targetDb.prepare(query).all(...params);
  }

  let query = `
    SELECT
      a.id,
      a.customerId,
      c.name AS customerName,
      c.phone AS customerPhone,
      c.email AS customerEmail,
      a.serviceId,
      s.name AS serviceName,
      s.durationMinutes,
      s.price AS servicePrice,
      s.currency AS serviceCurrency,
      a.staffId,
      st.name AS staffName,
      a.date,
      a.startTime,
      a.endTime,
      a.status,
      a.cancelledAt,
      a.cancellationReason,
      a.notes
    FROM appointments a
    LEFT JOIN customers c ON a.customerId = c.id
    LEFT JOIN services s   ON a.serviceId = s.id
    LEFT JOIN staff st     ON a.staffId = st.id
    WHERE a.status = ?
  `;

  const params = ['cancelled'];
  if (options.date) {
    query += ' AND a.date = ?';
    params.push(options.date);
  }

  query += ' ORDER BY a.date ASC, a.startTime ASC';
  return targetDb.prepare(query).all(...params);
}

/**
 * Validate whether an appointment can be cancelled.
 *
 * Rules:
 *  - Must exist in the database.
 *  - Must be in 'confirmed' status.
 *  - Cannot be cancelled if already 'cancelled'.
 *  - Cannot be cancelled if 'completed'.
 *  - Cannot be cancelled if 'recovered'.
 *
 * @param {string} id - Appointment ID
 * @param {object} [targetDb=db] - SQLite database instance
 * @returns {{ valid: boolean, appointment?: object, error?: { code: string, message: string, statusCode: number } }}
 */
function validateCancellation(id, targetDb = db) {
  const appointment = getAppointmentById(id, targetDb);

  if (!appointment) {
    return {
      valid: false,
      error: {
        code: 'APPOINTMENT_NOT_FOUND',
        message: `Appointment with ID "${id}" does not exist.`,
        statusCode: 404,
      },
    };
  }

  if (appointment.status === 'cancelled') {
    return {
      valid: false,
      appointment,
      error: {
        code: 'ALREADY_CANCELLED',
        message: `Appointment "${id}" is already cancelled.`,
        statusCode: 409,
      },
    };
  }

  if (appointment.status === 'completed') {
    return {
      valid: false,
      appointment,
      error: {
        code: 'INVALID_STATUS',
        message: `Cannot cancel appointment "${id}" because it is already completed.`,
        statusCode: 400,
      },
    };
  }

  if (appointment.status !== 'confirmed') {
    return {
      valid: false,
      appointment,
      error: {
        code: 'INVALID_STATUS',
        message: `Cannot cancel appointment "${id}" with current status "${appointment.status}".`,
        statusCode: 400,
      },
    };
  }

  return { valid: true, appointment };
}

/**
 * Cancel a confirmed appointment safely and atomically.
 *
 * @param {string} id - Appointment ID
 * @param {object} [details={}] - Cancellation details
 * @param {string} [details.reason] - Reason for cancellation
 * @param {string} [details.cancelledAt] - ISO-8601 cancellation timestamp (defaults to current time)
 * @param {string} [details.notes] - Optional updated notes
 * @param {object} [targetDb=db] - SQLite database instance
 * @returns {object} The updated appointment record
 * @throws {CancellationError} If validation fails or update cannot be applied
 */
function cancelAppointment(id, details = {}, targetDb = db) {
  const validation = validateCancellation(id, targetDb);

  if (!validation.valid) {
    throw new CancellationError(
      validation.error.message,
      validation.error.code,
      validation.error.statusCode,
    );
  }

  const timestamp = details.cancelledAt || new Date().toISOString();
  const reason = details.reason ? details.reason.trim() : 'Customer requested cancellation';
  const notes = details.notes !== undefined ? details.notes : validation.appointment.notes;

  // Atomic update guarded by status = 'confirmed' to prevent concurrency anomalies
  const stmt = targetDb.prepare(`
    UPDATE appointments
    SET status = 'cancelled',
        cancelledAt = ?,
        cancellationReason = ?,
        notes = ?
    WHERE id = ? AND status = 'confirmed'
  `);

  const result = stmt.run(timestamp, reason, notes, id);

  if (result.changes === 0) {
    // If changes === 0 despite passing initial validation, another process altered status
    throw new CancellationError(
      `Failed to cancel appointment "${id}": status was modified concurrently.`,
      'CONCURRENT_MODIFICATION',
      409,
    );
  }

  return getAppointmentById(id, targetDb);
}

module.exports = {
  CancellationError,
  getAppointmentById,
  getCancelledAppointments,
  validateCancellation,
  cancelAppointment,
};
