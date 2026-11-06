import React, { useState, useEffect, useCallback } from 'react';
import {
  getCancelledAppointments,
  getAppointmentMatches,
  getOffersForAppointment,
  createRecoveryOffer,
} from '../api/recovery';

/**
 * Format currency amount with fallback.
 */
function formatCurrency(amount, currency = 'PKR') {
  const numeric = typeof amount === 'number' ? amount : 0;
  return `${currency} ${numeric.toLocaleString('en-US')}`;
}

export default function RecoveryWorkspacePage() {
  // Cancelled queue state
  const [appointments, setAppointments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState(null);

  // Candidate matching state for selected appointment
  const [matches, setMatches] = useState(null);
  const [existingOffers, setExistingOffers] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState(null);

  // Offer creation state
  const [creatingWaitlistId, setCreatingWaitlistId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Collapsible accordion state for excluded candidates
  const [isExcludedOpen, setIsExcludedOpen] = useState(false);

  // ── Fetch Cancelled Appointments Queue ───────────────────────────────
  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const response = await getCancelledAppointments();
      const list = response?.appointments || [];
      setAppointments(list);
      // Auto-select first appointment if nothing is selected or if previous selection is missing
      if (list.length > 0) {
        setSelectedId((prev) => (prev && list.some((a) => a.id === prev) ? prev : list[0].id));
      } else {
        setSelectedId(null);
      }
    } catch (err) {
      setQueueError(err.message || 'Failed to load cancelled appointments queue.');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // ── Fetch Matching & Offers when Selected Slot Changes ───────────────
  useEffect(() => {
    if (!selectedId) {
      setMatches(null);
      setExistingOffers([]);
      return;
    }

    let isCurrent = true;
    setLoadingMatches(true);
    setMatchesError(null);
    setFeedback(null);

    async function loadSlotData() {
      try {
        const [matchRes, offersRes] = await Promise.all([
          getAppointmentMatches(selectedId),
          getOffersForAppointment(selectedId).catch(() => ({ offers: [] })),
        ]);

        if (isCurrent) {
          setMatches(matchRes);
          setExistingOffers(offersRes?.offers || []);
        }
      } catch (err) {
        if (isCurrent) {
          setMatchesError(err.message || 'Failed to load candidate matches for this appointment.');
        }
      } finally {
        if (isCurrent) {
          setLoadingMatches(false);
        }
      }
    }

    loadSlotData();

    return () => {
      isCurrent = false;
    };
  }, [selectedId]);

  // ── Handle Offer Creation ───────────────────────────────────────────
  const handleCreateOffer = async (waitlistId) => {
    if (!selectedId || !waitlistId || creatingWaitlistId) return;

    setCreatingWaitlistId(waitlistId);
    setFeedback(null);

    try {
      const response = await createRecoveryOffer({
        appointmentId: selectedId,
        waitlistId,
        status: 'pending_approval',
      });

      const newOffer = response?.offer;

      // Update existing offers list locally
      setExistingOffers((prev) => (newOffer ? [...prev, newOffer] : prev));

      // Refresh slot offers from backend to ensure consistent state
      try {
        const refreshed = await getOffersForAppointment(selectedId);
        if (refreshed?.offers) {
          setExistingOffers(refreshed.offers);
        }
      } catch (_) {
        // Fallback to local state if refresh fails
      }

      setFeedback({
        type: 'success',
        message: 'Recovery offer created in "Pending Approval" status. Review and approve it on the Offer Management screen.',
        waitlistId,
      });
    } catch (err) {
      const isConflict = err.status === 409 || err.code === 'DUPLICATE_ACTIVE_OFFER';
      setFeedback({
        type: isConflict ? 'warning' : 'error',
        message: isConflict
          ? 'An active offer already exists for this candidate and appointment slot.'
          : err.message || 'Failed to create recovery offer.',
        waitlistId,
      });

      // If conflict, refresh existing offers to show current active state
      if (isConflict) {
        getOffersForAppointment(selectedId)
          .then((res) => setExistingOffers(res?.offers || []))
          .catch(() => {});
      }
    } finally {
      setCreatingWaitlistId(null);
    }
  };

  const selectedAppointment = appointments.find((a) => a.id === selectedId);

  return (
    <div className="page-container">
      {/* ── Page Header / Context Banner ──────────────────────────────── */}
      <div className="milestone-banner">
        <div className="banner-content">
          <span className="banner-tag">Revenue Recovery Operations</span>
          <h2 className="banner-title">Cancellation & Candidate Matching Workspace</h2>
          <p className="banner-description">
            Evaluate cancelled appointment slots against qualified waitlist clients, inspect deterministic matching criteria, and generate recovery offers for staff approval.
          </p>
        </div>
        <span className="banner-status">
          {appointments.length} Cancelled Slot{appointments.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* ── Master-Detail Workspace Layout ────────────────────────────── */}
      <div className="workspace-layout">
        {/* ── Left Column: Cancelled Appointment Queue ────────────────── */}
        <div className="workspace-queue-panel">
          <div className="workspace-panel-header">
            <h3 className="workspace-panel-title">
              <span>Cancelled Queue</span>
              <span className="workspace-count-badge">{appointments.length}</span>
            </h3>
          </div>

          {loadingQueue && (
            <div className="dashboard-loading-card" style={{ padding: '2rem 1rem' }} role="status" aria-live="polite">
              <div className="dashboard-spinner" aria-hidden="true" />
              <p className="dashboard-loading-text">Loading cancelled appointments...</p>
            </div>
          )}

          {queueError && (
            <div className="dashboard-error-card" role="alert" style={{ padding: '1.5rem 1rem' }}>
              <h4 className="dashboard-error-title">Queue Unavailable</h4>
              <p className="dashboard-error-message">{queueError}</p>
              <button type="button" className="btn-retry" onClick={fetchQueue}>
                Retry Queue
              </button>
            </div>
          )}

          {!loadingQueue && !queueError && appointments.length === 0 && (
            <div className="content-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <p className="card-text">Zero cancelled appointments found in the system.</p>
              <div className="empty-state-hint">
                All scheduled slots are currently confirmed or completed. New cancellations will appear here automatically.
              </div>
            </div>
          )}

          {!loadingQueue && !queueError && appointments.length > 0 && (
            <ul className="queue-items-list" aria-label="Cancelled appointments list">
              {appointments.map((apt) => {
                const isSelected = apt.id === selectedId;
                return (
                  <li key={apt.id}>
                    <button
                      type="button"
                      className={`queue-card-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedId(apt.id)}
                      aria-pressed={isSelected}
                    >
                      <div className="queue-card-top">
                        <span className="queue-card-service">{apt.serviceName}</span>
                        <span className="queue-card-price">
                          {formatCurrency(apt.servicePrice, apt.serviceCurrency)}
                        </span>
                      </div>

                      <div className="queue-card-details">
                        <div className="queue-card-row">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px', flexShrink: 0 }} aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>{apt.date} • {apt.startTime}–{apt.endTime} ({apt.durationMinutes} min)</span>
                        </div>

                        <div className="queue-card-row">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px', flexShrink: 0 }} aria-hidden="true">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>Staff: {apt.staffName || 'Unassigned'}</span>
                        </div>

                        <div className="queue-card-row">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px', flexShrink: 0 }} aria-hidden="true">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          <span>Original Client: {apt.customerName}</span>
                        </div>
                      </div>

                      {apt.cancellationReason && (
                        <span className="queue-card-reason" title={apt.cancellationReason}>
                          Reason: {apt.cancellationReason}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Right Column: Detail & Candidate Matching Inspector ───── */}
        <div className="workspace-detail-panel">
          {!selectedId && !loadingQueue && appointments.length > 0 && (
            <div className="content-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <p className="card-text">Select an appointment from the queue to inspect matching candidates.</p>
            </div>
          )}

          {loadingMatches && (
            <div className="dashboard-loading-card" role="status" aria-live="polite">
              <div className="dashboard-spinner" aria-hidden="true" />
              <p className="dashboard-loading-text">
                Evaluating waitlist candidates against slot requirements...
              </p>
            </div>
          )}

          {matchesError && !loadingMatches && (
            <div className="dashboard-error-card" role="alert">
              <h4 className="dashboard-error-title">Candidate Matching Failed</h4>
              <p className="dashboard-error-message">{matchesError}</p>
              <button
                type="button"
                className="btn-retry"
                onClick={() => setSelectedId((prev) => (prev ? `${prev}` : null))}
              >
                Retry Candidate Matching
              </button>
            </div>
          )}

          {matches && !loadingMatches && (
            <>
              {/* Feedback Alert Banner */}
              {feedback && (
                <div className={`feedback-banner ${feedback.type}`} role="alert">
                  <div className="feedback-icon" aria-hidden="true">
                    {feedback.type === 'success' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    )}
                    {feedback.type === 'warning' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )}
                    {feedback.type === 'error' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    )}
                  </div>
                  <div>{feedback.message}</div>
                </div>
              )}

              {/* Slot Overview Summary Card */}
              <div className="slot-summary-card">
                <div className="card-header-row" style={{ marginBottom: 0 }}>
                  <div className="card-title-group">
                    <div className="card-icon-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="card-heading" style={{ fontSize: 'var(--font-size-md)' }}>
                        Slot: {matches.slot?.serviceName}
                      </h3>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        Appointment ID: {matches.slot?.appointmentId}
                      </span>
                    </div>
                  </div>
                  <span className="queue-card-price" style={{ fontSize: 'var(--font-size-md)' }}>
                    {formatCurrency(
                      selectedAppointment?.servicePrice,
                      selectedAppointment?.serviceCurrency
                    )}
                  </span>
                </div>

                <div className="slot-summary-grid">
                  <div className="slot-prop">
                    <span className="slot-prop-label">Date & Time</span>
                    <span className="slot-prop-value">
                      {matches.slot?.date} ({matches.slot?.dayOfWeek}) • {matches.slot?.startTime}–{matches.slot?.endTime}
                    </span>
                  </div>

                  <div className="slot-prop">
                    <span className="slot-prop-label">Time Bucket</span>
                    <span className="slot-prop-value" style={{ textTransform: 'capitalize' }}>
                      {matches.slot?.timeBucket}
                    </span>
                  </div>

                  <div className="slot-prop">
                    <span className="slot-prop-label">Assigned Staff</span>
                    <span className="slot-prop-value">
                      {matches.staffAssigned?.name || matches.slot?.staffName || 'None'}
                    </span>
                  </div>

                  <div className="slot-prop">
                    <span className="slot-prop-label">Staff Qualification</span>
                    <span className="slot-prop-value">
                      {matches.staffAssigned?.isQualified ? (
                        <span className="badge-chip badge-success">Qualified</span>
                      ) : (
                        <span className="badge-chip badge-danger">Not Qualified</span>
                      )}
                    </span>
                  </div>

                  <div className="slot-prop">
                    <span className="slot-prop-label">Staff Schedule</span>
                    <span className="slot-prop-value">
                      {matches.staffAssigned?.isAvailable ? (
                        <span className="badge-chip badge-success">Available</span>
                      ) : (
                        <span className="badge-chip badge-warning">Schedule Conflict</span>
                      )}
                    </span>
                  </div>

                  <div className="slot-prop">
                    <span className="slot-prop-label">Existing Slot Offers</span>
                    <span className="slot-prop-value">
                      {existingOffers.length > 0 ? (
                        <span className="badge-chip badge-info">
                          {existingOffers.length} Active Offer{existingOffers.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>0 Offers</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Eligible Candidates Section */}
              <div className="candidates-section">
                <div className="workspace-panel-header">
                  <h3 className="workspace-panel-title">
                    <span>Eligible Waitlist Candidates</span>
                    <span className="workspace-count-badge">
                      {matches.eligibleCandidates?.length || 0}
                    </span>
                  </h3>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Ranked deterministically by Priority (1=Highest) and Wait Time (FIFO)
                  </span>
                </div>

                {(!matches.eligibleCandidates || matches.eligibleCandidates.length === 0) && (
                  <div className="content-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <p className="card-text">No waitlist candidates qualify for this specific slot.</p>
                    <div className="empty-state-hint">
                      Candidates were evaluated on service match, consent flags, staff preference, date availability, time slot bucket, and double-booking checks. Review the excluded list below for detailed reasons.
                    </div>
                  </div>
                )}

                {matches.eligibleCandidates?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {matches.eligibleCandidates.map((candidate, idx) => {
                      // Check if candidate already has an active offer for this slot
                      const activeOffer = existingOffers.find(
                        (o) => o.waitlistId === candidate.waitlistId
                      );
                      const isSubmitting = creatingWaitlistId === candidate.waitlistId;

                      const priorityClass = `priority-${candidate.priority || 3}`;

                      return (
                        <div key={candidate.waitlistId} className="candidate-card">
                          <div className="candidate-card-header">
                            <div className="candidate-rank-group">
                              <span className={`priority-chip ${priorityClass}`}>
                                #{idx + 1} Priority {candidate.priority}
                              </span>
                              <span className="candidate-name">{candidate.customerName}</span>
                            </div>

                            {activeOffer && (
                              <span className="offer-active-pill">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px' }} aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span>Offer: {activeOffer.status.replace('_', ' ')}</span>
                              </span>
                            )}
                          </div>

                          <div className="candidate-info-grid">
                            <div className="candidate-info-item">
                              <span className="candidate-info-label">Requested Service</span>
                              <span className="candidate-info-val">{candidate.serviceName}</span>
                            </div>

                            <div className="candidate-info-item">
                              <span className="candidate-info-label">Staff Preference</span>
                              <span className="candidate-info-val">
                                {candidate.preferAnyStaff
                                  ? 'Any Available Staff'
                                  : `Prefers ${matches.staffAssigned?.name || candidate.preferredStaffId}`}
                              </span>
                            </div>

                            <div className="candidate-info-item">
                              <span className="candidate-info-label">Contact Details</span>
                              <span className="candidate-info-val">
                                {candidate.customerPhone} • {candidate.customerEmail}
                              </span>
                            </div>

                            <div className="candidate-info-item">
                              <span className="candidate-info-label">Waitlist ID</span>
                              <span className="candidate-info-val" style={{ fontFamily: 'var(--font-mono)' }}>
                                {candidate.waitlistId}
                              </span>
                            </div>
                          </div>

                          <div className="candidate-card-actions">
                            {activeOffer ? (
                              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                Offer already created ({activeOffer.id.substring(0, 16)}...). Staff can review on the Offers page.
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn-create-offer"
                                onClick={() => handleCreateOffer(candidate.waitlistId)}
                                disabled={Boolean(creatingWaitlistId)}
                              >
                                {isSubmitting ? (
                                  <>
                                    <div
                                      className="dashboard-spinner"
                                      style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#ffffff' }}
                                      aria-hidden="true"
                                    />
                                    <span>Generating Offer...</span>
                                  </>
                                ) : (
                                  <>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px' }} aria-hidden="true">
                                      <line x1="12" y1="5" x2="12" y2="19" />
                                      <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    <span>Create Recovery Offer</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Excluded Candidates Section (Collapsible Accordion) */}
              {matches.excludedCandidates && matches.excludedCandidates.length > 0 && (
                <div className="excluded-accordion">
                  <button
                    type="button"
                    className="excluded-toggle-btn"
                    onClick={() => setIsExcludedOpen((prev) => !prev)}
                    aria-expanded={isExcludedOpen}
                  >
                    <span>
                      Ineligible / Excluded Candidates ({matches.excludedCandidates.length})
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        width: '16px',
                        height: '16px',
                        transform: isExcludedOpen ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform var(--transition-fast)',
                      }}
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isExcludedOpen && (
                    <ul className="excluded-list">
                      {matches.excludedCandidates.map((excluded) => (
                        <li key={excluded.waitlistId} className="excluded-item">
                          <div className="excluded-item-header">
                            <span className="excluded-candidate-name">
                              {excluded.customerName}
                            </span>
                            <span className="excluded-reason-code">{excluded.reason}</span>
                          </div>

                          <div className="excluded-message">{excluded.message}</div>

                          <div style={{ fontSize: 'clamp(0.65rem, 0.9vw, 0.7rem)', color: 'var(--color-text-subtle)' }}>
                            Service: {excluded.serviceName || excluded.serviceId} • Waitlist ID: {excluded.waitlistId}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
