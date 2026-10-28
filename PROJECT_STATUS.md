# Salon Revenue Recovery Agent — Project Status

## Overview
This document tracks completed work, current progress, architectural decisions, known constraints, automated test status, and next steps across all milestones.

---

## Milestone Progress

| Milestone | Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | Project structure, package setup, synthetic data, SQLite init, idempotent seed loader, test suite | **Completed** | Full in-memory and file-based test coverage passed |
| **Milestone 2** | Cancellation detection, eligibility engine, waitlist matching rules | **Completed** | Full cancellation and waitlist matching logic verified with 34 tests |
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

## Milestone 2 — Part A Implementation Summary: Cancellation Detection & Validation

### 1. Schema Reuse & Cancellation Support
- Inspected the existing SQLite schema in `config/database.js` and confirmed that table `appointments` already includes all fields and status constraints necessary for cancellation:
  - `status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','recovered','completed'))`
  - `cancelledAt TEXT` (ISO-8601 timestamp)
  - `cancellationReason TEXT`
  - `notes TEXT`
- No schema alterations or migrations were required.

### 2. Core Service (`services/cancellationService.js`)
- **`getAppointmentById(id, targetDb)`**: Fetches an appointment safely by ID.
- **`getCancelledAppointments(targetDb, options)`**: Queries appointments where `status = 'cancelled'`. Supports:
  - Joined relational queries retrieving customer details (name, phone, email), service information (name, duration, price, currency), and staff details.
  - Optional date filter (`options.date`) for targeting cancellations on specific days.
  - Raw mode (`options.raw = true`) returning raw appointment rows without table joins.
- **`validateCancellation(id, targetDb)`**: Validates whether an appointment exists and can be cancelled.
  - Enforces that only appointments in `confirmed` status can be cancelled.
  - Returns `404 APPOINTMENT_NOT_FOUND` if the record does not exist.
  - Returns `409 ALREADY_CANCELLED` if already in `cancelled` status.
  - Returns `400 INVALID_STATUS` if `completed` or in any other non-cancellable state.
- **`cancelAppointment(id, details, targetDb)`**: Atomically transitions a confirmed appointment to `cancelled`:
  - Enforces `WHERE id = ? AND status = 'confirmed'` in the SQL UPDATE to guard against race conditions or repeated cancellation overwrites.
  - Sets ISO-8601 timestamp (defaults to current time if not provided) and reason (defaults to `Customer requested cancellation`).
  - Throws typed `CancellationError` with appropriate HTTP status codes on validation or concurrency failure.

### 3. API Routes (`routes/appointments.js`)
- Express route module mounted in `app.js` under `/api/appointments`:
  - `GET /api/appointments/cancelled` — lists cancelled appointments (supports query params `?date=YYYY-MM-DD` and `?raw=true`).
  - `GET /api/appointments/:id` — retrieves a single appointment by ID.
  - `GET /api/appointments/:id/validate-cancellation` — pre-flight validation for cancellation feasibility.
  - `POST /api/appointments/:id/cancel` — cancels a confirmed appointment with request body `{ reason, notes, cancelledAt }`.

### 4. Automated Tests & Results (`tests/cancellation.test.js`)
- Written using Node.js native test runner (`node:test`) and assertions (`node:assert/strict`) with isolated in-memory databases (`:memory:`).
- 12 focused tests organized into 3 suites:
  1. **Cancellation Detection**:
     - Identifies all cancelled appointments from existing seed data.
     - Filters cancelled appointments by specific date.
     - Supports raw mode returning appointment records without joins.
  2. **Pre-Cancellation State Validation**:
     - Approves a confirmed appointment for cancellation.
     - Rejects a nonexistent appointment with 404 `APPOINTMENT_NOT_FOUND`.
     - Rejects an already cancelled appointment with 409 `ALREADY_CANCELLED`.
     - Rejects a completed appointment with 400 `INVALID_STATUS`.
  3. **Cancellation Execution & Data Integrity**:
     - Successfully cancels a confirmed appointment with reason and timestamp.
     - Defaults cancellation reason and sets ISO timestamp if not explicitly provided.
     - Throws `APPOINTMENT_NOT_FOUND` when attempting to cancel a nonexistent appointment.
     - Throws `INVALID_STATUS` and preserves data when attempting to cancel completed appointment.
     - Prevents repeated cancellation and preserves original cancellation timestamp and reason without corruption.
