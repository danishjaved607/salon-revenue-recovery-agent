# Certification Demonstration Script — Salon Revenue Recovery Agent

This document provides a structured, professional **10 to 15 minute walkthrough script** designed for technical evaluators, stakeholders, and certification reviewers.

---

## Demonstration Overview & Schedule

| Segment | Topic | Target Duration | Screen / Route |
|---|---|:---:|---|
| **Scene 1** | Introduction, Business Problem & Architecture | 2.0 mins | Project Overview / Slides |
| **Scene 2** | Live Revenue Dashboard Initial State | 1.5 mins | `/dashboard` |
| **Scene 3** | Cancelled Appointment Queue Inspection | 1.5 mins | `/recovery-workspace` |
| **Scene 4** | Deterministic Matching Engine & Qualification | 2.0 mins | `/recovery-workspace` |
| **Scene 5** | Offer Creation & Human-in-the-Loop Gating | 2.0 mins | `/offers` |
| **Scene 6** | Simulated Customer Replies & Atomic Booking Recovery | 2.5 mins | `/offers` & `/dashboard` |
| **Scene 7** | Conversational AI Recovery Concierge & 7 Tools | 2.5 mins | `/agent` |
| **Scene 8** | Security Controls, Limitations & Wrap-Up | 1.0 min | Audit Summary |
| **Total** | | **~15 mins** | |

---

## Scene 1: Introduction, Business Problem & Architecture (2.0 Mins)

### Talking Points & Narration
> "Welcome everyone. Today I am presenting the **Salon Revenue Recovery Agent**, an intelligent AI-assisted software system built to solve one of the most persistent operational pain points in the salon and wellness industry: **last-minute appointment cancellations and unrecovered revenue**."

### The Problem
- Salons typically experience cancellation rates between **10% and 25%**.
- High-value slots (like Balayage, Facials, or Color Correction) represent significant immediate financial loss when cancelled within 24 hours.
- Front-desk staff rarely have time to manually cross-reference waitlists, check staff shift hours, verify specialist qualifications, confirm customer consent, and negotiate replacement slots.

### The Solution Architecture
- **Presentation Layer:** Modern SaaS frontend built with React 18, Vite, and clean Vanilla CSS design tokens.
- **Application Layer:** Node.js & Express REST API with transactional recovery services and multi-turn OpenAI tool calling.
- **Data Layer:** Embedded SQLite with Write-Ahead Logging (WAL) and strict relational foreign keys.
- **Core Philosophy:** **Deterministic safety first, AI assistance second.** All candidate eligibility checks, staff qualifications, and booking confirmations are computed deterministically. The AI is used for intelligent inquiry, automated offer drafting, and conversational operator triage—with strict human-in-the-loop safeguards.

---

## Scene 2: Live Revenue Dashboard Initial State (1.5 Mins)

### Screen Action
1. Open the browser and navigate to `/dashboard`.
2. Allow the dashboard metrics to load via `GET /api/dashboard/metrics`.

### Talking Points & Narration
> "Here on the **Live Revenue Recovery Dashboard**, salon managers see their recovery pipeline at a glance:
> - **Recovered Revenue:** Initially PKR 0, reflecting a fresh seed state.
> - **Recovered Bookings:** 0.
> - **Lost Revenue at Risk:** Displays the cumulative PKR value of currently cancelled appointments awaiting replacement.
> - **Appointment Recovery Rate:** 0.0%.
> - **Offer Performance:** Shows a breakdown of all generated offers across the 7 lifecycle states: Pending Approval, Approved, Sent, Accepted, Declined, No Reply, and Expired.
>
> Notice that all calculations use safe-division guards returning 0 rather than NaN or Infinity when denominators are zero."

---

## Scene 3: Cancelled Appointment Queue Inspection (1.5 Mins)

### Screen Action
1. Click **Recovery Workspace** in the sidebar (`/recovery-workspace`).
2. Point out the left-hand column: **Cancelled Appointments Queue**.

