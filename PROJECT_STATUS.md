# Salon Revenue Recovery Agent — Project Status

## Overview
This document tracks completed work, current progress, architectural decisions, known constraints, automated test status, and next steps across all milestones.

---

## Milestone Progress

| Milestone | Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | Project structure, package setup, synthetic data, SQLite init, idempotent seed loader, test suite | **Completed** | Full in-memory and file-based test coverage passed |
| **Milestone 2** | Cancellation detection, eligibility engine, waitlist matching rules | Not Started | Next up |
| **Milestone 3** | AI offer generation (OpenAI) with fallback templates & reply simulator | Not Started | Depends on Milestone 2 |
| **Milestone 4** | React + Vite UI (Dashboard, Appointments, Waitlist, Offers) | Not Started | Depends on Milestone 2 & 3 |
| **Milestone 5** | End-to-end integration, safety validations, revenue recovery reporting | Not Started | Final milestone |

---

## Milestone 1 Implementation Summary

### 1. Project Structure & Configuration
- Clean separation between `client/` (React + Vite) and `server/` (Node.js + Express).
- Root `.gitignore` configured to exclude node_modules, generated database files (`*.db`, `*.db-shm`, `*.db-wal`), `.env` files, build outputs, and OS artifacts.
- Root `.env.example` documenting server port, database file path, and OpenAI configuration placeholders.
- Client workspace configured with Vite, React, design tokens, base CSS reset, and a minimal application shell. No premature page screens or business logic implemented.

### 2. Backend Setup
- Minimal Express application (`app.js`, `server.js`) with CORS, JSON body parser, structured request logging (`middleware/requestLogger.js`), and centralized error handling (`middleware/errorHandler.js`).
- Health check endpoint available at `GET /api/health`.

### 3. Synthetic Datasets
Created 5 realistic JSON datasets in `server/data/`:
- **`services.json`** (10 records): Catalog covering hair, nails, skin, massage, and brow services with realistic duration and PKR pricing.
- **`staff.json`** (6 records): Staff profiles with service specialization arrays, working days, daily shift start/end times, and scheduled break intervals.
- **`customers.json`** (10 records): Customers with contact details, booking history, and explicit `consentToOffers` flags.
- **`appointments.json`** (12 records): Realistic appointment distribution containing confirmed, completed, and cancelled slots (with cancellation reasons).
- **`waitlist.json`** (10 records): Waitlist entries with service IDs, preferred staff IDs (or `preferAnyStaff`), available date arrays, time slot bucket preferences (`morning`, `afternoon`, `evening`), priority ratings (1–5), and explicit `consentGiven` flags.

### 4. Database Schema & Idempotent Seed Loading
- Built on Node.js built-in `node:sqlite` (`DatabaseSync`), requiring zero native C++ compilation across platforms.
- Tables defined with foreign key relationships and status constraints:
  - `services`
  - `staff`
  - `customers`
  - `appointments` (FKs to customers, services, staff)
  - `waitlist` (FKs to customers, services, staff)
  - `offers` (FKs to waitlist, appointments, customers)
- Safe, dependency-ordered seed loader (`services` → `staff` → `customers` → `appointments` → `waitlist`).
- Each table is guarded by empty-table checks (`SELECT COUNT(*)`), ensuring repeated execution is completely safe and idempotent without duplicating rows.

### 5. Automated Tests
- Test suite located at `server/tests/setup.test.js` using Node.js native test runner (`node:test`) and strict assertions (`node:assert/strict`).
- Fully isolated in-memory testing (`:memory:`) with `PRAGMA foreign_keys = ON`.
- Test coverage groups:
  1. Synthetic JSON dataset schema validation (required fields, positive durations/prices, valid categories).
  2. Database table and column structure verification.
  3. Safe and idempotent seed loading (first run row counts and second run no-op verification).
  4. Foreign key constraint enforcement (rejection of appointments/waitlist rows referencing non-existent records).
- Test execution command: `npm test` inside `server/`.

---

## Architectural Decisions

1. **Node 22 Built-in `node:sqlite` (`DatabaseSync`)**:
   - Replaced native add-ons like `better-sqlite3` with Node's native SQLite module (available since Node 22.5.0).
   - Eliminates Windows C++ build dependencies (such as Visual Studio C++ Build Tools or `node-gyp`), ensuring zero-friction setup across environments.
2. **Node 22 Native Test Runner (`node:test`)**:
   - Uses built-in `node:test` and `node:assert/strict`.
   - Eliminates heavyweight testing framework dependencies and version mismatches.
3. **Deterministic Business Rules**:
   - Availability, eligibility matching, and double-booking protection are kept strictly deterministic in SQL and core backend logic, separate from future AI integrations.
4. **Relational Foreign Key Constraints**:
   - `PRAGMA foreign_keys = ON` enforced at SQLite connection opening to guarantee data consistency.

---

## Known Issues / Constraints

- Node.js emits an `ExperimentalWarning: SQLite is an experimental feature` log in Node 22, which is expected for `node:sqlite` and does not affect runtime reliability or test execution.
- No frontend screens or AI endpoints exist in this milestone, as strictly governed by Milestone 1 scope boundaries.

---

## Next Steps (Milestone 2)

- Build cancellation detection service (`server/services/cancellationService.js`).
- Implement deterministic customer matching and slot eligibility algorithm:
  - Matching by service category and duration.
  - Staff preference matching (preferred staff or any qualified staff).
  - Date and time bucket matching (`morning`, `afternoon`, `evening`).
  - Customer consent verification (`consentToOffers === true` and `consentGiven === true`).
  - Double-booking and conflict prevention.
- Add unit and integration tests specifically covering cancellation detection and waitlist matching logic.
