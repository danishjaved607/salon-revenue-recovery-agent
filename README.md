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

## Project Status

- **Milestone 1 (Completed)**: Project structure, package setup, synthetic datasets, SQLite schema, idempotent seed loader, and base automated test suite.
- **Milestone 2 (Completed)**: Cancellation detection, eligibility matching engine, and atomic booking recovery confirmation with double-booking prevention.
- **Milestone 3 — Part A (Completed)**: Offer creation and tracking, live revalidation, duplicate active offer prevention, lifecycle status updates, and offer query endpoints.
- **Milestone 3 — Parts B & C (Pending)**: AI offer message generation (OpenAI) with fallback templates, and customer reply simulation.

## Development Approach

Work will be organized into feature branches, tested, and merged into `main` through pull requests.

## Data and Safety

- Synthetic data will be used during development.
- Initial messaging will require appropriate consent and human approval.
- Live WhatsApp integration is outside the initial scope.
- API keys and other secrets must never be committed.

## Project Structure

```text
salon-revenue-recovery-agent/
├── .env.example              # Environment variables template
├── .gitignore                # Git exclusions (node_modules, db, secrets)
├── PROJECT_STATUS.md         # Milestone progress, decisions, and roadmap
├── README.md                 # Project overview and setup instructions
├── client/                   # Frontend workspace (React + Vite)
│   ├── index.html            # Vite entry HTML
│   ├── package.json          # Client configuration
│   ├── vite.config.js        # Vite build & proxy configuration
│   └── src/
│       ├── App.jsx           # Minimal root component shell
│       ├── main.jsx          # React DOM entry point
│       └── styles/
│           └── index.css     # Design tokens and base styles
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
    │   ├── appointments.js   # Cancellation, matching, booking, and slot offers routes
    │   └── offers.js         # Offer creation, querying, and status updates routes
    ├── services/
    │   ├── cancellationService.js # Appointment cancellation detection and validation
    │   ├── matchingService.js     # Deterministic candidate qualification & eligibility engine
    │   ├── bookingService.js      # Safe booking confirmation and slot recovery
    │   └── offerService.js        # Offer generation, tracking, and lifecycle management
    └── tests/
        ├── setup.test.js          # Milestone 1 database and seed test suite
        ├── cancellation.test.js   # Milestone 2 Part A cancellation detection tests
        ├── matching.test.js       # Milestone 2 Part B waitlist matching tests
        ├── booking.test.js        # Milestone 2 Part C booking confirmation tests
        └── offers.test.js         # Milestone 3 Part A offer creation and tracking tests
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

Execute the complete automated test suite across all completed milestones (dataset schemas, database constraints, cancellation detection, waitlist matching, safe booking recovery, and offer creation/lifecycle):

```bash
cd server
npm test
```

All 96 tests run in-memory using Node.js built-in `node:test` and `node:sqlite` with zero external dependencies.

