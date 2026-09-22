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
- **Token expiration**: tokens expire after 5 minutes if unused, with an
  on-screen warning banner once the last 90 seconds are reached
- **Consumed tokens**: invalidated immediately after a vote is submitted
- **No demo candidates**: a brand-new election starts with zero candidates
  everywhere (no placeholder names to accidentally leave in front of real
  voters); Open Poll is blocked until every post (and, for house elections,
  every house/post pair) has at least one real candidate
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
- **Open Poll** / **Close Poll** (with a confirmation dialog) / **Reset Poll**
  (only when closed, with a confirmation dialog) / **Refresh** (manual
  refresh of the whole dashboard)
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
- **🖨️ Print Officer Turnout**: a separate, always-available printable report of
  just the officer/station turnout table (code, officer name, votes cast) — for
  whoever wants that on its own, without candidate results attached

### Election History & Reports
- **Download Report (current results)**: a printable, **results-only** report for
  the currently active election, any time — school post-wise, or house-then-post
  for house elections. Opens in a new tab; "Print / Save as PDF" uses the
  browser's own print dialog, so no extra software is needed. Officer turnout is
  deliberately not on this page — see "Print Officer Turnout" above for that.
- **Auto-archived on Reset or Switch Election Type**: right before votes are
  cleared, a full snapshot (results **and** officer turnout together) is saved
  permanently, so a completed election's record survives. The admin is prompted
  to give it a meaningful name (e.g. "School Council — Term 1 2026") at that
  moment; leaving it blank is fine, and a name can be added or fixed later.
- **Election History** panel lists every past snapshot (name, date, election
  type, total votes), with the name editable inline at any time, and
  "View / Print" (full report: results + turnout together, since this is the
  permanent historical record) and **Delete** (with a confirmation prompt) for
  each entry — e.g. to clear out test/junk snapshots left behind by a
  teacher testing round before real polling day.

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
- `GET /api/admin/storage-health` — whether the last save to Firestore/disk
  succeeded, and when; backs the Dashboard tab's Storage status indicator

#### Poll Management
- `GET /api/poll` — get poll status
- `POST /api/poll/open` / `close` — admin secret required
- `POST /api/poll/reset` / `set-type` — admin secret required; accepts an
  optional `name` used to label the archive snapshot this may create

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
- `GET /api/report/archives` — list past snapshots (includes each one's name,
  if set)
- `GET /api/report/archives/:id` — one full past snapshot
- `PUT /api/report/archives/:id` — set/change an archive's name
- `DELETE /api/report/archives/:id` — permanently remove one archive

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

None currently tracked. (The previously-noted unused `manifesto` and
officer-code `label` fields were removed on 2026-09-21 rather than finished,
since neither had an admin UI.)

---

*Last updated: 2026-09-22, reflecting `main`.*
