/**
 * routes/appointments.js
 *
 * Express routes for appointment cancellation detection and validation.
 */

'use strict';

const express = require('express');
const router = express.Router();
const {
  getCancelledAppointments,
  getAppointmentById,
  validateCancellation,
  cancelAppointment,
  CancellationError,
} = require('../services/cancellationService');
const {
  findEligibleCandidates,
  MatchingError,
} = require('../services/matchingService');
const {
  confirmBooking,
  BookingConfirmationError,
} = require('../services/bookingService');

// GET /api/appointments/cancelled — List all cancelled appointments
router.get('/cancelled', (req, res, next) => {
  try {
    const raw = req.query.raw === 'true';
    const date = req.query.date;
    const cancelled = getCancelledAppointments(undefined, { raw, date });
    res.json({
      success: true,
      count: cancelled.length,
      appointments: cancelled,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/:id — Retrieve an appointment by ID
router.get('/:id', (req, res, next) => {
  try {
    const appointment = getAppointmentById(req.params.id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'APPOINTMENT_NOT_FOUND',
          message: `Appointment with ID "${req.params.id}" not found.`,
        },
      });
    }
    res.json({ success: true, appointment });
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/:id/validate-cancellation — Check if an appointment can be cancelled
router.get('/:id/validate-cancellation', (req, res, next) => {
  try {
    const result = validateCancellation(req.params.id);
    if (!result.valid) {
      return res.status(result.error.statusCode).json({
        success: false,
        valid: false,
        error: result.error,
        appointment: result.appointment || null,
      });
    }
    res.json({
      success: true,
      valid: true,
      appointment: result.appointment,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments/:id/cancel — Cancel a confirmed appointment
router.post('/:id/cancel', (req, res, next) => {
  try {
    const { reason, notes, cancelledAt } = req.body || {};
    const updated = cancelAppointment(req.params.id, { reason, notes, cancelledAt });
    res.json({
      success: true,
      message: 'Appointment cancelled successfully.',
      appointment: updated,
    });
  } catch (err) {
    if (err instanceof CancellationError) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

// GET /api/appointments/:id/matches — Find eligible waitlist candidates for a cancelled appointment
router.get('/:id/matches', (req, res, next) => {
  try {
    const result = findEligibleCandidates(req.params.id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof MatchingError) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

// POST /api/appointments/:id/confirm — Confirm recovery booking for a cancelled appointment
router.post('/:id/confirm', (req, res, next) => {
  try {
    const { waitlistId, notes, confirmedAt } = req.body || {};
    const result = confirmBooking(req.params.id, waitlistId, { notes, confirmedAt });
    res.json(result);
  } catch (err) {
    if (err instanceof BookingConfirmationError) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

// POST /api/appointments/:id/confirm-recovery — Alias for confirm recovery booking
router.post('/:id/confirm-recovery', (req, res, next) => {
  try {
    const { waitlistId, notes, confirmedAt } = req.body || {};
    const result = confirmBooking(req.params.id, waitlistId, { notes, confirmedAt });
    res.json(result);
  } catch (err) {
    if (err instanceof BookingConfirmationError) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

module.exports = router;
