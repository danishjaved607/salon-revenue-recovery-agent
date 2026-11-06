import React from 'react';

export default function AgentPage() {
  return (
    <div className="page-container">
      <div className="milestone-banner">
        <div className="banner-content">
          <span className="banner-tag">Milestone 5 — Part A Foundation</span>
          <h2 className="banner-title">Autonomous AI Agent Studio</h2>
          <p className="banner-description">
            Interactive conversational recovery concierge with OpenAI tool-calling transparency will be implemented in upcoming Milestone 5 parts.
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
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <h3 className="card-heading">Conversational Recovery Console</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Natural-language chat interface allowing salon managers to instruct the agent to inspect cancellations, trigger waitlist evaluations, and review recovery recommendations prior to customer confirmation.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Context-aware recovery dialogue using GPT-4o-mini</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>transparent AI tool execution summaries</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Proactive recovery notifications and recommendations</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend API Route</span>
              <code className="api-endpoint-code">POST /api/agent/chat</code>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <h3 className="card-heading">Autonomous Tool Orchestration</h3>
            </div>
            <span className="card-badge">Upcoming</span>
          </div>
          <div className="card-body">
            <p className="card-text">
              Live visualization of the 7 approved OpenAI agent tool executions with full input/output transparency and guardrail verification.
            </p>
            <ul className="feature-list">
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Tool telemetry (cancellations, matching, drafting, offers)</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Double-booking prevention checkpoints</span>
              </li>
              <li className="feature-item">
                <span className="feature-bullet">•</span>
                <span>Human-in-the-loop approval confirmation barriers</span>
              </li>
            </ul>
            <div className="api-endpoint-box">
              <span className="api-endpoint-label">Backend Service Integration</span>
              <code className="api-endpoint-code">server/services/agentService.js</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
