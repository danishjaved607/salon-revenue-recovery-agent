import React, { useState, useEffect, useCallback } from 'react';
import { getOffers, updateOfferStatus, simulateCustomerReply } from '../api/offers';

const STATUS_FILTERS = [
  { key: 'all', label: 'All Offers' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted (Recovered)' },
  { key: 'declined', label: 'Declined' },
  { key: 'no_reply', label: 'No Reply' },
  { key: 'expired', label: 'Expired' },
];

/**
 * Format ISO date string nicely.
 */
function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return isoStr;
  }
}

export default function OffersPage() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Tracking in-progress action (offer ID + action type)
  const [submittingId, setSubmittingId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  // ── Load All Offers ──────────────────────────────────────────────────
  const fetchOffersList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getOffers();
      const list = response?.offers || [];
      setOffers(list);
    } catch (err) {
      setError(err.message || 'Failed to load recovery offers from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffersList();
  }, [fetchOffersList]);

  // ── Approve Offer Action ─────────────────────────────────────────────
  const handleApprove = async (offerId) => {
    if (submittingId) return;
    setSubmittingId(offerId);
    setActionFeedback(null);

    try {
      const res = await updateOfferStatus(offerId, 'approved');
      const updated = res?.offer;

      // Update state locally
      setOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, ...(updated || {}), status: 'approved' } : o))
      );

      setActionFeedback({
        type: 'success',
        offerId,
        message: `Offer "${offerId}" approved by staff. It is now ready to be sent to the customer.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        offerId,
        message: err.message || 'Failed to approve offer.',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  // ── Dispatch / Mark as Sent Action ───────────────────────────────────
  const handleSend = async (offerId) => {
    if (submittingId) return;
    setSubmittingId(offerId);
    setActionFeedback(null);

    try {
      const res = await updateOfferStatus(offerId, 'sent');
      const updated = res?.offer;

      setOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, ...(updated || {}), status: 'sent' } : o))
      );

      setActionFeedback({
        type: 'success',
        offerId,
        message: `Offer "${offerId}" marked as sent. Customer reply simulation controls are now enabled.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        offerId,
        message: err.message || 'Failed to update offer status to sent.',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  // ── Simulate Customer Reply Action ───────────────────────────────────
  const handleSimulateReply = async (offerId, reply) => {
    if (submittingId) return;
    setSubmittingId(offerId);
    setActionFeedback(null);

    try {
      const res = await simulateCustomerReply(offerId, reply);
      const updated = res?.offer;

      // Update local offers list
      setOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, ...(updated || {}), status: res?.status || o.status } : o))
      );

      if (reply === 'YES') {
        if (res?.appointmentRecovered) {
          setActionFeedback({
            type: 'recovered',
            offerId,
            message: `Booking Recovered! Customer accepted the offer and appointment slot was successfully confirmed in the database.`,
            details: res?.message,
          });
        } else {
          setActionFeedback({
            type: 'warning',
            offerId,
            message: res?.message || 'Customer accepted, but appointment recovery could not be confirmed.',
          });
        }
      } else if (reply === 'NO') {
        setActionFeedback({
          type: 'declined',
          offerId,
          message: `Customer declined the offer. Appointment remains cancelled without creating a booking.`,
          details: res?.message,
        });
      } else if (reply === 'NO_REPLY') {
        setActionFeedback({
          type: 'no_reply',
          offerId,
          message: `No response recorded within the active window. Appointment remains cancelled.`,
          details: res?.message,
        });
      }
    } catch (err) {
      const isConflict = err.status === 409 || err.code === 'OFFER_ALREADY_PROCESSED' || err.code === 'BOOKING_CONFLICT';
      setActionFeedback({
        type: isConflict ? 'warning' : 'error',
        offerId,
        message: isConflict
          ? `Action conflict: ${err.message}`
          : err.message || 'Failed to simulate customer reply.',
      });

      // Re-fetch to synchronize state in case of concurrency or mismatch
      fetchOffersList();
    } finally {
      setSubmittingId(null);
    }
  };

  // Filter computation
  const filteredOffers = offers.filter((o) => {
    if (activeFilter === 'all') return true;
    return o.status === activeFilter;
  });

  return (
    <div className="page-container">
      {/* ── Contextual Header / Banner ─────────────────────────────────── */}
      <div className="milestone-banner">
        <div className="banner-content">
          <span className="banner-tag">Offer Lifecycle & Customer Simulation</span>
          <h2 className="banner-title">Recovery Offer Management Studio</h2>
          <p className="banner-description">
            Review recovery offers generated by staff or the AI engine, authorize dispatch with human-in-the-loop approval, and simulate customer WhatsApp/SMS responses to trigger transactional booking confirmations.
          </p>
        </div>
        <span className="banner-status">{offers.length} Total Offer{offers.length === 1 ? '' : 's'}</span>
      </div>

      {/* ── Global Feedback Notification ──────────────────────────────── */}
      {actionFeedback && (
        <div className={`feedback-banner ${actionFeedback.type === 'recovered' ? 'success' : actionFeedback.type === 'declined' || actionFeedback.type === 'error' ? 'error' : 'warning'}`} role="alert">
          <div className="feedback-icon" aria-hidden="true">
            {actionFeedback.type === 'recovered' || actionFeedback.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : actionFeedback.type === 'declined' || actionFeedback.type === 'error' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{actionFeedback.message}</div>
            {actionFeedback.details && (
              <div style={{ fontSize: 'var(--font-size-xs)', marginTop: '0.2rem', opacity: 0.9 }}>
                {actionFeedback.details}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Status Filter Bar ──────────────────────────────────────────── */}
      <div className="offers-filter-bar" role="tablist" aria-label="Filter offers by status">
        {STATUS_FILTERS.map((tab) => {
          const isActive = activeFilter === tab.key;
          const count =
            tab.key === 'all'
              ? offers.length
              : offers.filter((o) => o.status === tab.key).length;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`filter-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab.key)}
            >
              <span>{tab.label}</span>
              <span className="filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Loading State ──────────────────────────────────────────────── */}
      {loading && (
        <div className="dashboard-loading-card" role="status" aria-live="polite">
          <div className="dashboard-spinner" aria-hidden="true" />
          <p className="dashboard-loading-text">Loading recovery offers registry...</p>
        </div>
      )}

      {/* ── Error State ────────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="dashboard-error-card" role="alert">
          <h4 className="dashboard-error-title">Unable to Load Offers</h4>
          <p className="dashboard-error-message">{error}</p>
          <button type="button" className="btn-retry" onClick={fetchOffersList}>
            Retry Connection
          </button>
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────────── */}
      {!loading && !error && filteredOffers.length === 0 && (
        <div className="content-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <div className="card-icon-box" style={{ margin: '0 auto 1rem auto' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 className="card-heading" style={{ fontSize: 'var(--font-size-md)', marginBottom: '0.5rem' }}>
            {activeFilter === 'all'
              ? 'No Recovery Offers Found'
              : `No Offers in "${STATUS_FILTERS.find((f) => f.key === activeFilter)?.label}" Status`}
          </h3>
          <p className="card-text" style={{ maxWidth: '480px', margin: '0 auto 1rem auto' }}>
            {activeFilter === 'all'
              ? 'Navigate to the Recovery Workspace to match cancelled appointments with waiting clients and generate new recovery offers.'
              : 'Try selecting a different status filter above to inspect other offers.'}
          </p>
        </div>
      )}

      {/* ── Offers List ────────────────────────────────────────────────── */}
      {!loading && !error && filteredOffers.length > 0 && (
        <ul className="offers-list" aria-label="Recovery offers list">
          {filteredOffers.map((offer) => {
            const isSubmitting = submittingId === offer.id;
            const statusKey = offer.status || 'pending_approval';

            return (
              <li key={offer.id}>
                <div className={`offer-card status-${statusKey}`}>
                  {/* Card Top Row: Customer & Status */}
                  <div className="offer-card-top-row">
                    <div className="offer-customer-group">
                      <span className="offer-customer-name">{offer.customerName}</span>
                      <span className="offer-id-badge" title={`Offer ID: ${offer.id}`}>
                        {offer.id.substring(0, 16)}...
                      </span>
                    </div>

                    <span className={`status-pill status-pill-${statusKey}`}>
                      <span className={`status-dot status-dot-${statusKey}`} aria-hidden="true" />
                      <span>{offer.status.replace('_', ' ')}</span>
                    </span>
                  </div>

                  {/* Metadata Grid */}
                  <div className="offer-meta-grid">
                    <div className="offer-meta-item">
                      <span className="offer-meta-label">Service</span>
                      <span className="offer-meta-val">{offer.serviceName || '—'}</span>
                    </div>

                    <div className="offer-meta-item">
                      <span className="offer-meta-label">Slot Date & Time</span>
                      <span className="offer-meta-val">
                        {offer.appointmentDate} • {offer.appointmentStartTime}–{offer.appointmentEndTime}
                      </span>
                    </div>

                    <div className="offer-meta-item">
                      <span className="offer-meta-label">Assigned Staff</span>
                      <span className="offer-meta-val">{offer.staffName || '—'}</span>
                    </div>

                    <div className="offer-meta-item">
                      <span className="offer-meta-label">Customer Contact</span>
                      <span className="offer-meta-val">
                        {offer.customerPhone || offer.customerEmail || '—'}
                      </span>
                    </div>

                    <div className="offer-meta-item">
                      <span className="offer-meta-label">Created At</span>
                      <span className="offer-meta-val">{formatDate(offer.generatedAt)}</span>
                    </div>

                    <div className="offer-meta-item">
                      <span className="offer-meta-label">Approval & Sent</span>
                      <span className="offer-meta-val">
                        {offer.sentAt
                          ? `Sent: ${formatDate(offer.sentAt)}`
                          : offer.approvedAt
                          ? `Approved: ${formatDate(offer.approvedAt)}`
                          : 'Awaiting Staff Review'}
                      </span>
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div className="offer-message-container">
                    <span className="offer-message-label">Customer Message Draft</span>
                    <div className="offer-message-box">
                      "{offer.messageText}"
                    </div>
                  </div>

                  {/* ── Workflow & Action Area ─────────────────────────── */}
                  <div className="offer-actions-panel">
                    {/* State 1: pending_approval -> Needs Human Approval */}
                    {offer.status === 'pending_approval' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: 'var(--color-warning)' }} aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <span>Human Approval Required: Review slot and client details before authorizing offer dispatch.</span>
                        </div>

                        <button
                          type="button"
                          className="btn-approve"
                          onClick={() => handleApprove(offer.id)}
                          disabled={Boolean(submittingId)}
                        >
                          {isSubmitting ? (
                            <>
                              <div className="dashboard-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#ffffff' }} aria-hidden="true" />
                              <span>Approving Offer...</span>
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px' }} aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Approve Offer</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* State 2: approved -> Ready to Send to Customer */}
                    {offer.status === 'approved' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: 'var(--color-info)' }} aria-hidden="true">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span>Approved by staff on {formatDate(offer.approvedAt)}. Ready to mark as sent to initiate customer response window.</span>
                        </div>

                        <button
                          type="button"
                          className="btn-send"
                          onClick={() => handleSend(offer.id)}
                          disabled={Boolean(submittingId)}
                        >
                          {isSubmitting ? (
                            <>
                              <div className="dashboard-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#ffffff' }} aria-hidden="true" />
                              <span>Sending Offer...</span>
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px' }} aria-hidden="true">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                              <span>Mark as Sent</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* State 3: sent -> Active Customer Reply Simulation */}
                    {offer.status === 'sent' && (
                      <div className="simulation-box">
                        <div className="simulation-header">
                          <span className="simulation-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', color: 'var(--color-primary)' }} aria-hidden="true">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>Simulate Customer Response</span>
                          </span>
                          <p className="simulation-desc">
                            Select a simulated customer response to evaluate transactional booking confirmations and state transitions:
                          </p>
                        </div>

                        <div className="simulation-buttons-row">
                          {/* Option 1: YES */}
                          <button
                            type="button"
                            className="btn-sim btn-sim-yes"
                            onClick={() => handleSimulateReply(offer.id, 'YES')}
                            disabled={Boolean(submittingId)}
                            title="Accept offer and confirm booking"
                          >
                            {isSubmitting ? 'Processing...' : 'Simulate "YES" (Accept & Recover)'}
                          </button>

                          {/* Option 2: NO */}
                          <button
                            type="button"
                            className="btn-sim btn-sim-no"
                            onClick={() => handleSimulateReply(offer.id, 'NO')}
                            disabled={Boolean(submittingId)}
                            title="Decline offer; appointment remains cancelled"
                          >
                            {isSubmitting ? 'Processing...' : 'Simulate "NO" (Decline)'}
                          </button>

                          {/* Option 3: NO_REPLY */}
                          <button
                            type="button"
                            className="btn-sim btn-sim-noreply"
                            onClick={() => handleSimulateReply(offer.id, 'NO_REPLY')}
                            disabled={Boolean(submittingId)}
                            title="Record no response; appointment remains cancelled"
                          >
                            {isSubmitting ? 'Processing...' : 'Simulate "NO_REPLY" (No Response)'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* State 4: accepted -> Booking Successfully Recovered */}
                    {offer.status === 'accepted' && (
                      <div className="outcome-box recovered">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0 }} aria-hidden="true">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <div>
                          <strong>Booking Successfully Recovered</strong> — Customer accepted on {formatDate(offer.respondedAt)}. Slot converted to confirmed booking.
                        </div>
                      </div>
                    )}

                    {/* State 5: declined */}
                    {offer.status === 'declined' && (
                      <div className="outcome-box declined">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0 }} aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        <div>
                          <strong>Offer Declined</strong> — Customer declined on {formatDate(offer.respondedAt)}. Slot remains cancelled for waitlist matching.
                        </div>
                      </div>
                    )}

                    {/* State 6: no_reply */}
                    {offer.status === 'no_reply' && (
                      <div className="outcome-box no_reply">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0 }} aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <div>
                          <strong>No Customer Response</strong> — Response timed out on {formatDate(offer.respondedAt)}. Slot remains cancelled.
                        </div>
                      </div>
                    )}

                    {/* State 7: expired */}
                    {offer.status === 'expired' && (
                      <div className="outcome-box expired">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0 }} aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <div>
                          <strong>Offer Expired</strong> — Offer was not accepted prior to expiration cutoff.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
