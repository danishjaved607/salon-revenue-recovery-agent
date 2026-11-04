/**
 * routes/offers.js
 *
 * Express routes for appointment offer creation, tracking, and customer reply simulation.
 */

'use strict';

const express = require('express');
const router = express.Router();
const {
  createOffer,
  createOfferAsync,
  getOfferById,
  getOffers,
  updateOfferStatus,
  OfferError,
} = require('../services/offerService');
const {
  simulateCustomerReply,
  ReplySimulationError,
} = require('../services/replySimulator');
const {
  BookingConfirmationError,
} = require('../services/bookingService');

// POST /api/offers — Create an offer linking an eligible waitlist entry to a cancelled slot
router.post('/', async (req, res, next) => {
  try {
    const targetDb = req.app?.locals?.db || undefined;
    const { appointmentId, waitlistId, messageText, status } = req.body || {};
    const offer = await createOfferAsync(appointmentId, waitlistId, { messageText, status }, targetDb);
    res.status(201).json({
      success: true,
      message: 'Offer created successfully.',
      offer,
    });
  } catch (err) {
    if (err instanceof OfferError) {
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

// GET /api/offers — Query offers with optional filters (appointmentId, waitlistId, customerId, status)
router.get('/', (req, res, next) => {
  try {
    const targetDb = req.app?.locals?.db || undefined;
    const { appointmentId, waitlistId, customerId, status } = req.query;
    const offers = getOffers({ appointmentId, waitlistId, customerId, status }, targetDb);
    res.json({
      success: true,
      count: offers.length,
      offers,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/offers/:id — Retrieve an offer by its ID
router.get('/:id', (req, res, next) => {
  try {
    const targetDb = req.app?.locals?.db || undefined;
    const offer = getOfferById(req.params.id, targetDb);
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'OFFER_NOT_FOUND',
          message: `Offer with ID "${req.params.id}" not found.`,
        },
      });
    }
    res.json({
      success: true,
      offer,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/offers/:id/status — Update the lifecycle status of an offer
router.patch('/:id/status', (req, res, next) => {
  try {
    const targetDb = req.app?.locals?.db || undefined;
    const { status, timestamp, approvedAt, sentAt, respondedAt } = req.body || {};
    if (!status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Status field is required.',
        },
      });
    }
    const updated = updateOfferStatus(req.params.id, status, { timestamp, approvedAt, sentAt, respondedAt }, targetDb);
    res.json({
      success: true,
      message: `Offer status updated to "${status}".`,
      offer: updated,
    });
  } catch (err) {
    if (err instanceof OfferError) {
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

// POST /api/offers/:id/simulate-reply — Process a simulated customer reply (YES, NO, NO_REPLY)
router.post('/:id/simulate-reply', (req, res, next) => {
  try {
    const targetDb = req.app?.locals?.db || undefined;
    const { reply } = req.body || {};

    if (!reply || typeof reply !== 'string' || !reply.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REPLY',
          message: 'A valid reply string ("YES", "NO", or "NO_REPLY") is required.',
        },
      });
    }

    const result = simulateCustomerReply(req.params.id, reply, {}, targetDb);
    res.json(result);
  } catch (err) {
    if (
      err instanceof ReplySimulationError ||
      err instanceof OfferError ||
      err instanceof BookingConfirmationError
    ) {
      return res.status(err.statusCode || 400).json({
        success: false,
        error: {
          code: err.code || 'BAD_REQUEST',
          message: err.message,
        },
      });
    }
    next(err);
  }
});

module.exports = router;
