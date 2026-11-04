import React from 'react';

export default function OffersPage() {
  return (
    <div className="page-container">
      <div className="milestone-banner">
        <div className="banner-content">
          <span className="banner-tag">Milestone 5 — Part A Foundation</span>
          <h2 className="banner-title">Offer Management & Simulation Studio</h2>
          <p className="banner-description">
            Offer lifecycle tracking, human approval workflows, and simulated customer replies will be implemented in upcoming Milestone 5 parts.
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 className="card-heading">Active Recovery Offers</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Comprehensive registry of drafted, sent, accepted, declined, and expired offers with status transitions and expiry timers.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Status badges: PENDING, SENT, ACCEPTED, DECLINED, EXPIRED</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Personalized incentive details and expiration countdowns</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Detailed message draft preview with salon branding</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend API Routes</span>
              <code className="api-endpoint-code">GET /api/offers · POST /api/offers</code>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 className="card-heading">Reply Simulation & Approvals</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Interactive testing controls to trigger simulated customer replies (YES, NO, NO_REPLY) and evaluate transactional booking confirmations.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Single-click YES acceptance with automatic booking creation</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>NO decline handling with immediate cascade to next candidate</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Manual human approval before dispatch</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend API Routes</span>
              <code className="api-endpoint-code">PATCH /api/offers/:id/status · POST /api/offers/:id/simulate-reply</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
