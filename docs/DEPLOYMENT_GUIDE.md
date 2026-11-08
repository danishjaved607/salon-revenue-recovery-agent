# Deployment Guide — Salon Revenue Recovery Agent

> [!IMPORTANT]
> **Deployment Status:** **PREPARED — NOT YET DEPLOYED**
> This document details the production deployment readiness implemented in Milestone 8. The application is configured and verified for zero-cost deployment on Render. Public cloud deployment will take place upon final certification review.

---

## 1. Hosting Strategy & Budget

- **Target Hosting Budget:** **FREE ($0.00)**
- **Target Platform:** **[Render](https://render.com/)**
  - **Backend Web Service:** Render Free Tier (Node.js runtime).
  - **Frontend Static Site:** Render Free Tier (Static CDN).
- **Database Strategy:** Embedded SQLite (`server/db/salon.db`) with synthetic demonstration seed data loaded automatically on server boot.
- **Repository Structure:** Monorepo with independent `client/` and `server/` directories.

---

## 2. Key Limitations of Free-Tier Cloud Hosting & Public Demo Prototype

Before deploying, operators and certification evaluators must be aware of the following operational boundaries:

### 2.1 Inactivity Sleep (Cold Starts)
- Render free web services automatically spin down (sleep) after **15 minutes of inactivity**.
- The first inbound request after a dormant period triggers a cold start, which takes approximately **45 to 60 seconds** to wake up.
- Subsequent requests respond with normal, low-latency performance.

### 2.2 Ephemeral Filesystem & SQLite Persistence
- Render free-tier web services use an **ephemeral disk**.
- When the free instance sleeps, restarts, or redeploys, any runtime changes written to `server/db/salon.db` (such as newly recovered appointments or created offers) are reset.
- **Persistent disks on Render require a paid plan.** For the free certification demo, this is completely acceptable because:
  1. The server entry point (`server/server.js`) calls `initialise()` on boot, which creates all tables and safely reloads all 5 synthetic seed datasets if empty.
  2. The evaluation script can be repeated from a clean, consistent baseline at any time.

### 2.3 Prototype Security Notice (No Authentication)
- **All backend API routes remain unauthenticated.** The application is an AI Solution Engineering certification demonstration prototype, not a production multi-tenant system.
- **Do not deploy real customer data.** The system must strictly use the provided synthetic datasets (`customers.json`, `staff.json`, `appointments.json`, `services.json`, `waitlist.json`).
- Production deployment will require full authentication (JWT/OAuth), role-based access control (RBAC), and persistent cloud database storage (e.g. PostgreSQL).

---

## 3. Public-Demo Protections Implemented (M8)

To safeguard the public certification demonstration against automated abuse, scraping, and OpenAI credit exhaustion, the following protections were added:

1. **Helmet HTTP Security Headers:** Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and standard defense-in-depth headers.
2. **Framework Fingerprint Removal:** Disabled `X-Powered-By` header to prevent Express identification.
3. **Dedicated CORS Origin Allowlist (`CORS_ORIGIN`):**
   - Comma-separated list of permitted origins.
   - Defaults to local development ports (`http://localhost:5173`, `http://127.0.0.1:5173`, etc.) when unconfigured.
   - Normalizes trailing slashes and rejects unapproved origins with HTTP 403 `CORS_FORBIDDEN`.
4. **Stricter AI Agent Rate Limiting:**
   - Applied to `POST /api/agent/chat` (30 requests per 15-minute window per IP).
   - Protects against OpenAI API quota and credit exhaustion.
5. **General Mutation Rate Limiting:**
   - Applied to mutating HTTP methods (`POST`, `PATCH`, `PUT`, `DELETE`) on `/api/appointments/*` and `/api/offers/*` (120 requests per 15-minute window per IP).
   - Exempts read-only endpoints (`GET /api/dashboard/metrics`, `GET /api/appointments/cancelled`) to prevent disrupting normal evaluator browsing.
6. **Health Check Exemption:**
   - `GET /api/health` is completely unthrottled, ensuring Render uptime monitoring never triggers rate limiting.
7. **Production Error Masking:**
   - In production (`NODE_ENV === 'production'`), unexpected HTTP 500 error messages are masked to `'Internal Server Error'`, preventing internal database paths or stack traces from leaking.
8. **Dependency Vulnerability Remediation:**
   - Updated `uuid` to `^11.1.1` (resolving GHSA-w5hq-g745-h8pq).
   - Production dependency audit (`npm audit --omit=dev`) verified with **0 vulnerabilities**.

---

## 4. Deployment Configuration

### 4.1 Option A: Automated Deployment via `render.yaml` Blueprint

The repository root includes a [`render.yaml`](file:///c:/Users/lenovo/Projects/salon-revenue-recovery-agent/render.yaml) blueprint configuring both services:

1. In the [Render Dashboard](https://dashboard.render.com/), click **New +** &rarr; **Blueprint**.
2. Connect your GitHub repository (`salon-revenue-recovery-agent`).
3. Render will detect `render.yaml` and configure:
   - `salon-revenue-recovery-api` (Web Service, `rootDir: server`).
   - `salon-revenue-recovery-client` (Static Site, `rootDir: client`).
4. Set the sensitive environment variable values when prompted:
   - `OPENAI_API_KEY`: Your OpenAI API key (optional; app degrades gracefully if omitted).
5. Deploy the blueprint.

---

### 4.2 Option B: Manual Render Dashboard Setup

#### Step 1: Deploy Backend Web Service

1. In Render Dashboard, click **New +** &rarr; **Web Service**.
2. Connect your repository.
3. Configure the following fields:
   - **Name:** `salon-revenue-recovery-api` (or custom name)
   - **Region:** Frankfurt (EU) or Oregon (US)
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
4. Add the following **Environment Variables**:
   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Masks 500 error details in production |
   | `PORT` | `10000` | Port Express listens on (or let Render assign) |
   | `HOST` | `0.0.0.0` | Binds to all network interfaces |
   | `DB_PATH` | `./db/salon.db` | Embedded SQLite path |
   | `CORS_ORIGIN` | `https://<YOUR-FRONTEND-NAME>.onrender.com` | Allowed frontend origin (update once frontend is created) |
   | `OPENAI_API_KEY` | `sk-...` | Optional; uses deterministic fallback templates if empty |
   | `OPENAI_MODEL` | `gpt-4o-mini` | Default cost-efficient model |
   | `OPENAI_TIMEOUT_MS` | `5000` | 5-second API guard |
5. Under **Health Check Path**, enter: `/api/health`.
6. Click **Create Web Service**.
7. Once live, copy your backend URL: `https://<YOUR-BACKEND-NAME>.onrender.com`.

#### Step 2: Deploy Frontend Static Site

1. In Render Dashboard, click **New +** &rarr; **Static Site**.
2. Connect the same repository.
3. Configure:
   - **Name:** `salon-revenue-recovery-client` (or custom name)
   - **Branch:** `main`
   - **Root Directory:** `client`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Add Environment Variable:
   | Variable | Value | Notes |
   |---|---|---|
   | `VITE_API_BASE_URL` | `https://<YOUR-BACKEND-NAME>.onrender.com` | Live backend URL from Step 1 |
5. Add Redirect / Rewrite Rule:
   - Under **Redirects/Rewrites**, click **Add Rule**.
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** `Rewrite` (enables React Router client navigation without 404s).
6. Click **Create Static Site**.
7. Once live, copy your frontend URL: `https://<YOUR-FRONTEND-NAME>.onrender.com`.
8. Return to your **Backend Web Service** environment settings and set `CORS_ORIGIN` to your frontend URL.

---

## 5. Post-Deployment Verification Checklist

Verify the deployed application on the live URLs:

1. **Health Check:** `https://<YOUR-BACKEND-NAME>.onrender.com/api/health` returns `{ "status": "ok", "timestamp": "..." }`.
2. **Dashboard KPIs:** `https://<YOUR-FRONTEND-NAME>.onrender.com/dashboard` loads live metrics via `GET /api/dashboard/metrics`.
3. **Recovery Queue:** Navigate to `/recovery-workspace` and verify cancelled slot `apt-001` is listed.
4. **Candidate Matching:** Verify `wl-002` (Ayesha Khan) appears as eligible candidate with Priority 1.
5. **Offer Workflow:** Generate an offer, navigate to `/offers`, approve the offer, and click "Mark Sent".
6. **Reply Simulation:** Simulate a `YES` response and confirm slot `apt-001` transitions to `recovered` with dashboard revenue incrementing by PKR 2,500.
7. **AI Concierge:** Navigate to `/agent` and verify backend connectivity pill displays green. If OpenAI API key has credits, test chat prompt. If 429 quota is returned, verify graceful error display with retry action.
8. **Security Headers:** Inspect response headers in browser DevTools to confirm `x-content-type-options: nosniff` and absence of `x-powered-by`.

---

## 6. How to Reset Database to Initial Seed State

Because Render free tier uses an ephemeral filesystem:
- **Option A:** Trigger **Manual Deploy** &rarr; **Clear build cache & deploy** on the backend web service. The server restarts with an empty filesystem, running `initialise()` to restore fresh synthetic data.
- **Option B (Local):** Run `npm run seed` in `server/`.
