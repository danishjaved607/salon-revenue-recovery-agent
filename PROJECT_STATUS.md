# Salon Revenue Recovery Agent — Project Status

## Overview
This document tracks completed work, current progress, architectural decisions, known constraints, automated test status, and next steps across all milestones.

---

## Milestone Progress

| Milestone | Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | **Project Setup and Synthetic Data**: Project structure, package setup, synthetic datasets, SQLite init, idempotent seed loader, test suite | **Completed** | Full in-memory and file-based test coverage passed |
| **Milestone 2** | **Core Booking and Recovery Logic**: Cancellation detection, eligibility engine, waitlist matching, and safe booking confirmation | **Completed** | Parts A, B, and C verified with 54 tests across cancellation, matching, and booking |
| **Milestone 3** | **Offers and Revenue Tracking**: Part A (Offer Creation & Tracking), Part B (AI Message Drafting & Fallbacks), Part C (Revenue Tracking & Dashboard Metrics) | **Completed** | Parts A, B, and C verified with 49 tests (123 total project tests passed, 0 failed, 36 suites) |
| **Milestone 4** | **Genuine AI Agent with OpenAI Tool Calling**: Part A (Foundation & Tool Schemas - Completed), Part B (Recovery Workflow & Tool Integration - Completed), Part C (Reply Simulation & Autonomous Confirmation - Completed) | **Completed** | Parts A, B, and C verified with 72 tests across agent, agentRoutes, and replySimulator (195 total project tests passed, 0 failed, 49 suites) |
| **Milestone 5** | **React Frontend and Dashboard UI**: User-facing React + Vite interface for appointments, cancellations, waitlist, matching candidates, offers, simulated customer responses, recovered bookings, and revenue metrics | **In Progress (Part A Completed)** | Part A (React Frontend Foundation) completed. Layout shell, sidebar, header, routing, API client, design tokens, and build checks verified. |
| **Milestone 6** | **Integration, Testing, Security, Documentation and Certification Demo**: End-to-end integration, comprehensive testing, security review, documentation, and certification-ready demonstration | **Not Started** | Final milestone |

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
- Total test suite count across project: **67 tests passing (0 failing)** across 21 suites (`setup.test.js`, `cancellation.test.js`, `matching.test.js`, and `booking.test.js`).

---

## Milestone 2 — Part C Implementation Summary: Safe Booking Confirmation & Double-Booking Prevention

### 1. Booking Confirmation Service (`services/bookingService.js`)
- **`confirmBooking(appointmentId, waitlistId, optionsOrDb, maybeDb)`**:
  - **Transactional Integrity**: Encapsulates all read-validations and multi-table updates inside a SQLite `BEGIN IMMEDIATE` transaction via `withTransaction()`, guaranteeing immediate write lock acquisition and atomic rollback if any condition fails.
  - **Live State Revalidation**: Does not trust stale or cached matching results. Inside the transaction, revalidates:
    1. Slot existence and status (`status === 'cancelled'`; rejects already recovered slots with 409 `SLOT_ALREADY_CONFIRMED` and non-cancelled slots with 400 `INVALID_APPOINTMENT_STATUS`).
    2. Waitlist candidate existence and status (`status === 'waiting'`; rejects already booked entries with 409 `WAITLIST_ALREADY_BOOKED`).
    3. Service compatibility (`candidate.serviceId === appointment.serviceId`).
    4. Current customer and waitlist consent (`customers.consentToOffers === 1` and `waitlist.consentGiven === 1`).
    5. Assigned staff qualifications (`staff.specializations.includes(appointment.serviceId)`).
    6. Assigned staff schedule: working days, shift hours, and scheduled break intervals.
    7. Staff active appointment conflicts: checks for active overlapping bookings (`confirmed` or `recovered`), rejecting with 409 `STAFF_TIME_CONFLICT`.
    8. Customer active appointment conflicts: checks for active overlapping bookings (`confirmed` or `recovered`), rejecting with 409 `CUSTOMER_TIME_CONFLICT`.
    9. Customer availability and staff preferences (`availableDates`, `availableTimeSlots` bucket, `preferAnyStaff` vs. `preferredStaffId`).
  - **Guarded Atomic Updates**:
    - Updates `appointments`: sets `status = 'recovered'`, `customerId = waitlist.customerId`, and appends recovery notes with guard `WHERE id = ? AND status = 'cancelled'`. Throws 409 `CONCURRENT_MODIFICATION` if row count is 0.
    - Updates `waitlist`: sets `status = 'booked'` with guard `WHERE id = ? AND status = 'waiting'`. Throws 409 `CONCURRENT_MODIFICATION` if row count is 0.
    - Updates `customers`: safely appends `appointment.id` to `customer.bookingHistory` JSON array.
    - Updates `offers`: if a corresponding offer exists in `offers` for this `(waitlistId, appointmentId)`, updates its status to `'accepted'` and sets `respondedAt`.
  - Returns structured confirmation object containing booking details, refreshed appointment, and waitlist records.

### 2. API Routes (`routes/appointments.js`)
- Added endpoints:
  - `POST /api/appointments/:id/confirm`: Accepts `{ waitlistId, notes, confirmedAt }` and returns HTTP 200 with structured booking confirmation.
  - `POST /api/appointments/:id/confirm-recovery`: Expressive alias for the recovery confirmation endpoint.
  - Structured error responses: HTTP 400 for input/validation errors, 404 for missing records, and 409 for conflicts / duplicate confirmation attempts.

