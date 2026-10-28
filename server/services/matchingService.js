/**
 * services/matchingService.js
 *
 * Milestone 2 — Part B: Waitlist Matching and Slot Eligibility Engine
 *
 * Responsibilities:
 *  1. Accept a cancelled appointment ID and load slot parameters.
 *  2. Validate that the appointment exists and is in 'cancelled' status.
 *  3. Verify staff qualification (staff specializations include the service).
 *  4. Check staff availability (working day, working hours, break interval, and no active appointment conflicts).
 *  5. Evaluate waitlist candidates against deterministic eligibility rules:
 *     - Status must be 'waiting'
 *     - Service compatibility (requested service matches slot service)
 *     - Customer and waitlist consent (customer.consentToOffers and waitlist.consentGiven)
 *     - Staff preference (preferAnyStaff or preferredStaffId matches assigned staff)
 *     - Date availability (slot date in availableDates)
 *     - Time slot preference (slot time bucket in availableTimeSlots: morning/afternoon/evening)
 *     - Customer conflict prevention (no overlapping confirmed/recovered appointments)
 *  6. Return structured results with ranked eligible candidates and detailed exclusion reasons.
 */

'use strict';

const { db } = require('../config/database');
const { getAppointmentById } = require('./cancellationService');

class MatchingError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'MatchingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Convert "HH:MM" string to minutes from midnight.
 * @param {string} timeStr - e.g. "09:30"
 * @returns {number|null}
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Check if two time intervals overlap: [startA, endA) and [startB, endB).
 * @param {string} startA
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @returns {boolean}
 */
function intervalsOverlap(startA, endA, startB, endB) {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  if (sA === null || eA === null || sB === null || eB === null) return false;
  return sA < eB && eA > sB;
}

/**
 * Get standard 3-letter day name ("Sun", "Mon", ..., "Sat") for a "YYYY-MM-DD" date string.
 * Uses UTC to avoid timezone boundary issues.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
function getDayOfWeek(dateStr) {
  const parts = (dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return '';
  }
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getUTCDay()];
}

/**
 * Classify a time string into a time slot bucket:
 *  - "morning": before 12:00
 *  - "afternoon": 12:00 to 16:59
 *  - "evening": 17:00 and later
 * @param {string} timeStr - "HH:MM"
 * @returns {string} 'morning' | 'afternoon' | 'evening'
 */