### Talking Points & Narration
> "In the **Recovery Workspace**, front-desk staff inspect cancelled slots fetched from `GET /api/appointments/cancelled`.
> - Notice slot **`apt-001`**: A *HydraFacial Glow* appointment scheduled for 10:00–11:00 AM on 2026-11-03 with specialist **Sara Ahmed**, valued at **PKR 2,500**.
> - The cancellation reason is clearly recorded: *'Client called to cancel due to family emergency'*.
> - The system automatically selects the first slot, immediately triggering the deterministic matching engine on the right."

---

## Scene 4: Deterministic Matching Engine & Qualification (2.0 Mins)

### Screen Action
1. Highlight the **Slot Summary Card** on the right.
2. Review the **Assigned Staff Status**: `Qualified` and `Schedule Available`.
3. Review the **Eligible Candidates** section.
4. Expand the **Excluded Candidates** accordion at the bottom.

### Talking Points & Narration
> "This matching is 100% deterministic, backed by `GET /api/appointments/apt-001/matches`. The engine verifies 7 strict criteria before recommending any client:
> 1. **Service Match:** Must request exact service (`svc-001`).
> 2. **Dual Consent Check:** Both `customers.consentToOffers` and `waitlist.consentGiven` must equal 1.
> 3. **Staff Qualification:** Specialist Sara Ahmed's specializations must include the requested service.
> 4. **Staff Schedule Bounds:** Slot must fall within her shift (09:00–17:00) and not overlap her break (13:00–14:00).
> 5. **Date Availability:** Slot date must be in the customer's `availableDates`.
> 6. **Time Bucket Compatibility:** 10:00 AM is classified as `morning` and matches the client's `availableTimeSlots`.
> 7. **Double-Booking Shield:** Neither staff nor customer can have an active overlapping booking.
>
> Notice candidate **Ayesha Khan (wl-002)** is ranked as **Priority 1**.
> If we open the **Excluded Candidates** panel, we see complete transparency: candidates are rejected with explicit, auditable reason codes like `NO_CUSTOMER_CONSENT` or `TIME_SLOT_NOT_AVAILABLE`."

---

## Scene 5: Offer Creation & Human-in-the-Loop Gating (2.0 Mins)

### Screen Action
1. Click **"Create Recovery Offer"** next to candidate Ayesha Khan (`wl-002`).
2. Observe the success notification confirming offer creation.
3. Click **Offers** in the sidebar navigation (`/offers`).
4. Locate the newly generated offer in the list.

### Talking Points & Narration
> "When we click 'Create Recovery Offer', the backend creates an offer record using `POST /api/offers`.
> - **Human-in-the-Loop Safeguard:** Notice that the offer is created in status **`Pending Approval`**. The system **never** sends an offer autonomously.
> - **AI Message Drafting:** The message text was drafted specifically for Ayesha Khan, highlighting the exact slot time, specialist name, service price, and mandatory Call-to-Action: *'Reply YES to confirm or NO to pass.'*
> - **Approval Workflow:**
>   1. The salon manager clicks **'Approve Offer'** &rarr; Offer status transitions to `Approved`.
>   2. The manager clicks **'Mark as Sent'** &rarr; Offer transitions to `Sent`.
>   3. Only offers in `Sent` status are eligible to receive customer responses."

---

## Scene 6: Simulated Customer Replies & Atomic Booking Recovery (2.5 Mins)

### Screen Action
1. On the sent offer card, locate the **Simulate Customer Response** panel.
2. Point out the three response buttons: `Simulate YES`, `Simulate NO`, and `Simulate NO_REPLY`.
3. Click **"Simulate YES"**.
4. Observe the green confirmation banner:
   - Appointment slot recovered (`apt-001` status: `recovered`).
   - Waitlist entry booked (`wl-002` status: `booked`).
   - Offer accepted (`status: accepted`).