### 3. Automated Tests & Results (`tests/booking.test.js`)
- 20 focused tests organized into 7 suites:
  1. **Successful Confirmation & State Transitions** (2 tests):
     - Confirms cancelled slot `apt-001` with `wl-001`, verifying status transitions (`appointments` to `recovered`, `waitlist` to `booked`, `customers.bookingHistory` updated).
     - Transitions matching offer in `offers` to `accepted` with `respondedAt`.
  2. **Input Validation & Invalid Statuses** (5 tests):
     - Rejects missing IDs (400 `INVALID_INPUT`).
     - Rejects nonexistent appointment (404 `APPOINTMENT_NOT_FOUND`).
     - Rejects confirmed appointment (400 `INVALID_APPOINTMENT_STATUS`).
     - Rejects completed appointment (400 `INVALID_APPOINTMENT_STATUS`).
     - Rejects nonexistent waitlist entry (404 `WAITLIST_NOT_FOUND`).
  3. **Ineligible Candidate Revalidation** (6 tests):
     - Rejects service mismatch (400 `SERVICE_MISMATCH`).
     - Rejects revoked customer offer consent (400 `NO_CUSTOMER_CONSENT`).
     - Rejects revoked waitlist consent (400 `NO_WAITLIST_CONSENT`).
     - Rejects slot date not in customer `availableDates` (400 `DATE_NOT_AVAILABLE`).
     - Rejects time bucket mismatch (400 `TIME_SLOT_NOT_AVAILABLE`).
     - Rejects preferred staff mismatch when `preferAnyStaff = 0` (400 `STAFF_PREFERENCE_MISMATCH`).
  4. **Staff Qualifications & Time Conflicts** (2 tests):
     - Rejects unqualified staff assignment (400 `STAFF_NOT_QUALIFIED`).
     - Rejects conflicting active staff appointment and verifies complete rollback (409 `STAFF_TIME_CONFLICT`).
  5. **Customer Double-Booking Prevention** (1 test):
     - Rejects conflicting active customer appointment and verifies complete rollback (409 `CUSTOMER_TIME_CONFLICT`).
  6. **Duplicate Confirmation Prevention** (2 tests):
     - Rejects repeated confirmation of an already-recovered slot (409 `SLOT_ALREADY_CONFIRMED`).
     - Rejects booking an already-booked waitlist candidate into another slot (409 `WAITLIST_ALREADY_BOOKED`).
  7. **Competing Confirmation Requests & Concurrency** (2 tests):
     - Serializes competing requests for the same slot, allowing exactly one to succeed and rejecting the second with 409 without data corruption.
     - Verifies guarded update rejection on simulated race modification.
- Total test suite count across project: **67 tests passing (0 failing)** across 21 suites (`setup.test.js`, `cancellation.test.js`, `matching.test.js`, and `booking.test.js`).

---

## Milestone 3 — Part A Implementation Summary: Offer Creation & Tracking

### 1. Database Schema Reuse
- Reused existing `offers` table defined during Milestone 1 in `config/database.js` without any migrations or schema alterations:
  - `id TEXT PRIMARY KEY`
  - `waitlistId TEXT NOT NULL REFERENCES waitlist(id)`
  - `appointmentId TEXT NOT NULL REFERENCES appointments(id)`
  - `customerId TEXT NOT NULL REFERENCES customers(id)`
  - `messageText TEXT NOT NULL`
  - `status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','sent','accepted','declined','no_reply','expired'))`
  - `generatedAt TEXT NOT NULL` (ISO-8601 timestamp)
  - `approvedAt TEXT`
  - `sentAt TEXT`
  - `respondedAt TEXT`
  - `aiGenerated INTEGER NOT NULL DEFAULT 0`

### 2. Core Service (`services/offerService.js`)
- **`createOffer(appointmentId, waitlistId, optionsOrDb, maybeDb)`**:
  - **Immediate Transaction Isolation**: Uses `withTransaction` (`BEGIN IMMEDIATE`) to guard concurrent reads and writes.
  - **Live State Revalidation**:
    1. Validates slot existence and checks that `status === 'cancelled'` (throws 404 `APPOINTMENT_NOT_FOUND` or 400 `INVALID_APPOINTMENT_STATUS`).
    2. Validates waitlist candidate existence and checks that `status === 'waiting'` (throws 404 `WAITLIST_NOT_FOUND` or 400 `INVALID_WAITLIST_STATUS`).
    3. Revalidates staff qualification via `checkStaffQualification` (throws 400 `STAFF_NOT_QUALIFIED`).
    4. Revalidates staff schedule boundaries, working days, breaks, and overlapping active bookings via `checkStaffAvailability` (throws 409 `STAFF_TIME_CONFLICT`).
    5. Revalidates candidate eligibility: service match, dual consent (`customers.consentToOffers` and `waitlist.consentGiven`), dates, time bucket preference, staff preference, and customer overlapping active appointments (`CUSTOMER_DOUBLE_BOOKED` throws 409).
  - **Duplicate Active Offer Prevention**:
    - Queries for existing offers matching `(waitlistId, appointmentId)` in active statuses (`pending_approval`, `approved`, `sent`).
    - Rejects duplicate active offers with 409 `DUPLICATE_ACTIVE_OFFER`.
    - Allows creating a new offer if prior offers are in terminal states (`declined`, `expired`, `no_reply`).
  - **Creation**: Inserts record with UUID, initial status (default `pending_approval`), `generatedAt` timestamp, and formatted or custom message text.
- **`getOfferById(id, targetDb)`**:
  - Retrieves an offer joined with customer details (`name`, `phone`, `email`), appointment schedule (`date`, `startTime`, `endTime`), service name, and staff name.
- **`getOffers(filters, targetDb)`**:
  - Queries offers with optional filters: `appointmentId`, `waitlistId`, `customerId`, and `status`, sorted by `generatedAt DESC`.
- **`getOffersForAppointment(appointmentId, targetDb)`**:
  - Retrieves all offers for a slot, checking slot existence first and throwing 404 `APPOINTMENT_NOT_FOUND` if nonexistent.
- **`updateOfferStatus(offerId, newStatus, details, targetDb)`**:
  - Validates `newStatus` against allowed enum values.
  - Updates status and selectively records `approvedAt`, `sentAt`, or `respondedAt` timestamps based on lifecycle transition.

### 3. API Routes & Modified Files
- **New Files**:
  - `server/services/offerService.js`: Core offer service logic, revalidation, and error handling.
  - `server/routes/offers.js`: Express routes for offer management.
  - `server/tests/offers.test.js`: Comprehensive automated test suite.
- **Modified Files**:
  - `server/app.js`: Mounted `app.use('/api/offers', require('./routes/offers'))`.
  - `server/routes/appointments.js`: Added `GET /api/appointments/:id/offers` returning offers for a slot with HTTP 404 validation for nonexistent appointments.
- **API Endpoints**:
  - `POST /api/offers` — Create a validated offer linking waitlist candidate to cancelled appointment slot.
  - `GET /api/offers` — Query offers with filters (`appointmentId`, `waitlistId`, `customerId`, `status`).
  - `GET /api/offers/:id` — Fetch single offer with joined relational metadata.
  - `PATCH /api/offers/:id/status` — Advance offer lifecycle status and record timestamps.
  - `GET /api/appointments/:id/offers` — List offers for an appointment slot (returns HTTP 404 if slot does not exist).

