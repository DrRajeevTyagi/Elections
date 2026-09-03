# Student Council Elections Software 

This is a web-based voting system for managing student council elections for both School and House elections. It supports a locked-down EVM for voters, which a polling officer activates for one vote at a time, and a
password-gated admin dashboard for election officials to configure candidates, run the poll, generate activation codes for each polling-officer, and to monitor results live.

The system is deployed to production on **Google Cloud Run**, backed by **Firestore**,
with automatic deploys from GitHub. 
---
## 🏫 School Elections Features

### Election Posts
The software manages elections for **5 school-level posts**:

1. **HB** - Head Boy
2. **HG** - Head Girl
3. **SSC** - School Sports Captain
4. **SRC** - School Resources Captain
5. **SCC** - School Cultural Captain

- All voters cast votes for all 5 posts in one ballot
- Unified results dashboard
- Candidate management by post

---

## 🏠 House Elections Features

### Election Posts
Manages elections for **3 house-level posts**:

1. **HC** - House Captain
2. **HCC** - House Cultural Captain
3. **HSC** - House Sports Captain

### Houses

1. Anand
2. Dhiraj
3. Kripa
4. Prem
5. Namrata
6. Nishtha
7. Satya
8. Shanti

### House Elections Workflow
- **One-time house selection per booth** — the polling officer picks a house once;
  every subsequent voter at that station skips straight to activation
- Separate candidate pools per house and post
- House-wise results display, grouped in the fixed order above

---

## 🗳️ Kiosk/Voting Features

### Voting Flow (both election types)

1. **Welcome Page** — landing screen; for house elections, redirects to house
   selection the first time only.
2. **House Selection** (house elections only, one-time, by polling officer)
3. **Activation Page** — the polling officer enters their personal **6-character
   activation code** 
   A single-use ballot session token is issued.
4. **Voting screen, styled as an EVM ballot unit** — one post at a time, presented as
   a stylized electronic-voting-machine panel: a numbered row per candidate with the
   candidate's photo (or a default silhouette), a blue "vote" button, and a red
   indicator LED that lights up on selection. Must pick one candidate per post before
   moving on; Previous/Next navigation between posts.
5. **Review screen** — after the last post, every selection is shown on one screen
   (post name, candidate photo, candidate name) with a per-post **Change** button that
   jumps back to that post and returns to the review screen afterward. Nothing is
   submitted until "Submit Ballot" is pressed here.
6. **Confirmation** — simple "Vote Recorded" receipt plus the requesting officer's **running
   vote count for their station**, so they can cross-check against a physical voter
   list. "Finish" clears the session for the next voter.

### Candidate Photos
- Candidates can have a photo, uploaded from the admin "Manage Candidates" **Edit**
  flow (see below). Uploads are resized/compressed in the browser before saving.
- A candidate with no uploaded photo shows a neutral, unisex silhouette everywhere a
  photo would appear — the ballot, the review screen, and the admin candidate list.

### Voting Security Features
- **Per-officer single-use tokens**: each activation creates a unique session token
- **Token expiration**: tokens expire after 10 minutes if unused
- **Consumed tokens**: invalidated immediately after a vote is submitted
- **Poll state validation**: cannot activate a ballot if the poll is closed by Chief Election Commisioner. 
- **Election type validation**: cannot activate if no election type is active

---

## 🎛️ Admin Dashboard Features

### Access Control
- The entire admin dashboard is **hidden behind a password screen**. Nothing about
  poll status, candidates, or results is visible or fetched until the admin secret is
  verified against the server.
- The verified secret is kept for the browser tab (`sessionStorage`) so it doesn't
  need to be re-entered on every page reload; "Log out" clears it.

### Election Type Management
- **Toggle between School and House Elections** — only one is active at a time
- Switching types requires the poll to be closed first, and clears active kiosk
  sessions
- Color-coded buttons show which type is active; disabled while the poll is open

### Poll Controls
- **Open Poll** / **Close Poll** / **Reset Poll** (only when closed, with a
  confirmation dialog) / **Refresh** (manual refresh of the whole dashboard)
- **Reset Poll** now archives the current results to Election History
  automatically before clearing votes, so nothing is lost — see below
- All poll-changing actions require the admin secret and confirm destructive ones

### Manage Candidates
- **School view**: candidates grouped by post (HB, HG, SSC, SRC, SCC)
- **House view**: all 8 houses in a fixed order, each with its 3 posts (HC, HCC, HSC)
  listed vertically
- **Add candidate**: name only, per post (and house, for house elections)
- **Edit candidate**: update the name and/or **photo**,
  or "Remove photo" to fall back to the silhouette
- **Delete candidate**: with a confirmation prompt

### Results Overview
- Results grouped by post, or by house then post
- Candidates sorted **leading-candidate-first** within each post, with the current
  leader highlighted in green
- Vote badges with singular/plural handling ("1 vote" / "3 votes")
- **Auto-refreshes vote counts every 3 seconds** while the poll is open — and only
  vote counts. It does not touch poll status, candidate data, or any in-progress
  admin edit, so an admin can safely add/edit a candidate or a polling officer's name
  while voting is underway without losing what they're typing.
