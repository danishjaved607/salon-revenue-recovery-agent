import axios from 'axios';

/**
 * Resolves the API base URL:
 * - If VITE_API_BASE_URL is set (e.g. on Render: https://backend.onrender.com),
 *   append '/api' (if not already ending in '/api').
 * - Otherwise (local dev without custom URL), use the relative path '/api',
 *   which leverages Vite's development proxy configured in vite.config.js.
 */
function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (!envUrl || typeof envUrl !== 'string' || !envUrl.trim()) {
    return '/api';
  }
  const cleanUrl = envUrl.trim().replace(/\/+$/, '');
  return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
}

const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor: clean hooks for future auth/telemetry headers if needed
apiClient.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
);

// Response interceptor: normalizes backend error envelopes and network failures
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 1. Backend error envelope: { error: { code, message, details } }
    const backendMessage = error.response?.data?.error?.message;
    const backendCode = error.response?.data?.error?.code;

    // 2. HTTP status code
    const status = error.response?.status;

    // 3. Network or timeout errors
    let normalizedMessage = backendMessage;

    if (!normalizedMessage) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        normalizedMessage = 'The request timed out. Please verify the backend service and try again.';
      } else if (!error.response && error.request) {
        normalizedMessage = 'Unable to connect to the salon revenue server. Please ensure the backend is running.';
      } else if (status === 404) {
        normalizedMessage = 'The requested resource was not found.';
      } else if (status === 500) {
        normalizedMessage = 'Internal server error occurred. Please check backend logs.';
      } else {
        normalizedMessage = error.message || 'An unexpected error occurred. Please try again.';
      }
    }

    // Attach structured properties for upstream callers
    const enhancedError = new Error(normalizedMessage);
    enhancedError.status = status;
    enhancedError.code = backendCode || error.code || 'UNKNOWN_ERROR';
    enhancedError.originalError = error;
    enhancedError.details = error.response?.data?.error?.details || null;

    return Promise.reject(enhancedError);
  },
);

export default apiClient;