### 4. Automated Tests & Results (`tests/offers.test.js`)
- 29 focused tests organized into 6 suites:
  1. **Successful Offer Creation & Tracking** (7 tests):
     - Creates default offer (`pending_approval`) with joined customer, staff, and service metadata.
     - Creates offer with custom message and initial approved/sent status.
     - Retrieves offer by ID.
     - Queries offers with filters (`appointmentId`, `waitlistId`, `status`).
     - Retrieves offers for an existing appointment slot via `getOffersForAppointment`.
     - Validates HTTP 404 `APPOINTMENT_NOT_FOUND` when querying offers for nonexistent slot.
     - Validates HTTP 400 `INVALID_INPUT` when appointment ID is empty.
  2. **Appointment State Revalidation** (4 tests):
     - Rejects missing ID (400), nonexistent appointment (404), confirmed appointment (400), completed appointment (400).
  3. **Waitlist Candidate Revalidation** (3 tests):
     - Rejects missing waitlist ID (400), nonexistent waitlist entry (404), non-waiting candidate (400).
  4. **Live Eligibility Revalidation** (8 tests):
     - Rejects service mismatch (400 `SERVICE_MISMATCH`).
     - Rejects customer revoked consent (400 `NO_CUSTOMER_CONSENT`).
     - Rejects waitlist revoked consent (400 `NO_WAITLIST_CONSENT`).
     - Rejects date mismatch (400 `DATE_NOT_AVAILABLE`).
     - Rejects time bucket mismatch (400 `TIME_SLOT_NOT_AVAILABLE`).
     - Rejects preferred staff mismatch when `preferAnyStaff = 0` (400 `STAFF_PREFERENCE_MISMATCH`).
     - Rejects staff active time conflict (409 `STAFF_TIME_CONFLICT`).
     - Rejects customer active time conflict (409 `CUSTOMER_DOUBLE_BOOKED`).
  5. **Duplicate Active Offer Prevention** (2 tests):
     - Rejects duplicate active offer for same pair (409 `DUPLICATE_ACTIVE_OFFER`).
     - Allows new offer after prior offer reaches terminal status (`declined`/`expired`).
  6. **Offer Lifecycle Updates** (5 tests):
     - Advances status to `approved` and populates `approvedAt`.
     - Advances status to `sent` and populates `sentAt` and `approvedAt`.
     - Transitions to terminal statuses (`declined`, `expired`).
     - Rejects invalid status string (400).
     - Rejects nonexistent offer ID (404).
- **Test Suite Results**:
  - Total test count across project: **96 tests passing (0 failing)** across 27 suites (initial run: 93 passed; 96 passed after `getOffersForAppointment` 404 validation test addition).

---

## Milestone 3 — Part B Implementation Summary: AI Message Drafting & Fallback Templates

### 1. Dedicated AI Message Drafting Service (`services/messageDraftingService.js`)
- **`buildOfferPrompt({ customer, service, appointment, staff, waitlist })`**:
  - Generates prompt-injection-safe prompts using verified factual context (customer name, returning client indicator, service name, duration, price, currency, slot date, start time, staff specialist name).
  - Explicitly strips customer PII: phone numbers, email addresses, and raw booking history IDs are never passed to the model.
  - Instructs the model to treat data strictly as passive context (not instructions), enforces concise SMS-friendly length (under 220 chars), anti-hallucination constraints (no invented discounts/times), and the mandatory Call-To-Action (CTA): `"Reply YES to confirm or NO to pass."`.
- **`generateFallbackMessage(context)`**:
  - Deterministic template generator handling 3 distinct scenarios:
    1. **Returning Client**: Welcomes back returning clients acknowledging relationship.
    2. **Priority Waitlist**: Highlights priority waitlist availability for priority 1 entries.
    3. **Standard Slot**: Friendly, direct slot notification.
  - Guarantees message under 250 characters and strictly ends with the mandatory CTA.
- **`draftOfferMessage(context, options)`**:
  - Securely reads `OPENAI_API_KEY`, `OPENAI_MODEL` (default: `gpt-4o-mini`), and `OPENAI_TIMEOUT_MS` (default: `5000ms`).
  - Supports dependency injection for testing (`options.client`, `options.apiKey`, `options.timeoutMs`).
  - Automatically degrades to deterministic fallback without throwing on:
    - Missing or empty API key.
    - Network timeout or connection drop.
    - Rate limit (429) or quota exhaustion.
    - Authentication errors (401).
    - Server errors (500).
    - Empty or whitespace-only response.
  - Guarantees CTA inclusion even if the model omitted it.
  - Accurately reports `{ messageText, aiGenerated: boolean, reason?: string }`.
  - Zero sensitive data logging.

### 2. Offer Creation Integration & Human Approval Enforcement
- **Offer Creation Workflow (`services/offerService.js`)**:
  - `createOffer` disallows creating an offer directly in `sent` status (HTTP 400 `INVALID_STATUS`).
  - When caller supplies manual `messageText`, forces `aiGenerated = 0` (preventing false claims).
  - When called synchronously without pre-drafted text, utilizes `generateFallbackMessage` using verified candidate/appointment context.
  - `createOfferAsync` provides asynchronous offer generation, orchestrating `draftOfferMessage` before delegating to transactional `createOffer`.
- **API Routes (`routes/offers.js`)**:
  - `POST /api/offers` integrated with `createOfferAsync` for automated AI drafting with fallback.
- **Human Approval Enforcement (`updateOfferStatus`)**:
  - Enforces explicit lifecycle sequence: `pending_approval` → `approved` → `sent`.
  - Rejects attempts to transition an unapproved offer directly to `sent` with HTTP 400 `OFFER_NOT_APPROVED`.

### 3. Automated Tests & Results (`tests/messageDrafting.test.js` & `tests/offers.test.js`)
- 19 new tests added in `tests/messageDrafting.test.js`:
  1. **Prompt Builder & Context Safety** (4 tests): CTA enforcement, factual context injection, PII exclusion, client categorization.
  2. **Deterministic Fallback Templates** (3 tests): Standard slot, returning client, and priority waitlist scenarios with length validation.
  3. **Mocked OpenAI Message Drafting** (2 tests): Successful generation with `aiGenerated = true` and CTA auto-append.
  4. **Fallback Resilience & Error Handling** (6 tests): Missing key, timeout, 429 quota exhaustion, 401 auth, 500 server error, empty response.
  5. **Async Offer Creation Integration** (3 tests): AI drafting with `aiGenerated = 1`, fallback with `aiGenerated = 0`, and manual override forcing `aiGenerated = 0`.
  6. **Human Approval Enforcement** (updated in `tests/offers.test.js`): Rejection of unapproved send (`OFFER_NOT_APPROVED` 400) and disallowing direct creation in `sent` status (`INVALID_STATUS` 400).
- **Test Suite Results**:
  - Total test count across project: **115 tests passing (0 failing)** across 32 suites (zero external network calls, zero API costs).

---

## Milestone 3 — Part C Implementation Summary: Revenue Tracking & Dashboard Metrics

