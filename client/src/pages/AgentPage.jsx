import React, { useState, useEffect, useRef } from 'react';
import { sendAgentMessage, checkAgentHealth } from '../api/agent';
import ToolExecutionPanel from '../components/ToolExecutionPanel';

const SUGGESTED_PROMPTS = [
  'Find cancelled appointments.',
  'Find eligible waitlist customers.',
  'Explain why a customer is eligible.',
  'Prepare recovery offers.',
  'Show recovery performance.',
];

export default function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const [healthStatus, setHealthStatus] = useState('checking'); // 'checking' | 'online' | 'offline'

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Check real backend health on component mount
  useEffect(() => {
    let isMounted = true;
    async function verifyHealth() {
      const isHealthy = await checkAgentHealth();
      if (isMounted) {
        setHealthStatus(isHealthy ? 'online' : 'offline');
      }
    }
    verifyHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-scroll to the bottom of the conversation when messages update or loading state changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend, isRetry = false) => {
    const trimmed = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setLastFailedMessage(null);

    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let historyForBackend;

    if (isRetry) {
      // In retry mode, the user message is already in conversation history.
      // Reuse it without adding a duplicate bubble, and refresh its timestamp.
      const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
      const priorMessages = lastUserIndex >= 0 ? messages.slice(0, lastUserIndex) : messages.slice(0, -1);

      historyForBackend = priorMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-20);

      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        const targetIdx = lastUserIndex >= 0 ? lastUserIndex : updated.length - 1;
        if (updated[targetIdx] && updated[targetIdx].role === 'user') {
          updated[targetIdx] = { ...updated[targetIdx], timestamp };
        }
        return updated;
      });
    } else {
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp,
      };

      // Build backend-compatible conversation history from existing messages
      historyForBackend = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-20);

      setMessages((prev) => [...prev, userMessage]);
      setInputText('');
    }

    setIsLoading(true);

    try {
      const response = await sendAgentMessage(trimmed, historyForBackend);

      if (response && response.success) {
        const agentMessage = {
          id: `agent-${Date.now()}`,
          role: 'assistant',
          content: response.reply || 'Request completed.',
          toolExecutions: response.toolExecutions || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, agentMessage]);
      } else {
        const errorMsg = response?.error?.message || 'Agent was unable to produce a response.';
        setError({
          message: errorMsg,
          code: response?.error?.code || 'UNKNOWN_ERROR',
        });
        setLastFailedMessage(trimmed);
      }
    } catch (err) {
      const backendError = err.response?.data?.error;
      const status = err.response?.status;
      let displayMessage = 'Network error: Unable to contact the AI Agent service.';
      let errorCode = 'NETWORK_ERROR';

      if (backendError) {
        displayMessage = backendError.message || displayMessage;
        errorCode = backendError.code || 'API_ERROR';
      } else if (status === 503) {
        displayMessage = 'OpenAI API key is missing or not configured on the backend.';
        errorCode = 'MISSING_API_KEY';
      } else if (err.message) {
        displayMessage = err.message;
      }

      setError({
        message: displayMessage,
        code: errorCode,
        status,
      });
      setLastFailedMessage(trimmed);
    } finally {
      setIsLoading(false);
      // Auto re-focus input for smooth keyboard workflow
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRetry = () => {
    if (lastFailedMessage) {
      handleSendMessage(lastFailedMessage, true);
    }
  };

  const handleResetConversation = () => {
    setMessages([]);
    setError(null);
    setLastFailedMessage(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="page-container agent-page-container">
      {/* ── Page Header ── */}
      <div className="agent-header-row">
        <div className="agent-title-group">
          <div className="agent-badge-row">
            <span className="banner-tag">AI Recovery Agent</span>
            {healthStatus === 'online' && (
              <span className="health-status-pill online" title="Backend API is reachable">
                <span className="health-dot online" />
                Backend Connected
              </span>
            )}
            {healthStatus === 'offline' && (
              <span className="health-status-pill offline" title="Backend health check failed">
                <span className="health-dot offline" />
                Backend Offline
              </span>
            )}
            {healthStatus === 'checking' && (
              <span className="health-status-pill checking">
                <span className="health-dot checking" />
                Checking API...
              </span>
            )}
          </div>
          <h2 className="agent-main-title">Autonomous Recovery Agent</h2>
          <p className="agent-subtitle">
            Conversational revenue recovery concierge with OpenAI tool execution transparency, eligibility audits, and draft offer orchestration.
          </p>
        </div>

        <div className="agent-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="btn-reset-conversation"
              onClick={handleResetConversation}
              disabled={isLoading}
              title="Clear conversation history and start over"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>New Conversation</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Human-in-the-Loop Safeguard Notice ── */}
      <div className="agent-safeguard-banner" role="region" aria-label="Human-in-the-loop safeguard notice">
        <div className="safeguard-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="safeguard-content">
          <strong className="safeguard-title">Human-in-the-Loop Safeguard Active</strong>
          <p className="safeguard-text">
            The AI agent inspects cancelled slots, finds matching candidates, and prepares draft recovery offers.
            All offers require <strong>explicit salon staff approval</strong> in the Offers screen before being sent to customers.
          </p>
        </div>
      </div>

      {/* ── Chat Container ── */}
      <div className="agent-chat-shell">
        <div className="chat-messages-viewport">
          {/* Welcome Empty State */}
          {messages.length === 0 && (
            <div className="agent-welcome-card">
              <div className="welcome-avatar-large">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <h3 className="welcome-heading">How can I assist your recovery pipeline today?</h3>
              <p className="welcome-desc">
                Ask about current cancellations, match waitlisted clients, audit candidate scoring, or review recovery metrics.
              </p>

              <div className="suggested-prompts-section">
                <span className="suggested-prompts-label">Suggested prompts:</span>
                <div className="suggested-prompts-grid">
                  {SUGGESTED_PROMPTS.map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="prompt-chip-btn"
                      onClick={() => handleSendMessage(promptText)}
                      disabled={isLoading}
                    >
                      <span className="prompt-chip-sparkle">✦</span>
                      <span>{promptText}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Render Conversation Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message-row ${msg.role === 'user' ? 'message-user' : 'message-agent'}`}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4" />
                    <line x1="8" y1="16" x2="8" y2="16" />
                    <line x1="16" y1="16" x2="16" y2="16" />
                  </svg>
                )}
              </div>

              <div className="message-bubble">
                <div className="message-meta-header">
                  <span className="message-sender-name">
                    {msg.role === 'user' ? 'You' : 'AI Recovery Agent'}
                  </span>
                  {msg.timestamp && <span className="message-time">{msg.timestamp}</span>}
                </div>

                <div className="message-body-text">
                  {msg.content}
                </div>

                {/* Real Agent Tool Executions Visualizer */}
                {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                  <ToolExecutionPanel toolExecutions={msg.toolExecutions} />
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="chat-message-row message-agent">
              <div className="message-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8" y2="16" />
                  <line x1="16" y1="16" x2="16" y2="16" />
                </svg>
              </div>
              <div className="message-bubble typing-bubble">
                <div className="typing-header">
                  <span className="message-sender-name">AI Recovery Agent</span>
                  <span className="typing-status-hint">Orchestrating recovery tools...</span>
                </div>
                <div className="typing-dots-wrapper" aria-label="Thinking">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}

          {/* Error Banner with Retry */}
          {error && (
            <div className="chat-error-card" role="alert">
              <div className="error-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="error-body">
                <div className="error-title-row">
                  <span className="error-heading">Execution Error</span>
                  {error.code && <code className="error-code-chip">{error.code}</code>}
                </div>
                <p className="error-desc-text">{error.message}</p>
                {error.code === 'MISSING_API_KEY' && (
                  <div className="error-config-hint">
                    To enable live OpenAI recovery agent conversations, ensure <code>OPENAI_API_KEY</code> is set in your server <code>.env</code> file.
                  </div>
                )}
                <div className="error-actions-row">
                  {lastFailedMessage && (
                    <button
                      type="button"
                      className="btn-error-retry"
                      onClick={handleRetry}
                      disabled={isLoading}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      Retry Last Message
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-error-dismiss"
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Message Composer ── */}
        <div className="chat-composer-container">
          <div className="composer-input-wrapper">
            <textarea
              ref={textareaRef}
              className="composer-textarea"
              placeholder="Ask the AI agent to inspect cancellations, match waitlist clients, draft offers... (Press Enter to send, Shift+Enter for new line)"
              rows={2}
              maxLength={2000}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              aria-label="Agent chat input message"
            />
            <div className="composer-footer-row">
              <span className={`composer-char-counter ${inputText.length > 1800 ? 'counter-warn' : ''}`}>
                {inputText.length} / 2000
              </span>
              <button
                type="button"
                className="btn-send-agent"
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputText.trim()}
                aria-label="Send message to AI Recovery Agent"
              >
                {isLoading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    <span>Send</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
