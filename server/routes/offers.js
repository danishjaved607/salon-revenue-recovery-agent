/**
 * routes/offers.js
 *
 * Express routes for appointment offer creation and tracking (Milestone 3 — Part A).
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

// POST /api/offers — Create an offer linking an eligible waitlist entry to a cancelled slot
router.post('/', async (req, res, next) => {
  try {
    const { appointmentId, waitlistId, messageText, status } = req.body || {};
    const offer = await createOfferAsync(appointmentId, waitlistId, { messageText, status });
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
    const { appointmentId, waitlistId, customerId, status } = req.query;
    const offers = getOffers({ appointmentId, waitlistId, customerId, status });
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
    const offer = getOfferById(req.params.id);
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
    const updated = updateOfferStatus(req.params.id, status, { timestamp, approvedAt, sentAt, respondedAt });
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

module.exports = router;