### 1. Revenue Service (`services/revenueService.js`)
- **`getRevenueMetrics(targetDb = db)`**:
  - **Relational Aggregation**: Joins `appointments` with `services` on `serviceId` to sum actual catalog prices for recovered bookings, eliminating redundant price data duplication.
  - **Key Metrics Calculated**:
    - `recoveredBookingsCount`: Total count of appointments where `status = 'recovered'`.
    - `recoveredRevenue`: Sum of service prices for all recovered appointments.
    - `cancelledBookingsCount`: Count of currently cancelled appointments.
    - `lostRevenue`: Total lost revenue from currently cancelled appointments.
    - `totalCancellations`: Total historical cancellations (`recoveredCount + cancelledCount`).
    - `appointmentRecoveryRate`: Percentage of cancelled slots successfully recovered (`recovered / totalCancellations * 100`).
    - `offersCreatedCount`: Total count of records in `offers`.
    - `offersAcceptedCount`: Count of offers where `status = 'accepted'`.
    - `offerAcceptanceRate`: Percentage of offers accepted (`accepted / totalOffers * 100`).
    - `offersBreakdownByStatus`: Full distribution across `pending_approval`, `approved`, `sent`, `accepted`, `declined`, `expired`.
    - `currency`: Dynamic currency resolution from services catalog (defaults to `'PKR'`).
    - `breakdownByService`: Clean service-level breakdown containing `serviceId`, `serviceName`, `category`, `price`, `currency`, `recoveredCount`, and `recoveredRevenue` ordered by revenue descending.
  - **Zero-Denominator Safety**: Uses `safePercentage()` to guarantee safe return of `0` instead of `NaN` or `Infinity` when denominators are zero.

### 2. Dashboard API Route (`routes/dashboard.js`)
- Mounted in `app.js` under `/api/dashboard`:
  - `GET /api/dashboard/metrics`: Returns `{ success: true, metrics }` providing the full payload needed by the future frontend dashboard.
  - Centralized error handling via Express `next(err)`.

### 3. Automated Tests & Results (`tests/revenue.test.js`)
- 8 new tests organized into 4 suites:
  1. **Revenue Metrics Initial State** (3 tests):
     - Validates initial 0 recovered count and 0 revenue on fresh seed data.
     - Validates zero offers and 0% acceptance rate on seed data.
     - Validates complete 10-service breakdown with catalog attributes.
  2. **Zero-Denominator Handling** (2 tests):
     - Unit test for `safePercentage` asserting `0` on zero or negative denominators.
     - Empty database test asserting safe metrics calculation without exceptions.
  3. **Workflow Integration & Dynamic Calculation** (2 tests):
     - Verifies metric updates when an appointment is recovered through `confirmBooking()` (revenue increases by exact service price, recovery rate updates, offer transitions to accepted, acceptance rate reaches 100%).
     - Verifies multiple recoveries across different services and prices (`svc-001` + `svc-003` = 14,500 PKR, recovery rate = 33.33%).
  4. **Dashboard Route Contract** (1 test):
     - Verifies complete payload structure matching the frontend dashboard specification.
- **Total Test Suite Count**: **123 tests passing (0 failing)** across 36 suites.

---

## Architectural Decisions

1. **Node 22 Built-in `node:sqlite` (`DatabaseSync`)**:
   - Replaced native add-ons like `better-sqlite3` with Node's native SQLite module (available since Node 22.5.0).
   - Eliminates Windows C++ build dependencies (such as Visual Studio C++ Build Tools or `node-gyp`), ensuring zero-friction setup across environments.
2. **Node 22 Native Test Runner (`node:test`)**:
   - Uses built-in `node:test` and `node:assert/strict`.
   - Eliminates heavyweight testing framework dependencies and version mismatches.
3. **Immediate SQLite Transaction Isolation (`BEGIN IMMEDIATE`)**:
   - Acquires a write lock immediately upon entering the transaction, ensuring competing concurrent workers are serialized before modifying slot or waitlist records.
4. **Live State Revalidation (No Stale Reads)**:
   - Always re-queries appointment and waitlist status, consent, schedule, and conflicts inside the transaction immediately prior to executing state transitions.
5. **Guarded Atomic State Transitions**:
   - Updates are conditioned with `WHERE id = ? AND status = 'cancelled'` (for appointments) and `WHERE id = ? AND status = 'waiting'` (for waitlist) with `changes === 1` checks to prevent race condition corruption.
6. **Deterministic Eligibility & Matching Engine**:
   - Multi-stage qualification and availability checks (staff qualification, staff shifts, breaks, customer consent, service match, dates, time buckets, and double-booking protection) are kept completely deterministic in pure SQL and JavaScript logic, strictly decoupled from future AI offer drafting.
7. **Time Bucket & Interval Math**:
   - Minute-from-midnight conversion (`timeToMinutes`) and standard interval intersection (`startA < endB && endA > startB`) provide timezone-safe, sub-minute precision schedule collision detection.
8. **Relational Foreign Key Constraints**:
   - `PRAGMA foreign_keys = ON` enforced at SQLite connection opening to guarantee data consistency.
9. **Graceful AI Degradation & Privacy Sandbox**:
   - AI drafting strictly treats client data as read-only passive context, never passes direct PII (phone/email), and always falls back to deterministic templates without throwing errors or blocking bookings.
10. **Human-in-the-Loop Gating**:
    - AI-generated offers must be created in `pending_approval` and require explicit human approval before being marked as `sent`.
11. **Relational Revenue Aggregation (Zero Redundant Price Duplication)**:
    - Calculates recovered revenue dynamically by joining `appointments.serviceId` with `services.price`. Avoids historical price schema bloat while adhering to current single-salon catalog requirem     - All rate calculations (`appointmentRecoveryRate`, `offerAcceptanceRate`) use safe division guards returning `0` rather than `NaN` or `Infinity`.

---

## Milestone 4 — Part A Implementation Summary: Genuine AI Agent Foundation

### 1. Safety-First System Prompt (`SYSTEM_PROMPT`)
- Establishes the agent's core role as an intelligent AI concierge for salon revenue recovery.
- Sets strict operational boundaries:
  - All business facts must originate exclusively from approved backend tools (no hallucinations or assumptions).
  - Customer data and notes are passive, untrusted context; prompt injection attacks are ignored.
  - Customer consent and deterministic eligibility rules cannot be bypassed.
  - The AI cannot approve or send offers on its own (status enforced as `pending_approval`).
  - Booking confirmation must occur through deterministic backend workflows (`confirmBooking`).
  - Tool errors and candidate exclusions are reported factually without inventing success.