function getTimeBucket(timeStr) {
  const [h] = (timeStr || '').split(':').map(Number);
  if (Number.isNaN(h)) return 'morning';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/**
 * Check if assigned staff is qualified to perform the service.
 * @param {object} staff - Staff database record
 * @param {string} serviceId - Service ID
 * @returns {boolean}
 */
function checkStaffQualification(staff, serviceId) {
  if (!staff || !staff.specializations) return false;
  try {
    const specializations = typeof staff.specializations === 'string'
      ? JSON.parse(staff.specializations)
      : staff.specializations;
    return Array.isArray(specializations) && specializations.includes(serviceId);
  } catch (_) {
    return false;
  }
}

/**
 * Check if assigned staff is available for the appointment date and time.
 * Verifies working days, shift hours, break times, and existing appointments.
 *
 * @param {object} staff - Staff record
 * @param {string} date - "YYYY-MM-DD"
 * @param {string} startTime - "HH:MM"
 * @param {string} endTime - "HH:MM"
 * @param {object} targetDb - SQLite database instance
 * @param {string} [excludeAppointmentId] - ID of cancelled appointment to ignore
 * @returns {{ isAvailable: boolean, issues: Array<{ code: string, message: string }> }}
 */
function checkStaffAvailability(staff, date, startTime, endTime, targetDb = db, excludeAppointmentId = null) {
  const issues = [];
  if (!staff) {
    issues.push({ code: 'STAFF_NOT_FOUND', message: 'Assigned staff record does not exist.' });
    return { isAvailable: false, issues };
  }

  // 1. Working days
  let workingDays = [];
  try {
    workingDays = typeof staff.workingDays === 'string'
      ? JSON.parse(staff.workingDays)
      : (staff.workingDays || []);
  } catch (_) {
    workingDays = [];
  }
  const dayName = getDayOfWeek(date);
  if (!workingDays.includes(dayName)) {
    issues.push({
      code: 'STAFF_NOT_WORKING_DAY',
      message: `Staff "${staff.name}" is not scheduled to work on ${dayName} (${date}).`,
    });
  }

  // 2. Working hours
  const slotStart = timeToMinutes(startTime);
  const slotEnd = timeToMinutes(endTime);
  const shiftStart = timeToMinutes(staff.workingHoursStart);
  const shiftEnd = timeToMinutes(staff.workingHoursEnd);

  if (slotStart === null || slotEnd === null || shiftStart === null || shiftEnd === null) {
    issues.push({
      code: 'INVALID_HOURS_DATA',
      message: 'Invalid slot or staff working hours format.',
    });
  } else if (slotStart < shiftStart || slotEnd > shiftEnd) {
    issues.push({
      code: 'STAFF_OUTSIDE_WORKING_HOURS',
      message: `Slot ${startTime}-${endTime} falls outside staff working hours (${staff.workingHoursStart}-${staff.workingHoursEnd}).`,
    });
  }

  // 3. Break time
  if (staff.breakStart && staff.breakEnd) {
    if (intervalsOverlap(startTime, endTime, staff.breakStart, staff.breakEnd)) {
      issues.push({
        code: 'STAFF_ON_BREAK',
        message: `Slot ${startTime}-${endTime} overlaps with staff break (${staff.breakStart}-${staff.breakEnd}).`,
      });
    }
  }

  // 4. Overlapping active appointments
  let conflictQuery = `
    SELECT id, date, startTime, endTime, status
    FROM appointments
    WHERE staffId = ?
      AND date = ?
      AND status IN ('confirmed', 'recovered')
  `;
  const conflictParams = [staff.id, date];
  if (excludeAppointmentId) {
    conflictQuery += ' AND id != ?';
    conflictParams.push(excludeAppointmentId);
  }

  const existingBookings = targetDb.prepare(conflictQuery).all(...conflictParams);
  const overlappingBooking = existingBookings.find(b =>
    intervalsOverlap(startTime, endTime, b.startTime, b.endTime)
  );

  if (overlappingBooking) {
    issues.push({
      code: 'STAFF_TIME_CONFLICT',
      message: `Staff "${staff.name}" has an active appointment (${overlappingBooking.id}) from ${overlappingBooking.startTime} to ${overlappingBooking.endTime}.`,
    });
  }

  return {
    isAvailable: issues.length === 0,
    issues,
  };
}

/**
 * Safely parse JSON array or return empty array.
 * @param {string|Array} val
 * @returns {Array}
 */
function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== 'string') return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Check if a waitlist candidate is eligible for the cancelled appointment.
 * Returns { isEligible, issues } where issues lists all reasons for exclusion.
 *
 * @param {object} candidate - Waitlist candidate row (joined with customer & service)
 * @param {object} appointment - Cancelled appointment record
 * @param {object} targetDb - SQLite database instance
 * @returns {{ isEligible: boolean, issues: Array<{ code: string, message: string }> }}
 */
