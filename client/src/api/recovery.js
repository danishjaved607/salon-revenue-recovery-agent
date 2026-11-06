import apiClient from './client';

/**
 * Retrieve all cancelled appointments requiring recovery matching.
 *
 * Calls GET /api/appointments/cancelled.
 *
 * @param {object} [options={}]
 * @param {string} [options.date] - Optional date filter (YYYY-MM-DD)
 * @returns {Promise<{ success: boolean, count: number, appointments: Array<object> }>}
 */
export async function getCancelledAppointments(options = {}) {
  const params = {};
  if (options.date) {
    params.date = options.date;
  }
  return apiClient.get('/appointments/cancelled', { params });
}

/**
 * Retrieve eligible waitlist candidates and slot availability for a cancelled appointment.
 *
 * Calls GET /api/appointments/:id/matches.
 *
 * @param {string} appointmentId - Cancelled appointment ID
 * @returns {Promise<{
 *   success: boolean,
 *   slot: object,
 *   staffAssigned: object,
 *   slotAvailable: boolean,
 *   eligibleCandidates: Array<object>,
 *   excludedCandidates: Array<object>,
 *   summary: { totalChecked: number, eligibleCount: number, excludedCount: number }
 * }>}
 */
export async function getAppointmentMatches(appointmentId) {
  if (!appointmentId) {
    throw new Error('Appointment ID is required to fetch candidate matches.');
  }
  return apiClient.get(`/appointments/${encodeURIComponent(appointmentId)}/matches`);
}

/**
 * Retrieve all offers generated for a specific appointment slot.
 *
 * Calls GET /api/appointments/:id/offers.
 *
 * @param {string} appointmentId - Appointment ID
 * @returns {Promise<{ success: boolean, count: number, offers: Array<object> }>}
 */
export async function getOffersForAppointment(appointmentId) {
  if (!appointmentId) {
    throw new Error('Appointment ID is required to fetch slot offers.');
  }
  return apiClient.get(`/appointments/${encodeURIComponent(appointmentId)}/offers`);
}

/**
 * Create a recovery offer linking an eligible waitlist candidate to a cancelled appointment slot.
 *
 * Calls POST /api/offers.
 * Initial status defaults to 'pending_approval' (enforcing human approval).
 *
 * @param {object} payload
 * @param {string} payload.appointmentId - Cancelled appointment ID
 * @param {string} payload.waitlistId - Eligible waitlist candidate ID
 * @param {string} [payload.messageText] - Optional customized message
 * @param {string} [payload.status='pending_approval'] - Offer lifecycle status
 * @returns {Promise<{ success: boolean, message: string, offer: object }>}
 */
export async function createRecoveryOffer(payload) {
  if (!payload || !payload.appointmentId || !payload.waitlistId) {
    throw new Error('Both appointmentId and waitlistId are required to create an offer.');
  }
  return apiClient.post('/offers', {
    appointmentId: payload.appointmentId,
    waitlistId: payload.waitlistId,
    messageText: payload.messageText,
    status: payload.status || 'pending_approval',
  });
}