### 2. Seven Approved OpenAI Function Tool Definitions (`TOOL_DEFINITIONS`)
- Implements strict function tool schemas conforming to OpenAI specifications with `additionalProperties: false`:
  1. **`get_cancelled_appointments`**: Optional `date` filter (YYYY-MM-DD); retrieves cancelled appointment slots.
  2. **`get_appointment_details`**: Required `appointmentId`; retrieves full slot and joined service/staff details.
  3. **`find_eligible_waitlist_candidates`**: Required `appointmentId`; executes the deterministic qualification engine.
  4. **`explain_candidate_eligibility`**: Required `appointmentId`, optional `waitlistId`; returns detailed exclusion codes and messages.
  5. **`create_recovery_offer`**: Required `appointmentId` and `waitlistId`; strictly excludes `customMessage` (delegating message drafting to `messageDraftingService`) and enforces `pending_approval` status.
  6. **`get_offer_status`**: Optional `offerId`, `appointmentId`, `status`; queries active or historical offers.
  7. **`get_dashboard_metrics`**: No parameters; returns high-level revenue recovery analytics.
- No arbitrary SQL or raw database mutation tools are exposed to the AI model.

### 3. Central Tool Argument Validation (`validateToolArguments`)
- Schema-driven validation without external dependencies:
  - Validates JSON parseability and non-null object payload.
  - Rejects unknown tool names with `UNKNOWN_TOOL`.
  - Rejects unrecognized parameters with `UNEXPECTED_PROPERTY` (enforcing `additionalProperties: false`).
  - Validates presence and non-emptiness of all required fields (`MISSING_REQUIRED_ARGUMENT`, `EMPTY_ARGUMENT`).
  - Validates data types, maximum string length (<= 100 chars), date format (`YYYY-MM-DD`), and status enum values.

### 4. Conversation History Validation & Security (`validateConversationHistory`)
- Inspects client-supplied conversation history prior to model submission:
  - Caps history at 20 messages and individual message content at 2000 characters.
  - Rejects non-array structures with `INVALID_HISTORY_FORMAT`.
  - Enforces role gating: only `'user'` and `'assistant'` roles are accepted from clients; incoming `'system'`, `'developer'`, or `'tool'` messages are rejected with `DISALLOWED_ROLE`.
  - Strips leading and trailing whitespace from message content.

### 5. Defensive PII Sanitization (`sanitizePii`)
- Deeply inspects and sanitizes all data payloads returned from deterministic backend services before returning them to OpenAI.
- Strips `phone`, `customerPhone`, `email`, and `customerEmail` fields to prevent PII leakage to external LLM providers.

### 6. Controlled Tool Dispatcher (`dispatchTool`)
- Bridges validated tool calls to existing deterministic domain services:
  - `cancellationService.getCancelledAppointments`
  - `cancellationService.getAppointmentById`
  - `matchingService.findEligibleCandidates`
  - `offerService.createOfferAsync`
  - `offerService.getOffers` / `getOfferById`
  - `revenueService.getRevenueMetrics`
- Encapsulates domain errors into structured `{ success: false, error: { code, message } }` payloads so the LLM can reason over failures without crashing.
- Supports custom mock tool handlers via `options.toolHandlers` for modular, dependency-injected testing.

### 7. Multi-Turn OpenAI Tool-Calling Loop (`runAgent`)
- Implements autonomous multi-turn reasoning:
  - Injects immutable server-owned system prompt and sanitized conversation history.
  - Sends tool definitions (`tools`) with `tool_choice: 'auto'`.
  - Parses assistant tool calls, validates arguments, dispatches to backend services, and appends results with matching `tool_call_id`.
  - Continues reasoning until a final text response is produced or iteration ceiling is hit.
  - Enforces circuit breaker capped at `maxIterations` (default: 6) to eliminate infinite runaway loops.
  - Supports dependency injection (`options.client`) enabling 100% offline testing without network access or API key requirements.

### 8. Automated Tests
- Located at `server/tests/agent.test.js`:
  - 31 automated tests across 5 test suites.
  - Verifies tool schemas, argument validation, history validation, PII sanitization, and multi-turn tool-calling loops.
  - Runs in-memory with zero network calls and zero API cost.
- **Total Project Test Suite Count**: **154 tests passing (0 failing)** across 41 suites.

---

## Milestone 4 — Part B Implementation Summary: Backend Integration & Intelligent Recovery Workflow

### 1. Integration of All Seven AI Tools with Domain Services
All seven approved tools in `server/services/agentService.js` are connected to real backend implementations (zero placeholders):
1. **`get_cancelled_appointments`**:
   - Calls `cancellationService.getCancelledAppointments(targetDb, { date: args.date })`.
   - Returns cancelled appointment records, with optional YYYY-MM-DD date filtering.
2. **`get_appointment_details`**:
   - Retrieves full appointment record with joined details from `services`, `staff`, and `customers`.
   - Returns service name, duration, price, category, staff name, customer name, date, and time.
   - Strips sensitive PII (`customerPhone`, `customerEmail`) via `sanitizePii`.
   - Safely handles missing appointments with structured `APPOINTMENT_NOT_FOUND` error.
3. **`find_eligible_waitlist_candidates`**:
   - Calls `matchingService.findEligibleCandidates(args.appointmentId, targetDb)`.
   - Executes multi-stage deterministic qualification (service match, staff qualification, schedule shift, breaks, customer consent, time bucket, double-booking prevention).
   - Preserves deterministic priority and waitlist ranking.
4. **`explain_candidate_eligibility`**:
   - For a specific candidate (`waitlistId` provided): Inspects `eligibleCandidates` for qualifying reasons (priority, preferred staff, requested service) or `excludedCandidates` for specific deterministic exclusion codes (e.g., `NO_CUSTOMER_CONSENT`, `SERVICE_MISMATCH`, `DOUBLE_BOOKING_CONFLICT`).
   - For an aggregate summary (`waitlistId` omitted): Returns total eligible, total excluded count, and breakdown of exclusion reasons across all candidates.
5. **`create_recovery_offer`**:
   - Calls `offerService.createOfferAsync(args.appointmentId, args.waitlistId, draftingOptions, targetDb)`.
   - Strictly enforces `pending_approval` lifecycle status (human-in-the-loop gating; AI cannot approve or send).
   - Strictly rejects custom AI-written messages (delegates drafting to `messageDraftingService`).
   - Automatically revalidates slot eligibility and enforces consent and duplicate-offer protections.
6. **`get_offer_status`**:
   - Calls `offerService.getOfferById` (if `offerId` supplied) or `offerService.getOffers` with optional `appointmentId` and `status` filters.
   - Returns structured offer lifecycle status and details.
7. **`get_dashboard_metrics`**:
   - Calls `revenueService.getRevenueMetrics(targetDb)`.
   - Returns total recovered revenue, recovered bookings, offer acceptance rate, recovery rate, and service-level breakdowns.

