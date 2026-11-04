import React from 'react';

export default function RecoveryWorkspacePage() {
  return (
    <div className="page-container">
      <div className="milestone-banner">
        <div className="banner-content">
          <span className="banner-tag">Milestone 5 — Part A Foundation</span>
          <h2 className="banner-title">Cancellation & Candidate Matching Workspace</h2>
          <p className="banner-description">
            Interactive cancelled slot queue and intelligent waitlist candidate ranking will be implemented in upcoming Milestone 5 parts.
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
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="10" y1="14" x2="14" y2="18" />
                  <line x1="14" y1="14" x2="10" y2="18" />
                </svg>
              </div>
              <h3 className="card-heading">Cancelled Appointment Queue</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Real-time feed of cancelled appointments requiring revenue recovery, highlighting slot value, staff member, and service duration.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Automatic detection of new cancellation events</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Status tracking (Open, Matching In-Progress, Recovered)</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>One-click trigger for candidate evaluation</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend API Route</span>
              <code className="api-endpoint-code">GET /api/appointments/cancelled</code>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="card-heading">Candidate Matching Engine</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Prioritized waitlist candidate scoring based on service compatibility, staff preference, past client loyalty, and time-slot availability.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Weighted match scoring algorithm display</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Conflict-free double booking validation</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Instant transition to customized offer drafting</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend API Route</span>
              <code className="api-endpoint-code">GET /api/appointments/:id/matches</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
