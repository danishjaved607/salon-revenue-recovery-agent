# Salon Revenue Recovery Agent

An AI-assisted application that helps salons recover cancelled appointment slots by matching them with suitable customers on a waitlist.

## Problem

Cancelled appointments can lead to lost revenue. Finding replacement customers manually takes time.

## Proposed Solution

The application will match cancelled slots with eligible waitlist customers, prepare personalized appointment offers, simulate customer replies, and help confirm bookings safely.

## Planned Technology

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite
- Language: JavaScript
- AI: OpenAI API, added after the core booking workflow

## Project Status & Roadmap

- **Milestone 1 — Project Setup and Synthetic Data (Completed)**: Project structure, package setup, synthetic datasets, SQLite schema, idempotent seed loader, and base automated test suite.
- **Milestone 2 — Core Booking and Recovery Logic (Completed)**: Cancellation detection, eligibility matching engine, and atomic booking recovery confirmation with double-booking prevention.
- **Milestone 3 — Offers and Revenue Tracking (Completed)**:
  - **Part A**: Offer creation and tracking, live revalidation, duplicate active offer prevention, lifecycle status updates, and offer query endpoints.
  - **Part B**: OpenAI-powered message drafting with privacy guards, prompt builder, deterministic fallback templates (standard, priority, returning client), and human approval enforcement.
  - **Part C**: Revenue tracking and dashboard metrics calculation, appointment recovery rates, offer acceptance rates, service-level revenue breakdown, and `GET /api/dashboard/metrics`.
  - *Verification*: 123 automated tests passed, 0 failed, 36 suites.
- **Milestone 4 — Genuine AI Agent with OpenAI Tool Calling (Completed)**:
  - **Part A (Completed)**: Agent foundation, safety system prompt, 7 approved OpenAI function tool definitions (`additionalProperties: false`), schema-based argument validation, conversation history validation, PII sanitization, and multi-turn tool-calling loop with mock client dependency injection.
  - **Part B (Completed)**: Backend integration & intelligent recovery workflow connecting all seven tools to real domain services, exposed `POST /api/agent/chat` with history and input validation, safe error encapsulation, and end-to-end recovery planning.
  - **Part C (Completed)**: Simulated customer reply service (`YES`, `NO`, `NO_REPLY`), human approval and sending state gating, duplicate response prevention, atomic booking confirmation via `bookingService.confirmBooking()`, and `POST /api/offers/:id/simulate-reply`.
  - *Verification*: 195 automated tests passed, 0 failed, 49 suites.
- **Milestone 5 — React Frontend and Dashboard UI (In Progress — Part A Completed)**:
  - **Part A (Completed)**: React frontend foundation: responsive SaaS application shell, responsive sidebar navigation, contextual header, declarative React Router DOM 7 routing (`/dashboard`, `/recovery-workspace`, `/offers`, `/agent`, and 404 fallback), Axios API client with backend error envelope extraction (`client/src/api/client.js`), and centralized light blush-pink design system tokens.
  - **Parts B–E (Upcoming)**: Revenue metrics dashboard, recovery workspace, offer lifecycle & reply simulation studio, and conversational AI agent studio.
- **Milestone 6 — Integration, Testing, Security, Documentation and Certification Demo (Not Started)**: End-to-end integration, comprehensive testing, security review, documentation, and a certification-ready demonstration.

## Development Approach

Work will be organized into feature branches, tested, and merged into `main` through pull requests.

## Data and Safety

- Synthetic data will be used during development.
- Initial messaging will require appropriate consent and human approval.
- Live WhatsApp integration remains deferred until the basic application is working.
- API keys and other secrets must never be committed.

## Project Structure