### 2. Agent Chat API Route (`server/routes/agent.js`)
- Exposes `POST /api/agent/chat` mounted at `/api/agent` in `server/app.js`.
- **Request Validation**:
  - Requires non-empty string `message` (up to 2000 characters).
  - Validates `conversationHistory` via `validateConversationHistory()`.
  - Rejects client-supplied `system`, `developer`, or `tool` roles (`DISALLOWED_ROLE`).
- **Dependency Injection**:
  - Reads `req.app.locals.openAiClient` and `req.app.locals.db` to support in-memory test databases and mocked OpenAI clients.
- **Consistent Response Envelope**:
  - Returns `{ success: true, reply: "...", toolExecutions: [...], iterations: N }`.
- **Safe Error Encapsulation**:
  - Emits 400 for validation errors, 503 if OpenAI API key is missing or service unavailable, and 500 for unexpected errors.
  - Never leaks stack traces, API keys, or internal database secrets.

### 3. Automated Tests (`server/tests/agentRoutes.test.js`)
- 13 automated tests across 3 suites using in-memory SQLite and mock OpenAI clients:
  1. **Route Validation & Safety**:
     - Rejects missing message (400 `MISSING_MESSAGE`).
     - Rejects empty/whitespace message (400 `INVALID_MESSAGE`).
     - Rejects message exceeding 2000 characters (400 `MESSAGE_TOO_LONG`).
     - Rejects invalid conversation history format (400 `INVALID_HISTORY_FORMAT`).
     - Rejects client-supplied system/developer role in history (400 `DISALLOWED_ROLE`).
     - Returns 503 `OPENAI_NOT_CONFIGURED` when API key is unconfigured.
  2. **Consistent Response Structure & Multi-Turn Workflows**:
     - Returns uniform envelope `{ success, reply, toolExecutions, iterations }` for conversational inquiries.
     - Mocked end-to-end recovery loop: identifies cancelled appointment -> queries waitlist matches -> creates recovery offer (pending approval) -> returns final summary.
     - Explains candidate eligibility with deterministic exclusion reasons.
     - Retrieves dashboard revenue metrics via tool call.
  3. **Domain Safety & Business Rules Enforcement**:
     - Rejects tool calls attempting to supply `customMessage` (enforcing schema gating).
     - Verifies customer PII (phone and email) is sanitized from tool execution outputs.
     - Prevents duplicate active offers for the same appointment and candidate.
     - Enforces customer consent gating (rejection when `consentToOffers = 0`).
- **Total Project Test Suite Count**: **167 tests passing (0 failing)** across 44 suites.

---

## Milestone 4 — Part C Implementation Summary: Simulated Customer Replies & Booking Confirmation

### 1. Simulated Customer Reply Service (`server/services/replySimulator.js`)
Implemented a robust customer reply processing service connecting offer responses to the core recovery booking engine:
- **`simulateCustomerReply(offerId, reply, optionsOrDb, maybeDb)`**:
  - Validates `offerId` (non-empty string) and normalizes `reply` (`YES`, `NO`, `NO_REPLY`). Rejects invalid values with 400 `INVALID_REPLY`.
  - Enforces offer existence: throws 404 `OFFER_NOT_FOUND` if record is missing.
  - Enforces offer response state gating: only offers in status `'sent'` may receive replies. Offers in `'pending_approval'` or `'approved'` are rejected with 400 `INVALID_OFFER_STATUS` (preserving the mandatory staff review and sending workflow).
  - Enforces terminal state duplicate protection: offers already in `'accepted'`, `'declined'`, or `'no_reply'` throw 409 `OFFER_ALREADY_PROCESSED`. Expired offers throw 409 `OFFER_EXPIRED`.
- **Workflow Branching**:
  - **`YES` (Accepted)**:
    - Connects directly to `bookingService.confirmBooking(appointmentId, waitlistId, options, targetDb)`.
    - Live-revalidates appointment status (`cancelled`), waitlist status (`waiting`), customer consent, and staff qualification/schedule within `BEGIN IMMEDIATE` transaction.
    - Transitions `appointments.status` to `'recovered'`, assigns `customerId` to waitlist customer, and appends recovery notes.
    - Transitions `waitlist.status` to `'booked'`.
    - Transitions `offers.status` to `'accepted'` and records `respondedAt`.
    - Automatically updates recovered revenue and booking metrics.
  - **`NO` (Declined)**:
    - Calls `updateOfferStatus(offerId, 'declined', { respondedAt }, targetDb)`.
    - Preserves appointment in `'cancelled'` status and waitlist entry in `'waiting'` status.
    - Does not create a booking and does not increment recovered revenue.
  - **`NO_REPLY` (No Response)**:
    - Calls `updateOfferStatus(offerId, 'no_reply', { respondedAt }, targetDb)`.
    - Preserves appointment in `'cancelled'` status and waitlist entry in `'waiting'` status.
    - Does not create a booking and does not increment recovered revenue.

### 2. API Route (`POST /api/offers/:id/simulate-reply`)
- Added to `server/routes/offers.js`:
  - Validates request body contains a valid `reply` string (`YES`, `NO`, or `NO_REPLY`).
  - Supports dependency-injected test database via `req.app.locals.db`.
  - Returns 200 with structured JSON response `{ success, message, reply, status, appointmentRecovered, offer, booking? }`.
  - Encapsulates domain errors into structured HTTP error responses (400, 404, 409) without leaking stack traces or internal secrets.

### 3. Revenue Metrics Integration (`server/services/revenueService.js`)
- Updated SQL aggregations to count `no_reply` offers explicitly:
  - `COUNT(CASE WHEN status = 'no_reply' THEN 1 END) AS noReplyOffers`
  - Added `no_reply` to `offersBreakdownByStatus` payload.

### 4. Automated Tests (`server/tests/replySimulator.test.js`)
- 28 automated tests across 5 test suites using isolated in-memory SQLite (`:memory:`):
  1. **Customer Reply Workflows**: Validates YES (booking confirmed, slot recovered, revenue incremented), NO (declined, no booking, revenue unchanged), NO_REPLY (no_reply status, no booking, revenue unchanged), and case normalization.
  2. **Validation and State Gating**: Validates rejection of unsupported reply values, missing offer ID, non-existent offers (404), pending_approval gating (400), approved-not-sent gating (400), and expired offers (409).
  3. **Duplicate Protection & Concurrency**: Validates rejection of duplicate YES, duplicate NO, duplicate NO_REPLY, slot already confirmed conflict (409), customer revoked consent rejection, and waitlist already booked rejection (409).
  4. **HTTP Route Integration (`POST /api/offers/:id/simulate-reply`)**: Validates HTTP status codes (200, 400, 404, 409) and JSON envelopes.
  5. **Complete End-to-End Workflow Integration**: Validates the full 9-step recovery sequence from cancelled slot detection to waitlist matching, offer creation, human approval gating, sending, customer reply, slot recovery, and revenue metric updates.
