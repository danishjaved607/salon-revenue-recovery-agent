import React from 'react';

export default function DashboardPage() {
  return (
    <div className="page-container">
      <div className="milestone-banner">
        <div className="banner-content">
          <span className="banner-tag">Milestone 5 — Part A Foundation</span>
          <h2 className="banner-title">Executive Revenue & Recovery Analytics</h2>
          <p className="banner-description">
            Live metric tracking, recovery rates, and financial impact visualizations will be implemented in Milestone 5 Part B.
          </p>
        </div>
        <span className="banner-status">Foundation Ready</span>
      </div>

      <div className="cards-grid">
        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3 className="card-heading">Revenue Overview</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Real-time summary cards displaying recovered revenue, total cancellations, conversion percentages, and pipeline values.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Total Recovered Revenue ($) and Slot Fill Rate</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Active vs. Converted Offer Ratios</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Average Recovery Response Turnaround Time</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend API Route</span>
              <code className="api-endpoint-code">GET /api/dashboard/metrics</code>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3 className="card-heading">Recent Recovery Activity</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Chronological log of recent recovery transactions, customer acceptances, and booking confirmation timestamps.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Instant status updates on customer replies</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Audit trail for autonomous vs. manual approvals</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Direct links to associated bookings and offer histories</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend Service Integration</span>
              <code className="api-endpoint-code">server/services/metricsService.js</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
