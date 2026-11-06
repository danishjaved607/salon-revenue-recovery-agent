import apiClient from './client';

/**
 * Retrieve executive dashboard revenue recovery metrics.
 *
 * Calls GET /api/dashboard/metrics.
 * The Axios client automatically returns response.data:
 * { success: true, metrics: { ... } }
 *
 * @returns {Promise<{ success: boolean, metrics: object }>}
 */
export async function getDashboardMetrics() {
  return apiClient.get('/dashboard/metrics');
}