- **Total Project Test Suite Count**: **195 tests passing (0 failing)** across 49 suites.

---

## Milestone 5 — Part A Implementation Summary: React Frontend Foundation

### 1. Application Layout & Design Tokens
- **Design Direction**: Professional SaaS shell with a premium light theme tailored for salon business software. Clean white and light blush neutral backgrounds (`#faf7f8`, `#f8f4f5`, `#ffffff`), soft blush-pink primary accents (`#c96b83`, light tint `#faedf0`), dark charcoal typography (`#1f242e`, `#475467`), subtle borders (`#ede5e7`), and soft elevation shadows.
- **Typography**: Google Fonts integration (`Inter` for body readability and `Plus Jakarta Sans` for elegant headings), with fluid typography using CSS `clamp()` (`--font-size-xs` to `--font-size-2xl`).
- **Complete Responsive Design System**:
  - Scalable across viewports from 320px compact mobile up to 2560px 4K/ultrawide displays.
  - Breakpoints: `<= 480px` (compact mobile), `<= 900px` (tablet & mobile drawer), `>= 1920px` (ultrawide constraint 1560px), `>= 2560px` (4K constraint 1720px).
  - Fluid grid layouts: `repeat(auto-fit, minmax(min(100%, 320px), 1fr))`.
  - Overflow prevention: `overflow-x: hidden` and `max-width: 100vw` across root containers.
  - Accessibility: WCAG 44px touch targets (`--touch-target-min: 44px`), visible `:focus-visible` rings, `@media (prefers-reduced-motion: reduce)`, skip-to-content link (`.skip-link`), and Escape key listener with body scroll locking when mobile drawer is open.
- **CSS Architecture**: Organized cleanly into:
  - `client/src/styles/index.css`: Centralized CSS custom properties (colors, fluid fonts, fluid spacing, radii, elevations, transitions, focus states, skip link) and global reset.
  - `client/src/styles/layout.css`: SaaS shell container, fixed/sticky sidebar, brand block, mobile close button, navigation links with active state pill indicator, system status dot, sticky header with mobile drawer toggle button, and responsive viewport padding.
  - `client/src/styles/pages.css`: Reusable component cards (`.content-card`), milestone notice banners (`.milestone-banner`), card headers with icon boxes, feature bullet lists, backend API endpoint reference badges with wrapping guards, and 404 page styling.

### 2. Sidebar Navigation (`client/src/components/Sidebar.jsx`)
- Responsive sidebar navigation containing:
  - Salon Revenue Recovery Agent branding with scissors logo icon.
  - Navigation links with active route indicators:
    - **Dashboard** (`/dashboard`)
    - **Recovery Workspace** (`/recovery-workspace`)
    - **Offers** (`/offers`)
    - **AI Agent** (`/agent`)
  - Semantic inline SVG icons (Lucide-style) avoiding external icon package dependencies.
  - System status indicator in the sidebar footer ("Agent Engine Active").
  - Mobile responsive drawer with sliding transition (`transform: translateX(-100%)` to `translateX(0)`), mobile close button, and semi-transparent backdrop blur overlay (`.sidebar-overlay`) with keyboard accessibility.
  - Meets 44px touch target guidelines for all interactive links and buttons.

### 3. Reusable Header (`client/src/components/Header.jsx`)
- Dynamic route awareness reading current path from React Router (`useLocation()`):
  - Automatically updates page heading and contextual subtitle based on active route.
- Mobile menu toggle button (`.mobile-menu-btn`) accessible on screens `<= 900px` with `aria-expanded` and `aria-controls="app-sidebar"`.
- Real-time system status pill badge ("System Active") with soft blush accent styling, auto-collapsing to dot indicator on compact mobile `<= 480px` to protect title space.
- Zero fake user profiles or mock business data.

### 4. Declarative Routing & Page Placeholders (`client/src/App.jsx`)
- Configured using React Router DOM 7 declarative `BrowserRouter`, `Routes`, `Route`, `Navigate`, and `Outlet` layout structure:
  - `/` &rarr; Redirects to `/dashboard`.
  - `/dashboard` &rarr; `DashboardPage.jsx` (Overview of recovered revenue, slot fill rates, and turnaround metrics).
  - `/recovery-workspace` &rarr; `RecoveryWorkspacePage.jsx` (Cancelled appointment queue and candidate matching scoring).
  - `/offers` &rarr; `OffersPage.jsx` (Offer lifecycle management, approval gating, and reply simulation).
  - `/agent` &rarr; `AgentPage.jsx` (Conversational AI recovery concierge, transparent AI tool execution summaries, and safety safeguards).
  - `*` &rarr; `NotFoundPage.jsx` (Clean 404 fallback with return-to-dashboard navigation).
- All pages feature structured cards clearly detailing upcoming Milestone 5 parts and referencing real backend API routes (`GET /api/dashboard/metrics`, `GET /api/appointments/cancelled`, `GET /api/appointments/:id/matches`, `GET /api/offers`, `POST /api/offers/:id/simulate-reply`, `POST /api/agent/chat`). Zero fake mock metrics that could be mistaken for live backend data.
- Placeholder wording adheres strictly to requirements: utilizes "transparent AI tool execution summaries" and clearly attributes booking confirmation to simulated customer YES replies with backend transactional safeguards.

### 5. API Client Foundation (`client/src/api/client.js`)
- Reusable Axios instance with:
  - `baseURL: '/api'` utilizing the existing Vite development proxy (`http://localhost:3000`) and standard Express serving in production.
  - `timeout: 15000` (15-second request timeout).
  - Standard JSON headers (`Content-Type: application/json`, `Accept: application/json`).
  - Response interceptor normalizing backend error envelopes (`error.response?.data?.error?.message`) and code (`error.response?.data?.error?.code`).
  - Clear network error handling (`Unable to connect to the salon revenue server`) and timeout error handling.
  - Returns raw `response.data` on success.
  - Zero hardcoded credentials or secrets.

### 6. Quality & Verification
- **Vite Production Build**: `npm run build` executed in `client/`:
  - 32 modules transformed.
  - Production bundles generated cleanly: `dist/index.html` (0.94 kB), `dist/assets/index-*.css` (11.24 kB), `dist/assets/index-*.js` (202.51 kB).
  - 0 build errors, 0 warnings.
- **Backend Integrity**: All 49 backend test suites intact; zero modifications to server code or configuration.
- **Installed Dependencies**:
  - `react`: ^18.3.1
  - `react-dom`: ^18.3.1
  - `react-router-dom`: ^7.18.5
  - `axios`: ^1.7.2
  - `vite`: ^8.3.5
  - `@vitejs/plugin-react`: ^6.2.1

---

## Architectural Decisions