5. Navigate back to **Dashboard** (`/dashboard`).
6. Point out that **Recovered Revenue** is now **PKR 2,500**, **Recovered Bookings** is **1**, and **Recovery Rate** has updated dynamically.
7. *(Optional)* Briefly demonstrate a `NO` or `NO_REPLY` on a secondary slot (`apt-002`), demonstrating that declined offers transition to `declined` without altering booking or revenue state.

### Talking Points & Narration
> "When the customer replies 'YES', the backend calls `POST /api/offers/:id/simulate-reply`.
> - **Transactional Integrity:** Inside SQLite `BEGIN IMMEDIATE;`, the system revalidates slot availability, updates `appointments.status` to `recovered`, updates `waitlist.status` to `booked`, and updates `offers.status` to `accepted`.
> - **Concurrency Protection:** If two competing clients were to reply 'YES' simultaneously, the first acquires the immediate write lock and books the slot; the second is safely rejected with HTTP 409 Conflict without data corruption.
> - Returning to the dashboard, we see live revenue recovery metrics update immediately."

---

## Scene 7: Conversational AI Recovery Concierge & 7 Tools (2.5 Mins)

### Screen Action
1. Navigate to **AI Agent** (`/agent`).
2. Point out the **Backend Connected** green health indicator (verifying `GET /api/health`).
3. Point out the prominent **Human-in-the-Loop Safeguard Notice**.
4. Point out the **Suggested Prompt Chips**:
   - *"Find cancelled appointments."*
   - *"Find eligible waitlist customers."*
   - *"Explain why a customer is eligible."*
   - *"Prepare recovery offers."*
   - *"Show recovery performance."*
5. Click **"Find cancelled appointments."** or type an inquiry.

### Talking Points & Narration
> "The **AI Recovery Agent** provides an interactive conversational assistant for salon operators.
> - **Tool Execution Transparency:** When the agent calls backend tools, the **Tool Execution Panel** expands to display exactly which tools were invoked (e.g. `get_cancelled_appointments`, `find_eligible_waitlist_candidates`, or `get_dashboard_metrics`).
> - Operators can inspect the safe input summary, safe output summary, and collapsible raw JSON payloads.
> - **PII Stripping:** Before any data reaches OpenAI, the server's `sanitizePii` recursively strips customer phone numbers and email addresses.
> - **Circuit Breaker:** The agent's autonomous loop is capped at 6 iterations to prevent runaway API loops."

### ⚠️ Fallback Plan if OpenAI Credits are Unavailable (HTTP 429)
> [!NOTE]
> **If OpenAI API credits are exhausted or unconfigured during the evaluation:**
> 1. Demonstrate that when a message is sent, the backend gracefully catches the OpenAI 429 quota exhaustion response and returns a structured `OPENAI_API_ERROR`.
> 2. Show that the frontend renders a clean, user-friendly error card explaining the quota limit with an interactive **"Retry Last Message"** button (which re-attempts the request without creating duplicate user bubbles).
> 3. Explain that all message drafting features automatically use deterministic fallback templates when OpenAI is unavailable.
> 4. Point to the **automated test suite** (`npm test`), where mock OpenAI clients demonstrate full multi-turn tool calling and end-to-end recovery loops 100% offline across 208 passing tests.

---

## Scene 8: Security Controls, Limitations & Wrap-Up (1.0 Min)

### Talking Points & Narration
> "To conclude, let's review the system's verified security architecture:
> 1. **SQL Injection Immune:** 100% parameterized queries across all services.
> 2. **Zero Secrets in Frontend:** The client bundle contains zero API keys or backend credentials.
> 3. **Privacy by Design:** Strict dual consent verification and recursive PII stripping.
> 4. **No Autonomous Dispatch:** AI can draft, but cannot approve or send offers.
> 5. **Quality Assurance:** 208 automated tests passing across 55 suites with 100% pass rate.
>
> **Prototype Limitations for this certification:**
> - Authentication and role-based access control are currently omitted (prototype mode).
> - Production deployment will require TLS termination and rate limiting.
>
> Thank you. I am now open to any questions or deep-dive code inspections."
