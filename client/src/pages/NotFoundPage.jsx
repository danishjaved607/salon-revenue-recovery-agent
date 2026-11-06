import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="not-found-container">
      <div className="not-found-code">404</div>
      <h2 className="not-found-title">Page Not Found</h2>
      <p className="not-found-desc">
        The page you are looking for does not exist or has been moved. Use the navigation links or return to the main dashboard.
      </p>
      <Link to="/dashboard" className="btn-primary">
        Return to Dashboard
      </Link>
    </div>
  );
}