1. **Node 22 Built-in `node:sqlite` (`DatabaseSync`)**:
   - Replaced native add-ons like `better-sqlite3` with Node's native SQLite module (available since Node 22.5.0).
   - Eliminates Windows C++ build dependencies (such as Visual Studio C++ Build Tools or `node-gyp`), ensuring zero-friction setup across environments.
2. **Node 22 Native Test Runner (`node:test`)**:
   - Uses built-in `node:test` and `node:assert/strict`.
   - Eliminates heavyweight testing framework dependencies and version mismatches.
3. **Immediate SQLite Transaction Isolation (`BEGIN IMMEDIATE`)**:
   - Acquires a write lock immediately upon entering the transaction, ensuring competing concurrent workers are serialized before modifying slot or waitlist records.
4. **Live State Revalidation (No Stale Reads)**:
   - Always re-queries appointment and waitlist status, consent, schedule, and conflicts inside the transaction immediately prior to executing state transitions.
5. **Guarded Atomic State Transitions**:
   - Updates are conditioned with `WHERE id = ? AND status = 'cancelled'` (for appointments) and `WHERE id = ? AND status = 'waiting'` (for waitlist) with `changes === 1` checks to prevent race condition corruption.
6. **Deterministic Eligibility & Matching Engine**:
   - Multi-stage qualification and availability checks (staff qualification, staff shifts, breaks, customer consent, service match, dates, time buckets, and double-booking protection) are kept completely deterministic in pure SQL and JavaScript logic, strictly decoupled from future AI offer drafting.
7. **Time Bucket & Interval Math**:
   - Minute-from-midnight conversion (`timeToMinutes`) and standard interval intersection (`startA < endB && endA > startB`) provide timezone-safe, sub-minute precision schedule collision detection.
8. **Relational Foreign Key Constraints**:
   - `PRAGMA foreign_keys = ON` enforced at SQLite connection opening to guarantee data consistency.
9. **Graceful AI Degradation & Privacy Sandbox**:
   - AI drafting strictly treats client data as read-only passive context, never passes direct PII (phone/email), and always falls back to deterministic templates without throwing errors or blocking bookings.
10. **Human-in-the-Loop Gating**:
    - AI-generated offers must be created in `pending_approval` and require explicit human approval before being marked as `sent`.
11. **Relational Revenue Aggregation (Zero Redundant Price Duplication)**:
    - Calculates recovered revenue dynamically by joining `appointments.serviceId` with `services.price`. Avoids historical price schema bloat while adhering to current single-salon catalog requirements.
12. **Zero-Denominator Safe Arithmetic**:
    - All rate calculations (`appointmentRecoveryRate`, `offerAcceptanceRate`) use safe division guards returning `0` rather than `NaN` or `Infinity`.
13. **Strict OpenAI Function Tool Schema Gating (`additionalProperties: false`)**:
    - Every tool definition strictly disallows undeclared properties, ensuring LLMs cannot hallucinate or inject unauthorized parameters.
14. **Defensive PII Stripping for LLM Payloads**:
    - All payloads returned from database services pass through `sanitizePii()`, removing phone numbers and email addresses prior to serialization for the model.
15. **Conversation History Gating (Client Role Sanitization)**:
    - Client requests cannot forge `system`, `developer`, or `tool` roles, preserving server authority over prompts and tool results.
16. **Deterministic Tool Execution & Circuit Breakers (Max Iterations)**:
    - Limits reasoning iterations to a configurable threshold (default: 6), ensuring operations terminate predictably and prevent runaway API loops.
17. **Dependency Injection via Express Locals (`req.app.locals`)**:
    - Enables test suites to inject mock OpenAI clients and in-memory test databases cleanly through native Express `locals` without monkey-patching globals or requiring external mocking libraries.
18. **Rich Joined Appointment Tool Inspection**:
    - `get_appointment_details` performs a read-only relational join to provide the LLM with service duration, service price, category, staff name, and customer name, while stripping customer phone numbers and email addresses.
19. **Atomic Reply Processing and Booking Transition Isolation**:
    - Customer reply simulation delegates acceptance confirmation to `bookingService.confirmBooking()` within `BEGIN IMMEDIATE` transaction, ensuring live slot revalidation, customer conflict checks, and duplicate-offer locking.
20. **Centralized CSS Design Tokens & Native Custom Properties**:
    - Eliminates Tailwind and third-party CSS overhead in favor of standard CSS custom properties for colors, typography, elevations, and radii, enabling instant future theme customization without refactoring components.
21. **Standardized Axios API Envelope Interceptor**:
    - Centralizes extraction of the standard backend error envelope (`error.response?.data?.error?.message`) and handles transport/timeout failures gracefully across the entire React application.

---

## Known Issues / Constraints & Limitations

- Node.js emits an `ExperimentalWarning: SQLite is an experimental feature` log in Node 22, which is expected for `node:sqlite` and does not affect runtime reliability or test execution.
- Single-process in-memory SQLite instances are inherently isolated per test runner thread; production environments using file-based SQLite rely on WAL mode and `BEGIN IMMEDIATE` for cross-process concurrency safety.
- Live WhatsApp/SMS messaging transport remains deferred until the basic application is fully operational; offers transition to `sent` through human approval, with simulated customer responses (YES, NO, and NO_REPLY) driving booking recovery workflows.
- Revenue calculations currently reflect active catalog service pricing; historical price versioning is not implemented as per Milestone 3 constraints.

---

## Next Steps

- **Milestone 5 — React Frontend and Dashboard UI**: **In Progress (Part A Completed)**
  - **Part A: React Frontend Foundation (Completed)**: SaaS application shell, responsive sidebar navigation, contextual header, declarative React Router DOM 7 routing, API client, design system tokens, and production build verification.
  - **Part B: Revenue Dashboard & Metrics UI (Upcoming)**: Metric cards (`GET /api/dashboard/metrics`), recovery rates, service-level breakdown, and recent recovery activity feed.
  - **Part C: Recovery Workspace & Candidate Matching UI (Upcoming)**: Cancelled appointment queue (`GET /api/appointments/cancelled`) and candidate matching inspector (`GET /api/appointments/:id/matches`).
  - **Part D: Offer Management & Reply Simulation UI (Upcoming)**: Offer lifecycle tracking, human approval actions, and simulated reply triggers (`YES`, `NO`, `NO_REPLY`).
  - **Part E: Conversational AI Agent Studio UI (Upcoming)**: Interactive chat interface (`POST /api/agent/chat`) with transparent tool execution telemetry.

- **Milestone 6 — Integration, Testing, Security, Documentation and Certification Demo**:
  - End-to-end integration across frontend, backend, and AI agent.
  - Comprehensive testing, security review, documentation, and a certification-ready demonstration.
