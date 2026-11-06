import React, { useState, useEffect, useCallback } from 'react';
import { getDashboardMetrics } from '../api/dashboard';

/**
 * Format currency amount with a fallback to PKR.
 */
function formatCurrency(amount, currency = 'PKR') {
  const numeric = typeof amount === 'number' ? amount : 0;
  return `${currency} ${numeric.toLocaleString('en-US')}`;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getDashboardMetrics();
      if (response && response.metrics) {
        setMetrics(response.metrics);
      } else {
        throw new Error('Invalid dashboard metrics response structure.');
      }
    } catch (err) {
      setError(err.message || 'Failed to retrieve dashboard metrics from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError(null);
      try {
        const response = await getDashboardMetrics();
        if (!isCancelled) {
          if (response && response.metrics) {
            setMetrics(response.metrics);
          } else {
            throw new Error('Invalid dashboard metrics response structure.');
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Failed to retrieve dashboard metrics from server.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      isCancelled = true;
    };
  }, []);

  // ── Render: Error State ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="page-container">
        <div className="dashboard-error-card" role="alert">
          <div className="card-icon-box" style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="dashboard-error-title">Unable to Load Dashboard Metrics</h3>
          <p className="dashboard-error-message">{error}</p>
          <button type="button" className="btn-retry" onClick={fetchMetrics}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }} aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Loading State ────────────────────────────────────────────
  if (loading || !metrics) {
    return (
      <div className="page-container">
        <div className="dashboard-loading-card" role="status" aria-live="polite">
          <div className="dashboard-spinner" aria-hidden="true" />
          <p className="dashboard-loading-text">Loading live revenue metrics...</p>
        </div>
      </div>
    );
  }

  // ── Safe Metric Extractions ──────────────────────────────────────────
  const currency = metrics.currency || 'PKR';
  const recoveredRevenue = metrics.recoveredRevenue || 0;
  const recoveredBookings = metrics.recoveredBookingsCount || 0;
  const cancelledBookings = metrics.cancelledBookingsCount || 0;
  const lostRevenue = metrics.lostRevenue || 0;
  const recoveryRate = typeof metrics.appointmentRecoveryRate === 'number' ? metrics.appointmentRecoveryRate : 0;
  const totalOffers = metrics.offersCreatedCount || 0;
  const acceptedOffers = metrics.offersAcceptedCount || 0;
  const offerAcceptanceRate = typeof metrics.offerAcceptanceRate === 'number' ? metrics.offerAcceptanceRate : 0;

  const breakdown = metrics.offersBreakdownByStatus || {};
  const statusItems = [
    { key: 'pending_approval', label: 'Pending Approval', count: breakdown.pending_approval || 0 },
    { key: 'approved', label: 'Approved', count: breakdown.approved || 0 },
    { key: 'sent', label: 'Sent', count: breakdown.sent || 0 },
    { key: 'accepted', label: 'Accepted', count: breakdown.accepted || 0 },
    { key: 'declined', label: 'Declined', count: breakdown.declined || 0 },
    { key: 'no_reply', label: 'No Reply', count: breakdown.no_reply || 0 },
    { key: 'expired', label: 'Expired', count: breakdown.expired || 0 },
  ];

  return (
    <div className="page-container">
      {/* ── Top Level Executive KPI Cards ─────────────────────────────── */}
      <div className="metrics-overview-grid">
        {/* KPI 1: Recovered Revenue */}
        <div className="metric-card accent-primary">
          <div className="metric-card-top">
            <span className="metric-label">Recovered Revenue</span>
            <span className="metric-badge-indicator">{currency}</span>
          </div>
          <div className="metric-value">{formatCurrency(recoveredRevenue, currency)}</div>
          <div className="metric-subtext">
            {recoveredBookings > 0
              ? `${recoveredBookings} appointment(s) recovered`
              : 'Zero recovered bookings recorded'}
          </div>
        </div>

        {/* KPI 2: Recovery Rate */}
        <div className="metric-card accent-success">
          <div className="metric-card-top">
            <span className="metric-label">Recovery Rate</span>
            <span className="metric-badge-indicator" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
              Rate
            </span>
          </div>
          <div className="metric-value">{recoveryRate}%</div>
          <div className="metric-subtext">
            {recoveredBookings} recovered of {metrics.totalCancellations || cancelledBookings} cancelled slots
          </div>
        </div>

        {/* KPI 3: Lost Revenue at Risk */}
        <div className="metric-card accent-warning">
          <div className="metric-card-top">
            <span className="metric-label">Lost Revenue</span>
            <span className="metric-badge-indicator" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
              At Risk
            </span>
          </div>
          <div className="metric-value">{formatCurrency(lostRevenue, currency)}</div>
          <div className="metric-subtext">
            {cancelledBookings} cancelled appointment(s)
          </div>
        </div>

        {/* KPI 4: Offer Acceptance Rate */}
        <div className="metric-card accent-info">
          <div className="metric-card-top">
            <span className="metric-label">Offer Acceptance</span>
            <span className="metric-badge-indicator" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
              Conversion
            </span>
          </div>
          <div className="metric-value">{offerAcceptanceRate}%</div>
          <div className="metric-subtext">
            {acceptedOffers} accepted of {totalOffers} total offer(s)
          </div>
        </div>
      </div>

      {/* ── Detailed Breakdown Cards Grid ────────────────────────────── */}
      <div className="cards-grid">
        {/* Card A: Revenue Recovery Overview */}
        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3 className="card-heading">Revenue Recovery Overview</h3>
            </div>
            <span className="card-badge">Live API</span>
          </div>

          <div className="card-body">
            <div className="overview-stat-list">
              <div className="overview-stat-row">
                <span className="overview-stat-name">Recovered Bookings</span>
                <span className="overview-stat-val">{recoveredBookings}</span>
              </div>
              <div className="overview-stat-row">
                <span className="overview-stat-name">Total Recovered Revenue</span>
                <span className="overview-stat-val">{formatCurrency(recoveredRevenue, currency)}</span>
              </div>
              <div className="overview-stat-row">
                <span className="overview-stat-name">Cancelled Appointments</span>
                <span className="overview-stat-val">{cancelledBookings}</span>
              </div>
              <div className="overview-stat-row">
                <span className="overview-stat-name">Unrecovered Lost Revenue</span>
                <span className="overview-stat-val">{formatCurrency(lostRevenue, currency)}</span>
              </div>
              <div className="overview-stat-row">
                <span className="overview-stat-name">Appointment Recovery Rate</span>
                <span className="overview-stat-val">{recoveryRate}%</span>
              </div>
            </div>

            {recoveredBookings === 0 && (
              <div className="empty-state-hint">
                No appointments have been recovered yet. Navigate to the Recovery Workspace to match cancelled slots with eligible waitlist candidates.
              </div>
            )}
          </div>
        </div>

        {/* Card B: Offer Performance Overview */}
        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3 className="card-heading">Offer Lifecycle Overview</h3>
            </div>
            <span className="card-badge">Live API</span>
          </div>

          <div className="card-body">
            <div className="overview-stat-list">
              <div className="overview-stat-row">
                <span className="overview-stat-name">Total Offers Created</span>
                <span className="overview-stat-val">{totalOffers}</span>
              </div>
              <div className="overview-stat-row">
                <span className="overview-stat-name">Offers Accepted</span>
                <span className="overview-stat-val">{acceptedOffers}</span>
              </div>
              <div className="overview-stat-row">
                <span className="overview-stat-name">Offer Acceptance Rate</span>
                <span className="overview-stat-val">{offerAcceptanceRate}%</span>
              </div>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <span className="metric-label" style={{ display: 'block', marginBottom: '0.4rem' }}>
                Status Breakdown
              </span>
              <div className="status-breakdown-grid">
                {statusItems.map((item) => (
                  <div key={item.key} className="status-breakdown-item">
                    <div className="status-item-header">
                      <span className={`status-dot status-dot-${item.key}`} aria-hidden="true" />
                      <span>{item.label}</span>
                    </div>
                    <div className="status-item-count">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>

            {totalOffers === 0 && (
              <div className="empty-state-hint">
                No recovery offers generated yet. Review candidate matches in the Recovery Workspace to initiate offers.
              </div>
            )}
          </div>
        </div>

        {/* Card C: Recovery Activity (Placeholder per Scope) */}
        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="card-heading">Recent Recovery Activity</h3>
            </div>
            <span className="card-badge">Workspace Scope</span>
          </div>

          <div className="card-body">
            <p className="card-text">
              Real-time recovery transactions and customer reply interactions are managed directly through the operational screens.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Active waitlist matching is available in the <strong>Recovery Workspace</strong>.</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Human-in-the-loop offer approvals and customer response simulations are tracked under <strong>Offer Management</strong>.</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Autonomous cancellation workflows can be monitored in the <strong>AI Recovery Concierge</strong>.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