function checkCandidateEligibility(candidate, appointment, targetDb = db) {
  const issues = [];

  // 1. Waitlist status must be 'waiting'
  if (candidate.status !== 'waiting') {
    issues.push({
      code: 'WAITLIST_NOT_WAITING',
      message: `Waitlist entry status is "${candidate.status}", expected "waiting".`,
    });
  }

  // 2. Service compatibility
  if (candidate.serviceId !== appointment.serviceId) {
    issues.push({
      code: 'SERVICE_MISMATCH',
      message: `Candidate requested service "${candidate.serviceName || candidate.serviceId}", slot is for "${appointment.serviceName || appointment.serviceId}".`,
    });
  }

  // 3. Customer consent
  if (!candidate.customerConsentToOffers) {
    issues.push({
      code: 'NO_CUSTOMER_CONSENT',
      message: `Customer "${candidate.customerName}" has not consented to receive appointment offers.`,
    });
  }

  // 4. Waitlist entry consent
  if (!candidate.consentGiven) {
    issues.push({
      code: 'NO_WAITLIST_CONSENT',
      message: `Waitlist entry "${candidate.id}" does not have consent given.`,
    });
  }

  // 5. Staff preference
  const preferAnyStaff = Boolean(candidate.preferAnyStaff);
  if (!preferAnyStaff && candidate.preferredStaffId) {
    if (candidate.preferredStaffId !== appointment.staffId) {
      issues.push({
        code: 'STAFF_PREFERENCE_MISMATCH',
        message: `Candidate preferred staff "${candidate.preferredStaffId}", but slot is assigned to "${appointment.staffId}".`,
      });
    }
  }

  // 6. Date availability
  const availableDates = parseJsonArray(candidate.availableDates);
  if (!availableDates.includes(appointment.date)) {
    issues.push({
      code: 'DATE_NOT_AVAILABLE',
      message: `Candidate is not available on date ${appointment.date}. Available dates: ${availableDates.join(', ') || 'none'}.`,
    });
  }

  // 7. Time slot bucket preference
  const availableTimeSlots = parseJsonArray(candidate.availableTimeSlots);
  const slotBucket = getTimeBucket(appointment.startTime);
  if (!availableTimeSlots.includes(slotBucket)) {
    issues.push({
      code: 'TIME_SLOT_NOT_AVAILABLE',
      message: `Candidate requested ${availableTimeSlots.join('/') || 'none'} slots, but slot is ${slotBucket} (${appointment.startTime}).`,
    });
  }

  // 8. Customer conflict prevention (customer already booked elsewhere at this time)
  const customerConflicts = targetDb.prepare(`
    SELECT id, date, startTime, endTime, status
    FROM appointments
    WHERE customerId = ?
      AND date = ?
      AND status IN ('confirmed', 'recovered')
      AND id != ?
  `).all(candidate.customerId, appointment.date, appointment.id);

  const overlappingCustomerBooking = customerConflicts.find(b =>
    intervalsOverlap(appointment.startTime, appointment.endTime, b.startTime, b.endTime)
  );

  if (overlappingCustomerBooking) {
    issues.push({
      code: 'CUSTOMER_DOUBLE_BOOKED',
      message: `Customer already has an active appointment (${overlappingCustomerBooking.id}) from ${overlappingCustomerBooking.startTime} to ${overlappingCustomerBooking.endTime}.`,
    });
  }

  return {
    isEligible: issues.length === 0,
    issues,
  };
}

/**
 * Identify eligible waitlist candidates for a cancelled appointment.
 *
 * @param {string} appointmentId - Cancelled appointment ID
 * @param {object|DatabaseSync} [optionsOrDb={}] - Options object or DatabaseSync instance
 * @param {DatabaseSync} [maybeDb] - SQLite database instance if options passed as 2nd arg
 * @returns {object} Structured matching result
 * @throws {MatchingError} If appointment not found or not cancelled
 */