- Total test suite count across project: **47 tests passing (0 failing)** across 14 suites (`setup.test.js`, `cancellation.test.js`, and `matching.test.js`).

---

## Milestone 2 — Part B Implementation Summary: Waitlist Matching & Slot Eligibility

### 1. Matching Engine (`services/matchingService.js`)
- **`findEligibleCandidates(appointmentId, optionsOrDb, maybeDb)`**:
  - Validates that the appointment exists and is strictly in `cancelled` status.
  - Loads slot parameters, assigned staff member, and service details.
  - Checks assigned staff qualification (`staff.specializations.includes(serviceId)`).
  - Evaluates assigned staff schedule and working availability:
    - Verifies slot day matches staff working days (`workingDays` array).
    - Verifies slot bounds fall entirely within staff shift (`workingHoursStart` to `workingHoursEnd`).
    - Verifies slot does not overlap staff break intervals (`breakStart` to `breakEnd`).
    - Verifies staff has no active overlapping appointments (`confirmed` or `recovered`).
  - Evaluates all waitlist entries against deterministic eligibility rules:
    - Waitlist status must be `waiting` (excludes `booked`, `offered`, `expired`).
    - Service compatibility: candidate requested service must match slot service.
    - Dual consent check: `customers.consentToOffers === 1` AND `waitlist.consentGiven === 1`.
    - Staff preference: if `preferAnyStaff === 0`, candidate's `preferredStaffId` must match the assigned staff ID.
    - Date availability: slot date must be present in candidate's `availableDates` array.
    - Time bucket preference: slot start time is classified (`morning` <12:00, `afternoon` 12:00–16:59, `evening` ≥17:00) and must be present in candidate's `availableTimeSlots` array.
    - Double-booking prevention: customer must have no active overlapping bookings at that time.
  - Returns structured results with:
    - `slot`: slot metadata (date, time, dayOfWeek, timeBucket, service, staff, status).
    - `staffAssigned`: qualification and availability status, with detailed issue diagnostics.
    - `slotAvailable`: boolean indicating if slot can be filled by assigned staff.
    - `eligibleCandidates`: ranked by priority (1 is highest) and `addedAt` timestamp (FIFO).
    - `excludedCandidates`: lists every excluded candidate with primary `reason`, human-readable `message`, and `allReasons` array.
    - `summary`: total checked, eligible count, and excluded count.

### 2. API Routes (`routes/appointments.js`)
- Added `GET /api/appointments/:id/matches`:
  - Returns structured matching results for a cancelled appointment.
  - Returns HTTP 400 for invalid inputs or non-cancelled appointments (`INVALID_APPOINTMENT_STATUS`).
  - Returns HTTP 404 for nonexistent appointment IDs (`APPOINTMENT_NOT_FOUND`).