```text
salon-revenue-recovery-agent/
├── .env.example              # Environment variables template
├── .gitignore                # Git exclusions (node_modules, db, secrets)
├── PROJECT_STATUS.md         # Milestone progress, decisions, and roadmap
├── README.md                 # Project overview and setup instructions
├── client/                   # Frontend workspace (React 18 + Vite)
│   ├── index.html            # Vite entry HTML with Google Fonts
│   ├── package.json          # Client dependencies (React 18, React Router DOM 7, Axios, Vite)
│   ├── vite.config.js        # Vite build & proxy configuration (/api -> :3000)
│   └── src/
│       ├── App.jsx           # Declarative React Router DOM 7 router
│       ├── main.jsx          # React DOM entry point
│       ├── api/
│       │   └── client.js     # Axios API client with error envelope normalization
│       ├── components/
│       │   ├── Header.jsx    # Contextual header with mobile menu toggle
│       │   ├── Layout.jsx    # SaaS application shell layout
│       │   └── Sidebar.jsx   # Responsive sidebar navigation with SVG icons
│       ├── pages/
│       │   ├── AgentPage.jsx             # AI agent concierge placeholder
│       │   ├── DashboardPage.jsx         # Revenue dashboard placeholder
│       │   ├── NotFoundPage.jsx          # 404 fallback route
│       │   ├── OffersPage.jsx            # Offer management placeholder
│       │   └── RecoveryWorkspacePage.jsx # Recovery workspace placeholder
│       └── styles/
│           ├── index.css     # Design tokens and base reset
│           ├── layout.css    # Shell, sidebar, header, and drawer styles
│           └── pages.css     # Reusable card and page container styles
└── server/                   # Backend workspace (Node.js + Express + SQLite)
    ├── package.json          # Backend package configuration
    ├── server.js             # HTTP server entry point
    ├── app.js                # Express app setup and middleware
    ├── config/
    │   └── database.js       # SQLite connection and idempotent seed loader
    ├── data/                 # 5 synthetic JSON datasets
    │   ├── services.json     # Salon service catalog
    │   ├── staff.json        # Staff schedules and specializations
    │   ├── customers.json    # Customers with consent flags and history
    │   ├── appointments.json # Confirmed, cancelled, and completed slots
    │   └── waitlist.json     # Customer waitlist requests and preferences
    ├── db/
    │   └── .gitkeep          # Directory placeholder for local SQLite DB file
    ├── middleware/
    │   ├── errorHandler.js   # Centralized error handler
    │   └── requestLogger.js  # HTTP request logger
    ├── routes/
    │   ├── agent.js          # AI agent chat and recovery workflow endpoint
    │   ├── appointments.js   # Cancellation, matching, booking, and slot offers routes
    │   ├── dashboard.js      # Revenue recovery metrics and dashboard endpoint
    │   └── offers.js         # Offer creation, querying, and status updates routes
    ├── services/
    │   ├── agentService.js         # Genuine AI agent foundation, tool definitions & tool-calling loop
    │   ├── cancellationService.js  # Appointment cancellation detection and validation
    │   ├── matchingService.js      # Deterministic candidate qualification & eligibility engine
    │   ├── bookingService.js       # Safe booking confirmation and slot recovery
    │   ├── offerService.js         # Offer generation, tracking, and lifecycle management
    │   ├── messageDraftingService.js # AI prompt builder, OpenAI drafting, and fallback templates
    │   ├── replySimulator.js       # Simulated customer replies and automated recovery booking
    │   └── revenueService.js       # Revenue tracking, recovery rates, and analytics
    └── tests/
        ├── setup.test.js           # Milestone 1 database and seed test suite
        ├── cancellation.test.js    # Milestone 2 Part A cancellation detection tests
        ├── matching.test.js        # Milestone 2 Part B waitlist matching tests
        ├── booking.test.js         # Milestone 2 Part C booking confirmation tests
        ├── offers.test.js          # Milestone 3 Part A offer creation and tracking tests
        ├── messageDrafting.test.js # Milestone 3 Part B AI drafting and fallback template tests
        ├── revenue.test.js         # Milestone 3 Part C revenue metrics and dashboard tests
        ├── agent.test.js           # Milestone 4 Part A AI agent foundation and tool-calling tests
        ├── agentRoutes.test.js     # Milestone 4 Part B agent API and workflow integration tests
        └── replySimulator.test.js  # Milestone 4 Part C customer reply simulation and recovery tests
```

## API Endpoints

### AI Agent Chat