function findEligibleCandidates(appointmentId, optionsOrDb = {}, maybeDb = undefined) {
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
    throw new MatchingError('A valid appointment ID must be provided.', 'INVALID_INPUT', 400);
  }

  // 1. Fetch appointment
  const appointment = getAppointmentById(appointmentId, targetDb);
  if (!appointment) {
    throw new MatchingError(
      `Appointment with ID "${appointmentId}" does not exist.`,
      'APPOINTMENT_NOT_FOUND',
      404
    );
  }

  // 2. Validate cancelled status
  if (appointment.status !== 'cancelled') {
    throw new MatchingError(
      `Cannot find candidates: appointment "${appointmentId}" is not cancelled (current status: "${appointment.status}").`,
      'INVALID_APPOINTMENT_STATUS',
      400
    );
  }

  // 3. Load service details
  const service = targetDb.prepare('SELECT * FROM services WHERE id = ?').get(appointment.serviceId);
  appointment.serviceName = service ? service.name : appointment.serviceId;

  // 4. Load staff details & verify qualifications and availability
  const staff = targetDb.prepare('SELECT * FROM staff WHERE id = ?').get(appointment.staffId);
  appointment.staffName = staff ? staff.name : appointment.staffId;

  const isStaffQualified = staff ? checkStaffQualification(staff, appointment.serviceId) : false;
  const staffIssues = [];

  if (!isStaffQualified) {
    staffIssues.push({
      code: 'STAFF_NOT_QUALIFIED',
      message: `Assigned staff member "${staff ? staff.name : appointment.staffId}" is not qualified to perform service "${appointment.serviceName}".`,
    });
  }

  const staffAvailability = checkStaffAvailability(
    staff,
    appointment.date,
    appointment.startTime,
    appointment.endTime,
    targetDb,
    appointment.id
  );

  staffIssues.push(...staffAvailability.issues);
  const isStaffAvailable = isStaffQualified && staffAvailability.isAvailable;

  // 5. Query all waitlist candidates joined with customer & service
  const candidateRows = targetDb.prepare(`
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
      s.name AS serviceName,
      s.category AS serviceCategory,
      s.durationMinutes AS serviceDurationMinutes,
      s.price AS servicePrice,
      s.currency AS serviceCurrency
    FROM waitlist w
    JOIN customers c ON w.customerId = c.id
    JOIN services s  ON w.serviceId = s.id
  `).all();

  const eligibleCandidates = [];
  const excludedCandidates = [];

  for (const candidate of candidateRows) {
    // If staff is not qualified or unavailable, candidate cannot be served in this slot
    if (!isStaffAvailable) {
      excludedCandidates.push({
        waitlistId: candidate.id,
        customerId: candidate.customerId,
        customerName: candidate.customerName,
        serviceId: candidate.serviceId,
        serviceName: candidate.serviceName,
        reason: staffIssues[0].code,
        message: `Slot cannot be filled: ${staffIssues[0].message}`,
        allReasons: staffIssues.map(i => i.code),
      });
      continue;
    }

    const evaluation = checkCandidateEligibility(candidate, appointment, targetDb);

    if (evaluation.isEligible) {
      eligibleCandidates.push({
        waitlistId: candidate.id,
        customerId: candidate.customerId,
        customerName: candidate.customerName,
        customerPhone: candidate.customerPhone,
        customerEmail: candidate.customerEmail,
        serviceId: candidate.serviceId,
        serviceName: candidate.serviceName,
        serviceDurationMinutes: candidate.serviceDurationMinutes,
        servicePrice: candidate.servicePrice,
        serviceCurrency: candidate.serviceCurrency,
        priority: candidate.priority,
        preferredStaffId: candidate.preferredStaffId,
        preferAnyStaff: Boolean(candidate.preferAnyStaff),
        addedAt: candidate.addedAt,
      });
    } else {
      const primaryIssue = evaluation.issues[0];
      excludedCandidates.push({
        waitlistId: candidate.id,
        customerId: candidate.customerId,
        customerName: candidate.customerName,
        serviceId: candidate.serviceId,
        serviceName: candidate.serviceName,
        reason: primaryIssue.code,
        message: primaryIssue.message,
        allReasons: evaluation.issues.map(i => i.code),
      });
    }
  }

  // 6. Deterministic ranking: priority ASC (1 is highest), then addedAt ASC (FIFO)
  eligibleCandidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
  });

  return {
    slot: {
      appointmentId: appointment.id,
      date: appointment.date,
      dayOfWeek: getDayOfWeek(appointment.date),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      timeBucket: getTimeBucket(appointment.startTime),
      serviceId: appointment.serviceId,
      serviceName: appointment.serviceName,
      staffId: appointment.staffId,
      staffName: appointment.staffName,
      status: appointment.status,
    },
    staffAssigned: {
      id: staff ? staff.id : null,
      name: staff ? staff.name : null,
      isQualified: isStaffQualified,
      isAvailable: isStaffAvailable,
      issues: staffIssues,
    },
    slotAvailable: isStaffAvailable,
    eligibleCandidates,
    excludedCandidates,
    summary: {
      totalChecked: candidateRows.length,
      eligibleCount: eligibleCandidates.length,
      excludedCount: excludedCandidates.length,
    },
  };
}

module.exports = {
  MatchingError,
  timeToMinutes,
  intervalsOverlap,
  getDayOfWeek,
  getTimeBucket,
  checkStaffQualification,
  checkStaffAvailability,
  checkCandidateEligibility,
  findEligibleCandidates,
};
