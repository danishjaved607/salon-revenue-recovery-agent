import React, { useState } from 'react';

/**
 * Friendly display metadata for the 7 approved OpenAI agent tools.
 */
const TOOL_METADATA = {
  get_cancelled_appointments: {
    label: 'Inspect Cancelled Appointments',
    badge: 'Cancellations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  get_appointment_details: {
    label: 'Retrieve Appointment Details',
    badge: 'Appointment Details',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  find_eligible_waitlist_candidates: {
    label: 'Match Eligible Candidates',
    badge: 'Matching Engine',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  explain_candidate_eligibility: {
    label: 'Explain Candidate Eligibility',
    badge: 'Eligibility Analysis',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  create_recovery_offer: {
    label: 'Draft Recovery Offer',
    badge: 'Offer Generation',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
  },
  get_offer_status: {
    label: 'Check Offer Status',
    badge: 'Offer Registry',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  get_dashboard_metrics: {
    label: 'Retrieve Revenue Metrics',
    badge: 'Analytics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
};

/**
 * Summarize output data safely without exposing sensitive PII.
 */
function renderToolSummary(toolName, resultData) {
  if (!resultData) return 'Completed with empty response';

  switch (toolName) {
    case 'get_cancelled_appointments': {
      const count = Array.isArray(resultData) ? resultData.length : (resultData.count || 0);
      return `Found ${count} cancelled appointment slot(s)`;
    }
    case 'get_appointment_details': {
      return `Slot ${resultData.id || ''}: ${resultData.serviceName || ''} on ${resultData.date || ''} (${resultData.status || ''})`;
    }
    case 'find_eligible_waitlist_candidates': {
      const eligible = resultData.eligibleCandidates?.length ?? resultData.summary?.eligibleCount ?? 0;
      const excluded = resultData.excludedCandidates?.length ?? resultData.summary?.excludedCount ?? 0;
      return `${eligible} eligible candidate(s) matched (${excluded} excluded)`;
    }
    case 'explain_candidate_eligibility': {
      if (resultData.explanation) return resultData.explanation;
      if (resultData.status) return `Candidate status: ${resultData.status}`;
      return 'Candidate eligibility breakdown retrieved';
    }
    case 'create_recovery_offer': {
      const offerId = resultData.offer?.id || 'Created';
      const status = resultData.offer?.status || 'pending_approval';
      return `Draft offer "${offerId}" created (Status: ${status})`;
    }
    case 'get_offer_status': {
      if (resultData.offer) {
        return `Offer ${resultData.offer.id}: ${resultData.offer.status} (${resultData.offer.customerName || ''})`;
      }
      return `${resultData.count || (resultData.offers ? resultData.offers.length : 0)} offer(s) retrieved`;
    }
    case 'get_dashboard_metrics': {
      const rev = resultData.recoveredRevenue ?? 0;
      const bookings = resultData.recoveredBookingsCount ?? 0;
      const currency = resultData.currency || 'PKR';
      return `Recovered: ${bookings} bookings (${currency} ${rev.toLocaleString()})`;
    }
    default: {
      return typeof resultData === 'object' ? `${Object.keys(resultData).length} properties returned` : String(resultData);
    }
  }
}

export default function ToolExecutionPanel({ toolExecutions = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTabMap, setActiveTabMap] = useState({});

  if (!toolExecutions || toolExecutions.length === 0) {
    return null;
  }

  const allSuccess = toolExecutions.every((t) => t.result?.success !== false);

  const toggleRaw = (idx) => {
    setActiveTabMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="tool-execution-panel" aria-label="Tool execution transparency panel">
      <button
        type="button"
        className="tool-panel-toggle"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <div className="tool-toggle-left">
          <span className="tool-toggle-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </span>
          <span className="tool-toggle-title">
            Agent Executed Tools ({toolExecutions.length})
          </span>
          <span className={`tool-summary-status ${allSuccess ? 'status-ok' : 'status-warn'}`}>
            {allSuccess ? 'All Succeeded' : 'Issues Detected'}
          </span>
        </div>
        <span className={`tool-chevron ${isExpanded ? 'chevron-up' : 'chevron-down'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {isExpanded && (
        <div className="tool-execution-list">
          {toolExecutions.map((exec, idx) => {
            const meta = TOOL_METADATA[exec.tool] || {
              label: exec.tool,
              badge: 'Tool',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ),
            };

            const isSuccess = exec.result?.success !== false && !exec.result?.error;
            const hasArgs = exec.args && Object.keys(exec.args).length > 0;
            const isRawOpen = Boolean(activeTabMap[idx]);

            return (
              <div key={exec.toolCallId || idx} className="tool-card">
                <div className="tool-card-header">
                  <div className="tool-title-wrapper">
                    <span className="tool-icon-pill">{meta.icon}</span>
                    <div>
                      <div className="tool-name-primary">{meta.label}</div>
                      <code className="tool-name-technical">{exec.tool}</code>
                    </div>
                  </div>
                  <div className="tool-status-group">
                    <span className={`tool-status-pill ${isSuccess ? 'pill-success' : 'pill-failure'}`}>
                      {isSuccess ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </div>

                {/* Arguments / Inputs */}
                {hasArgs && (
                  <div className="tool-section">
                    <span className="tool-section-label">Inputs:</span>
                    <div className="tool-args-chips">
                      {Object.entries(exec.args).map(([key, val]) => (
                        <span key={key} className="arg-chip">
                          <span className="arg-key">{key}:</span>
                          <span className="arg-val">{String(val)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Output Summary */}
                <div className="tool-section">
                  <span className="tool-section-label">Result:</span>
                  {isSuccess ? (
                    <div className="tool-output-summary">
                      {renderToolSummary(exec.tool, exec.result?.data || exec.result)}
                    </div>
                  ) : (
                    <div className="tool-error-alert">
                      <span className="error-code-badge">{exec.result?.error?.code || 'ERROR'}</span>
                      <span className="error-message-text">{exec.result?.error?.message || 'Tool execution failed.'}</span>
                    </div>
                  )}
                </div>

                {/* Raw JSON toggle for technical auditing */}
                <div className="tool-raw-toggle-row">
                  <button
                    type="button"
                    className="btn-text-toggle"
                    onClick={() => toggleRaw(idx)}
                  >
                    {isRawOpen ? 'Hide Payload' : 'View Payload Details'}
                  </button>
                </div>

                {isRawOpen && (
                  <pre className="tool-raw-pre">
                    <code>
                      {JSON.stringify(
                        {
                          toolCallId: exec.toolCallId,
                          arguments: exec.args,
                          result: exec.result,
                        },
                        null,
                        2,
                      )}
                    </code>
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
