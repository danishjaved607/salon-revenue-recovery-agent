import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RecoveryWorkspacePage from './pages/RecoveryWorkspacePage.jsx';
import OffersPage from './pages/OffersPage.jsx';
import AgentPage from './pages/AgentPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="recovery-workspace" element={<RecoveryWorkspacePage />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="agent" element={<AgentPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
