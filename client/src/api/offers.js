import apiClient from './client';

/**
 * Retrieve all recovery offers with optional filters.
 *
 * Calls GET /api/offers.
 * Supported filters: { appointmentId, waitlistId, customerId, status }
 *
 * @param {object} [filters={}]
 * @returns {Promise<{ success: boolean, count: number, offers: Array<object> }>}
 */
export async function getOffers(filters = {}) {
  const params = {};
  if (filters.appointmentId) params.appointmentId = filters.appointmentId;
  if (filters.waitlistId) params.waitlistId = filters.waitlistId;
  if (filters.customerId) params.customerId = filters.customerId;
  if (filters.status) params.status = filters.status;

  return apiClient.get('/offers', { params });
}

/**
 * Retrieve a specific offer by its ID.
 *
 * Calls GET /api/offers/:id.
 *
 * @param {string} offerId
 * @returns {Promise<{ success: boolean, offer: object }>}
 */
export async function getOfferById(offerId) {
  if (!offerId) {
    throw new Error('Offer ID is required.');
  }
  return apiClient.get(`/offers/${encodeURIComponent(offerId)}`);
}

/**
 * Update the lifecycle status of an offer (e.g. 'approved', 'sent').
 *
 * Calls PATCH /api/offers/:id/status.
 *
 * Backend transition rules:
 * - 'pending_approval' -> 'approved'
 * - 'approved' -> 'sent'
 * - Cannot transition directly from 'pending_approval' to 'sent'.
 *
 * @param {string} offerId
 * @param {string} status - New lifecycle status
 * @param {object} [details={}] - Optional timestamps (approvedAt, sentAt, etc.)
 * @returns {Promise<{ success: boolean, message: string, offer: object }>}
 */
export async function updateOfferStatus(offerId, status, details = {}) {
  if (!offerId) {
    throw new Error('Offer ID is required.');
  }
  if (!status) {
    throw new Error('Target status is required.');
  }
  return apiClient.patch(`/offers/${encodeURIComponent(offerId)}/status`, {
    status,
    ...details,
  });
}

/**
 * Process a simulated customer response for a sent offer.
 *
 * Calls POST /api/offers/:id/simulate-reply.
 *
 * Expected behavior:
 * - 'YES': Accepts offer and attempts to recover booking via bookingService.confirmBooking().
 * - 'NO': Marks offer as declined; appointment remains cancelled.
 * - 'NO_REPLY': Marks offer as no_reply; appointment remains cancelled.
 *
 * @param {string} offerId
 * @param {'YES'|'NO'|'NO_REPLY'} reply
 * @returns {Promise<{
 *   success: boolean,
 *   message: string,
 *   reply: string,
 *   status: string,
 *   appointmentRecovered: boolean,
 *   offer: object,
 *   booking?: object
 * }>}
 */
export async function simulateCustomerReply(offerId, reply) {
  if (!offerId) {
    throw new Error('Offer ID is required.');
  }
  if (!reply || !['YES', 'NO', 'NO_REPLY'].includes(reply.toUpperCase())) {
    throw new Error('Reply must be YES, NO, or NO_REPLY.');
  }
  return apiClient.post(`/offers/${encodeURIComponent(offerId)}/simulate-reply`, {
    reply: reply.toUpperCase(),
  });
}