- **`POST /api/agent/chat`**: Dispatches user messages and conversation history to the autonomous AI revenue recovery agent with tool execution.

#### Request Body:

```json
{
  "message": "Find cancelled appointments for today and recommend the top candidate.",
  "conversationHistory": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hello! How can I assist you with revenue recovery today?" }
  ]
}
```

#### Example Response (`POST /api/agent/chat`):

```json
{
  "success": true,
  "reply": "I inspected cancelled appointment apt-002 and matched candidate wl-008 (Rabia Sheikh). An offer has been drafted and is awaiting staff approval.",
  "toolExecutions": [
    {
      "toolName": "get_cancelled_appointments",
      "args": {},
      "result": { "success": true, "data": [{ "id": "apt-002", "serviceId": "svc-003", "status": "cancelled" }] }
    },
    {
      "toolName": "find_eligible_waitlist_candidates",
      "args": { "appointmentId": "apt-002" },
      "result": { "success": true, "data": [{ "waitlistId": "wl-008", "customerName": "Rabia Sheikh" }] }
    },
    {
      "toolName": "create_recovery_offer",
      "args": { "appointmentId": "apt-002", "waitlistId": "wl-008" },
      "result": { "success": true, "data": { "offerId": "off-001", "status": "pending_approval" } }
    }
  ],
  "iterations": 4
}
```

### Customer Reply Simulation

- **`POST /api/offers/:id/simulate-reply`**: Simulates customer response (`YES`, `NO`, or `NO_REPLY`) to a sent recovery offer.

#### Request Body:

```json
{
  "reply": "YES"
}
```

#### Example Response (`POST /api/offers/:id/simulate-reply`):

```json
{
  "success": true,
  "message": "Customer accepted offer \"off-001\". Recovery booking successfully confirmed for appointment \"apt-002\".",
  "reply": "YES",
  "status": "accepted",
  "appointmentRecovered": true,
  "offer": {
    "id": "off-001",
    "status": "accepted",
    "respondedAt": "2026-11-03T20:00:00.000Z"
  },
  "booking": {
    "success": true,
    "appointment": {
      "id": "apt-002",
      "status": "recovered",
      "customerId": "cus-005"
    },
    "waitlist": {
      "id": "wl-008",
      "status": "booked"
    }
  }
}
```

### Dashboard Metrics

- **`GET /api/dashboard/metrics`**: Computes and returns high-level revenue recovery analytics, booking conversion rates, offer acceptance metrics, and service-level revenue breakdowns.

#### Example Response (`GET /api/dashboard/metrics`):

```json
{
  "totalRecoveredBookings": 2,
  "totalRecoveredRevenue": 9500,
  "currency": "PKR",
  "totalOffersCreated": 5,
  "totalAcceptedOffers": 2,
  "offerAcceptanceRate": 40,
  "appointmentRecoveryRate": 50,
  "revenueByService": [
    {
      "serviceId": "srv-003",
      "serviceName": "HydraFacial Glow",
      "recoveredBookings": 1,
      "recoveredRevenue": 6500
    },
    {
      "serviceId": "srv-001",
      "serviceName": "Signature Balayage & Cut",
      "recoveredBookings": 1,
      "recoveredRevenue": 3000
    }
  ]
}
```

## Getting Started

### Prerequisites

- Node.js >= 22.5.0 (for built-in `node:sqlite` and `node:test`)
- npm >= 10.0.0

### Database Initialization & Seed Loading

To initialize the SQLite database and safely load all 5 synthetic seed datasets:

```bash
cd server
node config/database.js
```

This operation is safe and idempotent: re-running it will detect existing records and skip re-insertion without duplicating data.

### Running Automated Tests

Execute the complete automated test suite across all completed milestones (dataset schemas, database constraints, cancellation detection, waitlist matching, safe booking recovery, offer creation/lifecycle, AI message drafting, revenue tracking metrics, AI agent tool calling, and customer reply simulation):

```bash
cd server
npm test
```

All 195 tests run in-memory using Node.js built-in `node:test` and `node:sqlite` with zero external dependencies and zero API costs.
