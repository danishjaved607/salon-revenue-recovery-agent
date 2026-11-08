# Salon Revenue Recovery Agent

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D22.5.0-339933?logo=node.js)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)](https://react.dev/)
[![Express Version](https://img.shields.io/badge/Express-4.19.2-000000?logo=express)](https://expressjs.com/)
[![SQLite Engine](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite)](https://nodejs.org/api/sqlite.html)
[![AI Integration](https://img.shields.io/badge/OpenAI-Tool%20Calling-412991?logo=openai)](https://platform.openai.com/)
[![Tests](https://img.shields.io/badge/Tests-216%20Passed%20%7C%2058%20Suites-brightgreen)]()
[![Deployment Status](https://img.shields.io/badge/Deployment-PREPARED%20(NOT%20YET%20DEPLOYED)-orange)]()

> **AI Solution Engineering Certification Project**
> An intelligent, human-in-the-loop revenue recovery solution that automatically identifies cancelled salon slots, qualifies waitlist candidates with deterministic eligibility checks, drafts personalized offers with AI, and executes atomic double-booking-protected confirmations upon customer acceptance.

---

## Deployment Status: PREPARED (NOT YET DEPLOYED)

> [!IMPORTANT]
> **Current Deployment State:** **PREPARED — NOT YET DEPLOYED**
> Deployment readiness for the free Render hosting tier was established in Milestone 8, including Helmet HTTP security headers, dedicated CORS allowlist, public-demo rate limiters, 500 error masking, and the root `render.yaml` blueprint. The application is verified and ready for live cloud deployment upon certification review. Full deployment instructions are documented in [docs/DEPLOYMENT_GUIDE.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/docs/DEPLOYMENT_GUIDE.md).

---

## 1. Problem Statement

In the salon and personal wellness industry, last-minute appointment cancellations represent a significant financial loss:
- **Revenue Erosion:** Unfilled appointment slots lead to immediate, unrecoverable revenue loss (typically 10%–25% of daily salon volume).
- **Manual Overhead:** Front-desk receptionists are overwhelmed with customer check-ins and cannot manually cross-reference paper waitlists, verify specialist shift hours, and negotiate replacement slots on short notice.
- **Double-Booking Risks:** In high-paced environments, manual rebooking often leads to catastrophic double-booking errors or assignment to unqualified staff.
- **Lost Customer Goodwill:** Waitlist customers are eager for appointments but miss out due to the lack of timely notification systems.

---

## 2. Business Value & Objectives

The **Salon Revenue Recovery Agent** bridges the gap between cancelled appointments and waiting customers:
- **Immediate Revenue Recapture:** Automatically flags newly cancelled high-value slots (e.g. Balayage, Facials) and matches them to ready-to-book waitlist clients.
- **Deterministic Booking Safety:** Strictly decouples scheduling business logic from generative AI. Staff schedules, service durations, break times, and customer consents are validated deterministically in SQLite with `BEGIN IMMEDIATE` write-lock transactions.
- **Human-in-the-Loop Oversight:** AI drafts personalized customer offers, but human managers maintain full control to review, edit, approve, or reject offers before sending.
- **Complete Operational Visibility:** Real-time dashboard tracks recovered bookings, recaptured revenue (PKR), offer acceptance rates, and service-level financial metrics.

---

## 3. Key Features

- **Real-Time Revenue Dashboard:** Instant calculation of recovered bookings, recaptured revenue (PKR), lost revenue at risk, offer acceptance rates, and breakdown by service.
- **Recovery Workspace:** Interactive queue of cancelled appointment slots with one-click candidate matching and eligibility explanations.
- **Deterministic Qualification Engine:** Evaluates candidate waitlist entries across 7 strict criteria:
  1. Service match (`serviceId`).
  2. Staff qualification (staff service catalog specializations).
  3. Working day and shift hours (`shiftStart` to `shiftEnd`).
  4. Scheduled break non-overlap (`startA < endB && endA > startB`).
  5. Customer explicit marketing/offer consent (`consentGiven = 1`).
  6. Date availability match.
  7. Time-of-day bucket match (`morning`, `afternoon`, `evening`).
- **Atomic Booking Protection:** SQLite `BEGIN IMMEDIATE` transactions with conditional updates (`WHERE id = ? AND status = 'cancelled'` / `'waiting'`) prevent race conditions and duplicate slot assignment.
- **Autonomous AI Concierge:** Natural language chat assistant powered by OpenAI function calling with 7 specialized tools.
- **Simulated Customer Replies:** Full simulation studio supporting `YES` (triggers atomic recovery booking), `NO` (marks offer declined and releases slot), and `NO_REPLY` (marks offer expired).
- **Enterprise-Grade Privacy:** Automatic PII stripping removes phone numbers and email addresses before payloads reach the LLM.

---

## 4. How the AI Agent Works

The AI Recovery Concierge acts as an intelligent assistant for salon staff. Rather than acting as a black box with direct database access, the agent operates in a **strictly controlled multi-turn tool-calling loop**:

```text
Staff User Prompt ──> Express API (/api/agent/chat) ──> OpenAI (gpt-4o-mini)
                                                               │
                                                               ▼
Backend Domain Services <── Schema Validation <── Tool Call Request
         │
         ▼
Sanitized Tool Result ────> Model Reasoning ───> Final Natural Language Response
```

### The Seven AI Function Tools

The AI agent has access to exactly seven approved tools defined with strict JSON schemas (`additionalProperties: false`):

| # | Tool Name | Scope & Responsibilities |
|---|---|---|
| 1 | `get_cancelled_appointments` | Queries the appointment database for cancelled slots, with optional date filtering. |
| 2 | `get_appointment_details` | Retrieves full relational details for an appointment (service name, price, duration, staff name, customer name; PII stripped). |
| 3 | `find_eligible_waitlist_candidates` | Executes the deterministic matching engine to identify qualified waitlist clients for a specific slot. |
| 4 | `explain_candidate_eligibility` | Evaluates a specific waitlist candidate against a slot and explains why they qualified or why they failed. |
| 5 | `create_recovery_offer` | Generates a new recovery offer linking a candidate to an appointment in `pending_approval` state. |
| 6 | `get_offer_status` | Inspects current lifecycle status and metadata for a specific recovery offer. |
| 7 | `get_dashboard_metrics` | Queries high-level salon recovery metrics, recovered revenue, conversion rates, and service breakdowns. |

### Human-in-the-Loop Safeguards

1. **Autonomous Execution Boundary:** The AI agent can draft offers and perform triage, but **cannot approve, send, or dispatch offers**.
2. **Offer Status Lifecycle:** Every offer is created in `pending_approval`. Only an explicit human operator action (`PATCH /api/offers/:id/status`) can promote an offer to `approved` and `sent`.
3. **No Autonomous Bookings:** Bookings are only finalized when a customer responds with `YES` to a sent offer or when staff manually executes recovery confirmation.

---

## 5. Technology Stack

- **Presentation Layer (Client):**
  - **Framework:** [React 18.3.1](https://react.dev/) + [Vite 8.3.5](https://vitejs.dev/)
  - **Routing:** [React Router DOM 7.18.5](https://reactrouter.com/)
  - **HTTP Client:** [Axios 1.7.2](https://axios-http.com/) with centralized error envelope extraction
  - **Styling:** Modular Vanilla CSS with customized design tokens (no Tailwind runtime bloat)
- **Application Layer (Server):**
  - **Runtime:** [Node.js >= 22.5.0](https://nodejs.org/) (utilizing native `node:sqlite` and native `node:test`)
  - **Server Framework:** [Express 4.19.2](https://expressjs.com/)
  - **CORS & Middleware:** [CORS 2.8.5](https://www.npmjs.com/package/cors), [dotenv 16.4.5](https://www.npmjs.com/package/dotenv), [uuid 9.0.1](https://www.npmjs.com/package/uuid)
- **Data Layer (Storage):**
  - **Database:** Embedded SQLite via Node.js native `DatabaseSync` (`node:sqlite`)
  - **Concurrency:** Write-Ahead Logging (WAL) and `BEGIN IMMEDIATE` transactions
- **AI Integration:**
  - **SDK:** [OpenAI Node SDK 7.47.0](https://www.npmjs.com/package/openai)
  - **Model:** `gpt-4o-mini` with structured JSON schema tool calling and deterministic fallback templates

---

## 6. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                       React SPA Client                      │
│   Dashboard  |  Recovery Workspace  |  Offers  |  AI Agent  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON
┌──────────────────────────────▼──────────────────────────────┐
│                    Express REST API (Port 3000)             │
│  /api/appointments  |  /api/offers  |  /api/dashboard  |    │
│  /api/agent/chat    |  /api/health                          │
├──────────────────────────────┬──────────────────────────────┤
│       AI Agent Engine        │       Domain Services        │
│   7 Tool Handlers & Loop     │  Matching, Booking, Offers,  │
│   PII Sanitization Layer     │  Cancellation, Revenue Svc   │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ Tool Calling                 │ node:sqlite
┌──────────────▼───────────────┐┌─────────────▼───────────────┐
│     OpenAI (gpt-4o-mini)     ││    SQLite Database (WAL)    │
│  Function Calling / Drafting ││  BEGIN IMMEDIATE Integrity  │
└──────────────────────────────┘└─────────────────────────────┘
```

For complete architectural diagrams, ER diagrams, transaction sequence flows, and design trade-offs, see [docs/ARCHITECTURE.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/docs/ARCHITECTURE.md).

---

## 7. Project Structure

```text
salon-revenue-recovery-agent/
├── .env.example                  # Environment variables template
├── .gitignore                    # Excludes node_modules, *.db, .env, build output
├── PROJECT_STATUS.md             # Comprehensive milestone tracking & decision records
├── README.md                     # Main documentation & developer guide
├── render.yaml                   # Render Blueprint for monorepo web & static services
├── docs/                         # Technical documentation & guides
│   ├── ARCHITECTURE.md           # System design, data models, concurrency, tool schemas
│   ├── CERTIFICATION_DEMO.md     # 10–15 min evaluation script & fallback demo plan
│   └── DEPLOYMENT_GUIDE.md       # Render $0 deployment guide, cold-starts, SQLite caveats
├── client/                       # Frontend application (React 18 + Vite)
│   ├── index.html                # HTML entry point with typography links
│   ├── package.json              # Client dependencies and npm scripts
│   ├── vite.config.js            # Build config and local development proxy
│   └── src/
│       ├── App.jsx               # React Router DOM 7 declarative router
│       ├── main.jsx              # Application DOM mount
│       ├── api/                  # Axios API modules with normalized errors
│       │   ├── agent.js          # Agent chat API client with history trimming
│       │   ├── client.js         # Axios instance & error envelope interceptor
│       │   ├── dashboard.js      # Dashboard metrics API
│       │   ├── offers.js         # Offers CRUD & reply simulation API
│       │   └── recovery.js       # Cancellations, matching, & booking API
│       ├── components/           # Reusable UI components
│       │   ├── Header.jsx        # Top header with mobile menu trigger
│       │   ├── Layout.jsx        # SaaS application shell layout
│       │   ├── Sidebar.jsx       # Navigation drawer with route icons
│       │   └── ToolExecutionPanel.jsx # AI tool inspection panel with raw JSON modals
│       ├── pages/                # Page route views
│       │   ├── AgentPage.jsx             # AI recovery concierge chat studio
│       │   ├── DashboardPage.jsx         # Live revenue & recovery KPI dashboard
│       │   ├── NotFoundPage.jsx          # 404 fallback page
│       │   ├── OffersPage.jsx            # Offer management & reply simulation studio
│       │   └── RecoveryWorkspacePage.jsx # Cancelled queue & waitlist matching workspace
│       └── styles/               # CSS design system
│           ├── index.css         # Color tokens, reset, typography, utilities
│           ├── layout.css        # Layout shell, sidebar, drawer, header styles
│           └── pages.css         # Page cards, tables, badges, chat bubbles, modals
└── server/                       # Backend API server (Node.js + Express + SQLite)
    ├── package.json              # Server dependencies and npm scripts
    ├── server.js                 # HTTP server bootstrap & DB initialization
    ├── app.js                    # Express app configuration, CORS, middleware
    ├── config/
    │   └── database.js           # SQLite DatabaseSync connection & idempotent seed loader
    ├── data/                     # 5 synthetic JSON datasets
    │   ├── appointments.json     # 12 appointment slots (confirmed, cancelled, completed)
    │   ├── customers.json        # 10 customers with phone, email, consent flags
    │   ├── services.json         # 10 salon services with duration & PKR pricing
    │   ├── staff.json            # 6 staff members with schedules & specializations
    │   └── waitlist.json         # 10 waitlist requests with priorities & time buckets
    ├── db/
    │   └── .gitkeep              # SQLite storage directory placeholder
    ├── middleware/
    │   ├── errorHandler.js       # Centralized JSON error handler
    │   ├── rateLimiter.js        # Public-demo rate limiters (agent & mutations)
    │   └── requestLogger.js      # Structured HTTP console logger
    ├── routes/                   # Express API routers
    │   ├── agent.js              # POST /api/agent/chat
    │   ├── appointments.js       # /api/appointments/* (cancelled, matches, confirm)
    │   ├── dashboard.js          # GET /api/dashboard/metrics
    │   └── offers.js             # /api/offers/* (CRUD, status, simulate-reply)
    ├── services/                 # Domain business logic
    │   ├── agentService.js       # OpenAI loop, 7 tool handlers, safety system prompt
    │   ├── bookingService.js     # BEGIN IMMEDIATE atomic recovery confirmation
    │   ├── cancellationService.js# Cancellation detection & validation
    │   ├── matchingService.js    # 7-stage deterministic waitlist qualification engine
    │   ├── messageDraftingService.js # AI prompt builder & fallback templates
    │   ├── offerService.js       # Offer generation, tracking, & lifecycle updates
    │   ├── replySimulator.js     # Simulated customer replies (YES, NO, NO_REPLY)
    │   └── revenueService.js     # Revenue aggregation & recovery KPI calculations
    └── tests/                    # Native node:test automated test suites (216 tests)
        ├── agent.test.js         # Tool definitions, schemas, and execution tests
        ├── agentRoutes.test.js   # Agent HTTP API & multi-turn loop integration tests
        ├── booking.test.js       # Transactional confirmation & race condition tests
        ├── cancellation.test.js  # Cancellation query and validation tests
        ├── deploymentSecurity.test.js # Security headers, CORS allowlist, and error masking tests
        ├── e2eIntegration.test.js# Full HTTP end-to-end recovery lifecycle tests
        ├── matching.test.js      # Deterministic qualification engine tests
        ├── messageDrafting.test.js # AI drafting & deterministic fallback tests
        ├── offers.test.js        # Offer tracking, revalidation, & duplicate lock tests
        ├── replySimulator.test.js# Reply simulation & atomic booking tests
        ├── revenue.test.js       # Revenue metrics and division-by-zero tests
        └── setup.test.js         # Database schema, foreign keys, & seed tests
```

---

## 8. Prerequisites

- **Node.js:** `>= 22.5.0` (required for built-in `node:sqlite` and `node:test`).
- **npm:** `>= 10.0.0`
- **Operating System:** Windows 10/11 (PowerShell recommended), macOS, or Linux.
- **OpenAI API Key (Optional):** Required only for live AI message drafting and AI chat. If unavailable, the application gracefully falls back to built-in deterministic templates.

---

## 9. Windows-Friendly Local Setup Instructions

Follow these steps in **Windows PowerShell** to clone, install, and run the project locally.

### Step 1: Clone the Repository

```powershell
git clone https://github.com/danishjaved607/salon-revenue-recovery-agent.git
cd salon-revenue-recovery-agent
```

### Step 2: Configure Environment Variables

Copy the provided `.env.example` file to create your local `.env`:

```powershell
Copy-Item .env.example .env
```

Ensure `.env` contains the required configuration:
```env
PORT=3000
DB_PATH=./db/salon.db
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=5000
VITE_API_BASE_URL=http://localhost:3000
```
*(Note: If you do not have an OpenAI API key or credits, leave `OPENAI_API_KEY` blank. The system will automatically use deterministic fallback templates).*

### Step 3: Install Dependencies

Install dependencies for both the backend server and frontend client:

```powershell
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ..\client
npm install

cd ..
```

### Step 4: Initialize the SQLite Database & Seed Data

Run the idempotent database seed script:

```powershell
cd server
npm run seed
cd ..
```

This creates `server/db/salon.db` with all required tables, relational foreign keys, and loads the 5 synthetic datasets safely.

### Step 5: Start the Development Servers

Open two separate Windows PowerShell windows:

**Terminal 1 (Backend API):**
```powershell
cd server
npm run dev
# Express API will listen on http://localhost:3000
```

**Terminal 2 (Frontend Client):**
```powershell
cd client
npm run dev
# Vite dev server will run on http://localhost:5173
```

Open your browser and navigate to: **`http://localhost:5173`**

---

## 10. Running Automated Tests

The project utilizes Node.js native test runner (`node:test`) and assertions (`node:assert/strict`) with isolated in-memory SQLite instances (`:memory:`).

To execute the complete test suite:

```powershell
cd server
npm test
```

### Verified Test Results
- **Pass Rate:** **100%** (216 passed, 0 failed, 0 skipped)
- **Suites:** 58 test suites across 12 test files
- **Duration:** ~5.5 seconds
- **Zero API Cost:** All unit, integration, and E2E tests execute against in-memory databases with mock AI clients.

---

## 11. API Endpoint Overview

| Method | Endpoint | Description | Request Body / Query Params |
|---|---|---|---|
| `GET` | `/api/health` | Service health and timestamp check | None |
| `GET` | `/api/dashboard/metrics` | Computes revenue recovery KPIs | None |
| `GET` | `/api/appointments/cancelled` | Lists cancelled appointments | `?date=YYYY-MM-DD`, `?raw=true` |
| `GET` | `/api/appointments/:id` | Retrieves single appointment details | None |
| `GET` | `/api/appointments/:id/validate-cancellation` | Pre-flight cancellation validation | None |
| `POST` | `/api/appointments/:id/cancel` | Transitions appointment to cancelled | `{ "reason": "...", "notes": "..." }` |
| `GET` | `/api/appointments/:id/matches` | Finds eligible waitlist candidates | None |
| `POST` | `/api/appointments/:id/confirm` | Atomic booking recovery confirmation | `{ "waitlistId": "wl-002" }` |
| `POST` | `/api/appointments/:id/confirm-recovery`| Alias for confirmation endpoint | `{ "waitlistId": "wl-002" }` |
| `GET` | `/api/appointments/:id/offers` | Lists offers generated for slot | None |
| `GET` | `/api/offers` | Queries offers with filters | `?status=...&appointmentId=...` |
| `POST` | `/api/offers` | Creates a new recovery offer | `{ "appointmentId": "apt-001", "waitlistId": "wl-002" }` |
| `GET` | `/api/offers/:id` | Retrieves single offer by ID | None |
| `PATCH`| `/api/offers/:id/status` | Updates offer lifecycle state | `{ "status": "approved" \| "sent" }` |
| `POST` | `/api/offers/:id/simulate-reply` | Processes simulated customer response | `{ "reply": "YES" \| "NO" \| "NO_REPLY" }` |
| `POST` | `/api/agent/chat` | AI concierge conversation & tool loop | `{ "message": "...", "conversationHistory": [...] }` |

---

## 12. Security & Privacy Considerations

A comprehensive M6 Step 3 Security Audit was conducted across the application. Security findings and architectural defenses are summarized below:

### Security Audit Findings (Remediation Deferred for Prototype Phase)
- **SEC-01 (High):** Missing Rate Limiting on `POST /api/agent/chat` and `POST /api/offers/:id/simulate-reply`.
- **SEC-02 (High):** Missing Authentication & Access Control (intentional prototype limitation for evaluation; mandatory before multi-tenant or public deployment).
- **SEC-03 (Medium):** Missing HTTP Security Headers (Helmet middleware recommended; `X-Powered-By` exposed).
- **SEC-04 (Medium):** CORS origin configuration coupled to `VITE_API_BASE_URL` rather than dedicated `CORS_ORIGIN`.
- **SEC-05 (Medium):** Dependency vulnerabilities flagged in `server/` devDependencies (`uuid < 11.1.1` and `minimatch` via `nodemon`). Zero vulnerabilities in `client/`.
- **SEC-06 (Low):** Inconsistent `.env` path resolution in `server/app.js` (`server/.env` vs repo root `.env`).
- **SEC-07 (Low):** Centralized error handler exposes `err.message` in 500 error envelopes without generic masking in production mode.

### Active Security Defenses
- **100% Parameterized SQL:** All database queries across all services utilize prepared statements with `?` bind variables via `node:sqlite`. Zero string interpolation or SQL injection vulnerability.
- **Strict PII Sanitization:** `sanitizePii()` recursively strips customer phone numbers, emails, and sensitive identifiers before any payload is supplied to OpenAI.
- **Strict Tool Argument Validation:** Tool definitions enforce JSON schemas with `additionalProperties: false`, preventing arbitrary parameter hallucination or injection.
- **No Direct Frontend HTML Injection:** React JSX escaping enforced throughout. Zero instances of `dangerouslySetInnerHTML` or `innerHTML`.
- **Zero Committed Secrets:** Secret protection enforced by `.gitignore` and `.env.example`. Live API keys are never exposed in client bundles.

---

## 13. Known Limitations

1. **Evaluation Prototype Status:** The application does not currently implement authentication, RBAC, or tenant isolation. It is designed for single-salon evaluation and demonstration.
2. **Ephemeral Cloud Storage:** Deploying on free-tier platforms like Render means the SQLite database is stored on an ephemeral disk and resets when the service sleeps or restarts. Persistent disks require a paid hosting plan.
3. **No Live WhatsApp/SMS Integration:** Messaging transport is simulated via the built-in customer reply simulator. Live Twilio or Meta WhatsApp Business API integration is deferred to future milestones.
4. **Live OpenAI API Quota:** When the configured OpenAI API key has exhausted credits (returning HTTP 429), the backend reports a graceful error envelope, and the app falls back to deterministic message templates. The evaluation demo includes a complete fallback script in [docs/CERTIFICATION_DEMO.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/docs/CERTIFICATION_DEMO.md).
5. **Experimental SQLite Warning:** Node.js 22 emits `ExperimentalWarning: SQLite is an experimental feature` when initializing `node:sqlite`. This is normal behavior and does not affect runtime reliability.

---

## 14. Current Project Status

- **Milestone 1 — Setup & Synthetic Data:** Complete & Merged.
- **Milestone 2 — Core Booking & Recovery Logic:** Complete & Merged.
- **Milestone 3 — Offers & Revenue Tracking:** Complete & Merged.
- **Milestone 4 — AI Agent with OpenAI Tool Calling:** Complete & Merged.
- **Milestone 5 — React Frontend & Dashboard UI:** Complete & Merged.
- **Milestone 6 — Integration Testing, Security Audit & AI Frontend:** Complete & Merged (`ca35d09`).
- **Milestone 7 — Final Project Documentation:** Complete & Merged.
- **Milestone 8 — Deployment Preparation & Public-Demo Hardening:** Complete (branch `deploy/m8-render-preparation`).
- **Next Step:** Final Certification Submission & Live Demonstration Walkthrough.

---

## 15. Future Enhancements

- **Role-Based Access Control (RBAC):** JWT authentication distinguishing receptionists, salon managers, and system administrators.
- **Live WhatsApp Business Integration:** Official Meta Graph API integration with delivery and read receipts.
- **Dynamic SLA Expiration Daemon:** Automated background cron job expiring offers after configurable response windows (e.g. 30 minutes).
- **PostgreSQL Cloud Migration:** Migration from embedded SQLite to managed cloud PostgreSQL (Supabase / Neon) for multi-tenant scalability.
- **Multi-Location Support:** Salon chain support with cross-branch waitlists and multi-calendar scheduling.

---

## 16. Documentation Links

- 🏛️ **[docs/ARCHITECTURE.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/docs/ARCHITECTURE.md):** Complete technical architecture, database schemas, ER diagrams, concurrency sequence flows, and trade-offs.
- 🚀 **[docs/DEPLOYMENT_GUIDE.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/docs/DEPLOYMENT_GUIDE.md):** Free-tier Render deployment instructions, cold-start handling, and configuration requirements.
- 🎬 **[docs/CERTIFICATION_DEMO.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/docs/CERTIFICATION_DEMO.md):** 10–15 minute evaluation walkthrough script, talking points, screen actions, and OpenAI HTTP 429 fallback plan.
- 📋 **[PROJECT_STATUS.md](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/PROJECT_STATUS.md):** Milestone delivery records, security audit details, and verification logs.

---

## 17. License

This project is created for the AI Solution Engineering Certification. All rights reserved.
