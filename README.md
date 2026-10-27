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

Milestone 1 complete: Project structure, synthetic datasets, SQLite schema, safe idempotent seed loader, and automated test suite.

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
    └── tests/
        └── setup.test.js     # Milestone 1 database and seed test suite
```

## Getting Started (Milestone 1)

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

### Running Milestone 1 Tests

Execute the automated test suite verifying JSON dataset integrity, SQLite table creation, idempotent seed loading, and foreign key constraint enforcement:

```bash
cd server
npm test
```
