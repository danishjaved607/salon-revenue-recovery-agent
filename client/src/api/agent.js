import apiClient from './client';

/**
 * Send a user message and optional conversation history to the autonomous AI Agent.
 *
 * Calls POST /api/agent/chat.
 *
 * @param {string} message - Current user prompt (max 2000 chars)
 * @param {Array<{ role: 'user'|'assistant', content: string }>} [conversationHistory=[]]
 * @returns {Promise<{
 *   success: boolean,
 *   reply: string,
 *   toolExecutions?: Array<{
 *     toolCallId: string,
 *     tool: string,
 *     args: object,
 *     result: { success: boolean, data?: any, error?: { code: string, message: string } },
 *     valid: boolean
 *   }>,
 *   iterations?: number
 * }>}
 */
export async function sendAgentMessage(message, conversationHistory = []) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Message cannot be empty.');
  }

  // Ensure only valid role and string content are passed in history to satisfy backend schema
  const sanitizedHistory = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string' && msg.content.trim())
    .map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
    }));

  return apiClient.post('/agent/chat', {
    message: message.trim(),
    conversationHistory: sanitizedHistory,
  });
}

/**
 * Verify actual backend availability via health check endpoint.
 *
 * Calls GET /api/health.
 *
 * @returns {Promise<boolean>} True if backend is healthy, false otherwise
 */
export async function checkAgentHealth() {
  try {
    const response = await apiClient.get('/health');
    return Boolean(response && response.status === 'ok');
  } catch (_) {
    return false;
  }
}
