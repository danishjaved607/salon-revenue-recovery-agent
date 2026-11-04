import React from 'react';
import { useLocation } from 'react-router-dom';

const routeMeta = {
  '/dashboard': {
    title: 'Revenue Dashboard',
    subtitle: 'Overview of salon revenue recovery, conversion rates, and financial metrics.',
  },
  '/recovery-workspace': {
    title: 'Recovery Workspace',
    subtitle: 'Match cancelled appointment slots with priority waitlist candidates.',
  },
  '/offers': {
    title: 'Offer Management',
    subtitle: 'Review, approve, and track recovery offers sent to customers.',
  },
  '/agent': {
    title: 'AI Recovery Concierge',
    subtitle: 'Interact with the autonomous AI agent for cancellation analysis and recommendations.',
  },
};

export default function Header({ onToggleSidebar, isSidebarOpen }) {
  const location = useLocation();
  const currentMeta = routeMeta[location.pathname] || {
    title: 'Salon Revenue Recovery',
    subtitle: 'Autonomous salon appointment and revenue recovery platform.',
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-expanded={Boolean(isSidebarOpen)}
          aria-controls="app-sidebar"
          aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="page-title-group">
          <h1 className="page-heading">{currentMeta.title}</h1>
          <p className="page-subheading">{currentMeta.subtitle}</p>
        </div>
      </div>

      <div className="header-right">
        <div className="system-badge" title="Backend service connection ready" role="status">
          <span className="system-badge-dot" aria-hidden="true"></span>
          <span className="system-badge-text">System Active</span>
        </div>
      </div>
    </header>
  );
}
