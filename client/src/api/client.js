import axios from 'axios';

/**
 * Reusable Axios HTTP client configured for the Salon Revenue Recovery Agent.
 *
 * Uses a relative base URL ('/api') to leverage the Vite proxy in development
 * and serve directly from Express in production.
 */
const apiClient = axios.create({
  baseURL: '/api',
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
