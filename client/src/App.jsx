import React from 'react'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">✂ Salon Revenue Recovery Agent</span>
      </header>
      <main className="app-main" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Milestone 1 — Setup Complete</h2>
        <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)' }}>
          Backend setup, synthetic datasets, and SQLite initialization are ready.
          Frontend screens will be implemented in Milestone 4.
        </p>
      </main>
    </div>
  )
}