- Manual "Refresh" always available; auto-refresh stops automatically once the poll
  is closed

### Per-Officer Activation Codes

- **Generate codes**: enter how many new codes to add and click "Generate Codes".
  Each is a random 6-character code (ambiguous characters like `I`/`O`/`0`/`1`
  excluded so it's easy to read aloud or copy by hand). **Generating always adds to
  the existing list — it never replaces or clears previously generated codes.**
- **Name a code**: attach a polling officer's name to a code for reference
- **Delete a code**: revokes that officer's ability to activate a kiosk, with a
  confirmation prompt
- **Live "Votes Cast" column**: shows each code's running vote total, refreshed every
  3 seconds while the poll is open
- Because each code is tied to one officer/station, votes can be traced back to a
  station for auditing without ever recording which voter cast which ballot

### Election History & Reports
- **Download Report**: a printable results report for the currently active
  election, any time — school post-wise, or house-then-post for house elections
  — plus per-officer turnout. Opens in a new tab; "Print / Save as PDF" uses the
  browser's own print dialog, so no extra software is needed.
- **Auto-archived on Reset**: right before "Reset Poll" clears votes, the same
  report is saved permanently as a timestamped snapshot, so a completed
  election's record survives switching election types or running another poll.
- **Election History** panel lists every past snapshot (date, election type,
  total votes) with a "View / Print" link back to that snapshot's report.

---

## 🔐 Security Features

### Authentication & Authorization
- **Admin Secret** required to view the admin dashboard at
  all, and for every poll/candidate/officer-code mutation
- **Per-officer activation codes**: each polling officer/station gets their own
  6-character code (generated and managed from the admin dashboard) 

### Data Protection

- Cannot vote when the poll is closed; cannot activate without a valid, unrevoked
  officer code

---

## 🎨 User Interface Features

### Design Elements

- **EVM-style ballot unit** on the voting screen — numbered rows, candidate photo,
  a lit/unlit red LED, and a stylized blue vote button 
- Candidate photos with a neutral silhouette fallback wherever no photo is set

---

## 🔧 Technical Features

### Backend Architecture
- **Node.js + Express**, **TypeScript** throughout
- Modular routes/services/middleware structure
- Centralized error-handling middleware translating internal errors into
  human-readable API responses
- CORS enabled

### Frontend Architecture
- **React + TypeScript**, built with **Vite**
- **React Router** for client-side routing
- **Context API** (`KioskProvider`) for kiosk session state
- **Axios** for API calls, with a response interceptor that surfaces the backend's
  plain-language error message instead of a generic HTTP status message

### API Endpoints

#### Admin
- `POST /api/admin/verify` — check the admin secret is correct (used to gate the
  dashboard) before revealing any content

#### Poll Management
- `GET /api/poll` — get poll status
- `POST /api/poll/open` / `close` / `reset` / `set-type` — admin secret required

#### Kiosk Operations
- `POST /api/kiosk/activate` — activate a ballot with an officer code (+ house, for
  house elections)
- `POST /api/kiosk/deactivate` — end a session

#### Voting
- `POST /api/votes` — submit a vote (requires kiosk session token)

#### Candidates
- `GET /api/posts` — posts + candidates for the active election (and house, if set)
- `POST /api/candidates` / `PUT /api/candidates/:id` / `DELETE /api/candidates/:id`
  — admin secret required; `PUT`/`POST` accept an optional photo (`imageUrl`)

#### Results
- `GET /api/results` — results for the active election type (optional house filter)

#### Polling Officer Codes
- `GET /api/officer-codes` — list codes with live vote counts (admin secret
  required)
- `POST /api/officer-codes/generate` — generate `count` new codes, added to the
  existing list
- `PUT /api/officer-codes/:code` — update an officer's name
- `DELETE /api/officer-codes/:code` — revoke a code

#### Reports
- `GET /api/report/current` — live, unpersisted snapshot of the active
  election (admin secret required)
- `GET /api/report/archives` — list past snapshots
- `GET /api/report/archives/:id` — one full past snapshot

#### Health
- `GET /api/health` — liveness check (used by Cloud Run)

---

## 🚀 Deployment

### Production: Google Cloud Run + Firestore
- Ships as a single Docker image (frontend build served by the Express backend)
- Live service (for reference):
  - GCP project: `school-election-rt2026` (region `asia-south1`)
  - Cloud Run service: `school-election`
  - Live URL: https://school-election-584391847327.asia-south1.run.app
- **Auto-deploy on push**: `.github/workflows/deploy-cloud-run.yml` builds and
  redeploys automatically on every push to `main`, using Workload Identity
  Federation (no long-lived service-account keys in GitHub)
- Runs with `--max-instances=1` (required — election state lives in a single
  in-memory document, mirrored to Firestore, so two instances would diverge)
- Firestore document `school-election/state` holds the entire election
  dataset, including archived reports

---

## ⚠️ Known Issues

1. Two `Candidate` fields — `manifesto` and an officer-code `label` — are accepted by
   the API and stored, but neither is exposed in any admin UI yet.

---

*Last updated: 2026-09-03, reflecting `main`.*
