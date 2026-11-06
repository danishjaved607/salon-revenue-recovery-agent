# Deployment Guide — Salon Revenue Recovery Agent

> [!IMPORTANT]
> **Deployment Status:** **NOT YET DEPLOYED**
> This document provides step-by-step instructions for deploying the Salon Revenue Recovery Agent for the certification demonstration. The application is currently verified locally on Windows (`ca35d09`) and has not yet been deployed to public cloud infrastructure.

---

## 1. Hosting Strategy & Budget

- **Target Hosting Budget:** **FREE ($0.00)**
- **Target Platform:** **[Render](https://render.com/)**
  - **Backend Web Service:** Render Free Tier (Node.js runtime).
  - **Frontend Static Site:** Render Free Tier (Static site with CDN).
- **Database Strategy:** Embedded SQLite (`server/db/salon.db`) with synthetic seed data loaded on server initialization.

---

## 2. Key Limitations of Free-Tier Cloud Hosting

Before deploying, salon operators and evaluators must be aware of the operational characteristics of the Render free tier:

### 2.1 Inactivity Sleep (Cold Starts)
- Render free web services automatically spin down (sleep) after **15 minutes of inactivity**.
- When a user visits the application after a period of dormancy, the first request triggers a cold start, which typically takes **45 to 60 seconds** to wake up.
- Subsequent requests respond with normal low-latency performance.

### 2.2 Ephemeral Filesystem & SQLite Persistence
- Render free-tier web services use an **ephemeral disk**.
- When the free instance sleeps, restarts, or redeploys, any runtime changes written to `server/db/salon.db` (such as recovered appointments or newly created offers) are reset.
- **Persistent disks on Render require a paid plan.** For the free certification demo, this is completely acceptable because:
  1. The server entry point (`server/server.js`) calls `initialise()` on boot, which creates all tables and safely reloads all 5 synthetic seed datasets if empty.
  2. The demo script can be repeated from a clean, consistent baseline at any time.

---

## 3. Deployment Prerequisites & Required Configuration Changes

Because the repository is organized as a monorepo with separate `client/` and `server/` directories, the following adjustments must be noted:

### 3.1 Backend Deployment Prerequisites
1. **Root Directory:** Must be configured as `server` in Render settings.
2. **Build Command:** `npm install`
3. **Start Command:** `npm start` (which executes `node server.js`).
4. **Environment Variables Configuration (SEC-06 Note):**
   - In local development, `server/app.js` looks for `.env` inside `server/.env`.
   - On Render, environment variables are injected directly into `process.env` through the Render Dashboard. Therefore, file resolution differences do not affect cloud deployment.
5. **CORS Configuration (SEC-04 Note):**
   - `server/app.js` configures CORS origin as `process.env.VITE_API_BASE_URL || 'http://localhost:5173'`.
   - On Render, set `VITE_API_BASE_URL` on the backend service to the exact URL of your deployed frontend static site (e.g. `https://salon-recovery-frontend.onrender.com`).

### 3.2 Frontend Deployment Prerequisites
1. **Root Directory:** Must be configured as `client` in Render settings.
2. **Build Command:** `npm install && npm run build`
3. **Publish Directory:** `dist`
4. **Environment Variables:**
   - In local development, Vite proxies `/api` calls to `http://localhost:3000` via `vite.config.js`.
   - On a separate static hosting provider, client API requests must point to the live backend URL.
   - **Prerequisite Action:** Set `VITE_API_BASE_URL` in the Render Static Site dashboard to your deployed backend URL (e.g. `https://salon-recovery-api.onrender.com`).

---

## 4. Step-by-Step Deployment Instructions

### Step 1: Ensure GitHub Repository is Up to Date
Push your latest verified code to GitHub:
```powershell
# Verify current branch is clean and tests pass
git status
npm test --prefix server
npm run build --prefix client

# Push to your GitHub repository
git push origin main
```

---

### Step 2: Deploy the Backend Web Service on Render

1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository (`salon-revenue-recovery-agent`).
4. Configure the service settings:
   - **Name:** `salon-recovery-api` (or a unique name of your choice)
   - **Region:** Closest to you (e.g. `Frankfurt (EU Central)` or `Oregon (US West)`)
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Click **Advanced** and add the following **Environment Variables**:
   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production mode |
   | `PORT` | `3000` | Render dynamically forwards port 3000 |
   | `DB_PATH` | `./db/salon.db` | Embedded SQLite path relative to server root |
   | `OPENAI_API_KEY` | `sk-...` | Your OpenAI API key (optional; app degrades gracefully to templates if empty) |
   | `OPENAI_MODEL` | `gpt-4o-mini` | Cost-effective OpenAI model |
   | `OPENAI_TIMEOUT_MS` | `5000` | 5-second API timeout guard |
   | `VITE_API_BASE_URL` | `https://<YOUR-FRONTEND-NAME>.onrender.com` | Allowed CORS origin (update once frontend is created) |
6. Click **Create Web Service**.
7. Wait for the deployment log to display:
   ```text
   Database initialised with synthetic datasets.
   Server running on http://localhost:3000
   Your service is live 🎉
   ```
8. Copy your live backend service URL:
   `https://<YOUR-BACKEND-NAME>.onrender.com`
9. Test the backend health endpoint in your browser or PowerShell:
   ```powershell
   Invoke-RestMethod -Uri "https://<YOUR-BACKEND-NAME>.onrender.com/api/health"
   # Expected output: { status: "ok", timestamp: "..." }
   ```

---

### Step 3: Deploy the Frontend Static Site on Render

1. In the Render Dashboard, click **New +** and select **Static Site**.
2. Connect the same GitHub repository (`salon-revenue-recovery-agent`).
3. Configure the static site settings:
   - **Name:** `salon-recovery-frontend` (or a unique name of your choice)
   - **Branch:** `main`
   - **Root Directory:** `client`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Click **Advanced** and add the environment variable:
   | Variable | Value | Notes |
   |---|---|---|
   | `VITE_API_BASE_URL` | `https://<YOUR-BACKEND-NAME>.onrender.com` | Live backend URL from Step 2 |
5. Configure client-side routing (Redirect / Rewrite rule):
   - Under **Redirects/Rewrites**, click **Add Rule**.
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** `Rewrite` (ensures React Router handles `/dashboard`, `/offers`, etc. without 404s).
6. Click **Create Static Site**.
7. Once deployed, copy your live frontend URL:
   `https://<YOUR-FRONTEND-NAME>.onrender.com`
8. Return to your **Backend Web Service** settings on Render and update `VITE_API_BASE_URL` with your frontend URL so that CORS permissions match.

---

## 5. Post-Deployment Verification Checklist

Once both services are running, verify each view on the live URL:

1. **Backend Health Check:**
   - Navigate to `https://<YOUR-BACKEND-NAME>.onrender.com/api/health`.
   - Confirm status is `"ok"`.
2. **Dashboard Overview:**
   - Open `https://<YOUR-FRONTEND-NAME>.onrender.com/dashboard`.
   - Verify that KPI cards load metrics from `GET /api/dashboard/metrics`.
3. **Recovery Workspace:**
   - Open `/recovery-workspace`.
   - Verify cancelled appointment `apt-001` is selected by default.
   - Verify candidate matching lists `wl-002` (Ayesha Khan) as eligible with Priority 1.
4. **Offer Generation & Approval:**
   - Generate an offer for `wl-002`.
   - Navigate to `/offers`, approve the offer, and mark it as sent.
5. **Reply Simulation & Booking Recovery:**
   - Simulate a `YES` response.
   - Confirm the offer status transitions to `accepted` and slot `apt-001` transitions to `recovered`.
   - Return to `/dashboard` and verify recovered revenue increments by PKR 2,500.
6. **AI Agent Interface:**
   - Navigate to `/agent`.
   - Confirm the status pill displays **Backend Connected** (green).
   - If a valid OpenAI API key with available credits is configured on Render, test a prompt (e.g. *"Find cancelled appointments."*).
   - If credits are exhausted (HTTP 429), confirm the error banner cleanly explains the quota limit with a retry option without crashing.

---

## 6. How to Reset Database to Initial Seed State

If you test multiple recovery bookings during rehearsals and wish to reset the database back to its clean initial state before the live evaluation:

### Option A: Trigger a Clean Deploy on Render
Because Render free tier uses an ephemeral filesystem, clicking **Manual Deploy** &rarr; **Clear build cache & deploy** on the backend web service spins up a fresh instance, automatically executing `initialise()` and loading clean seed data.

### Option B: Local PowerShell Seed Command
When running locally:
```powershell
cd server
npm run seed
# Output: Database initialised with synthetic datasets.
```