### 3. Automated Tests & Results (`tests/matching.test.js`)
- 22 focused tests organized into 7 suites:
  1. **Input Validation & Appointment Status** (4 tests):
     - Rejects missing/empty appointment ID (400 `INVALID_INPUT`).
     - Rejects nonexistent appointment ID (404 `APPOINTMENT_NOT_FOUND`).
     - Rejects confirmed appointment (400 `INVALID_APPOINTMENT_STATUS`).
     - Rejects completed appointment (400 `INVALID_APPOINTMENT_STATUS`).
  2. **Service Compatibility** (2 tests):
     - Approves candidates requesting exact cancelled service.
     - Excludes candidates requesting other services with `SERVICE_MISMATCH`.
  3. **Consent Verification** (2 tests):
     - Excludes customers with `consentToOffers = 0` (`NO_CUSTOMER_CONSENT`).
     - Excludes waitlist entries with `consentGiven = 0` (`NO_WAITLIST_CONSENT`).
  4. **Staff Qualifications** (2 tests):
     - Validates staff qualification via `specializations` array.
     - Flags slot unavailable and excludes candidates when staff lacks qualification (`STAFF_NOT_QUALIFIED`).
  5. **Staff Working Schedules & Conflicts** (4 tests):
     - Flags staff unavailable on non-working days (`STAFF_NOT_WORKING_DAY`).
     - Flags staff unavailable outside shift hours (`STAFF_OUTSIDE_WORKING_HOURS`).
     - Flags staff unavailable during breaks (`STAFF_ON_BREAK`).
     - Flags staff unavailable when active booking overlaps (`STAFF_TIME_CONFLICT`).
  6. **Customer Availability, Preferences & Conflicts** (6 tests):
     - Excludes candidates when slot date not in `availableDates` (`DATE_NOT_AVAILABLE`).
     - Excludes candidates when slot time bucket not in `availableTimeSlots` (`TIME_SLOT_NOT_AVAILABLE`).
     - Excludes candidates when preferred staff mismatches and `preferAnyStaff = 0` (`STAFF_PREFERENCE_MISMATCH`).
     - Accepts candidates with `preferAnyStaff = 1` even with null preferred staff.
     - Excludes candidates with overlapping active appointments (`CUSTOMER_DOUBLE_BOOKED`).
     - Excludes waitlist entries not in `waiting` status (`WAITLIST_NOT_WAITING`).
  7. **End-to-End Matching & Ranking** (2 tests):
     - Identifies and ranks eligible candidates on seed data in exact priority order (`wl-001` priority 1, `wl-002` priority 2).
     - Verifies structured exclusion explanations for every rejected candidate.
- Total test suite count across project: **47 tests passing (0 failing)** across 14 suites (`setup.test.js`, `cancellation.test.js`, and `matching.test.js`).

---

## Architectural Decisions

1. **Node 22 Built-in `node:sqlite` (`DatabaseSync`)**:
   - Replaced native add-ons like `better-sqlite3` with Node's native SQLite module (available since Node 22.5.0).
   - Eliminates Windows C++ build dependencies (such as Visual Studio C++ Build Tools or `node-gyp`), ensuring zero-friction setup across environments.
2. **Node 22 Native Test Runner (`node:test`)**:
   - Uses built-in `node:test` and `node:assert/strict`.
   - Eliminates heavyweight testing framework dependencies and version mismatches.
3. **Atomic SQL State Transitions**:
   - Status updates are guarded by `WHERE status = 'confirmed'` to prevent concurrent cancellation race conditions and state corruption.
4. **Deterministic Eligibility & Matching Engine**:
   - Multi-stage qualification and availability checks (staff qualification, staff shifts, breaks, customer consent, service match, dates, time buckets, and double-booking protection) are kept completely deterministic in pure SQL and JavaScript logic, strictly decoupled from future AI offer drafting.
5. **Time Bucket & Interval Math**:
   - Minute-from-midnight conversion (`timeToMinutes`) and standard interval intersection (`startA < endB && endA > startB`) provide timezone-safe, sub-minute precision schedule collision detection.
6. **Relational Foreign Key Constraints**:
   - `PRAGMA foreign_keys = ON` enforced at SQLite connection opening to guarantee data consistency.

---

## Known Issues / Constraints

- Node.js emits an `ExperimentalWarning: SQLite is an experimental feature` log in Node 22, which is expected for `node:sqlite` and does not affect runtime reliability or test execution.
- No frontend screens, AI endpoints, or booking confirmation logic exist in this milestone, as strictly governed by Milestone scope boundaries.

---

## Next Steps (Milestone 3)

- Implement AI offer generation engine with OpenAI and robust fallback templates:
  - Offer message drafting based on service, slot details, and customer name.
  - Fallback deterministic template generator when OpenAI is unavailable or unconfigured.
  - SMS/WhatsApp customer reply simulator to evaluate offer acceptance, declines, and expirations.
  - Route handlers and tests for offer management and status transitions.
