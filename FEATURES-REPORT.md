# Student Council & House Elections Software — Features Report

## Overview

This is a web-based voting system for managing student council (school-wide) elections
and house-level elections. It supports a locked-down voting kiosk for voters, and a
password-gated admin dashboard for election officials to configure candidates, run the
poll, generate per-polling-officer activation codes, and monitor results live.

The system is deployed to production on **Google Cloud Run**, backed by **Firestore**,
with automatic deploys from GitHub. See [Deployment](#-deployment) below.

---

## 🆕 What's Changed Since the Original Report

The original report described version 1.0.0 as first built. Since then:

- **Kiosk activation moved from one shared secret to per-officer codes.** Each
  polling officer/station now gets its own 6-character code, generated, named, and
  revoked from the admin dashboard, with a live running vote count per code.
- **The admin dashboard is now password-gated end-to-end.** Nothing renders or
  fetches until the admin secret is verified; the public site no longer links to it
  at all.
- **The voting screen looks and behaves like an EVM ballot unit**, with numbered
  rows, a lit indicator LED on selection, and a stylized vote button, instead of a
  plain list of buttons.
- **Candidates can now have a photo**, uploaded from the admin Edit flow, with a
  neutral silhouette shown when none is set.
- **Voting now ends in a single review screen** listing every selection with
  per-post "Change" buttons, instead of a confirm-per-post flow; the final receipt
  screen was simplified to protect ballot secrecy.
- **Errors are human-readable** everywhere in the kiosk and voting flow, not raw
  HTTP status text.
- **The admin dashboard's live refresh is now scoped to vote counts only** — earlier
  it also refreshed data an admin could be mid-editing (officer names, in one
  release, actually did get wiped by it — since fixed).
- **Storage moved to a production-grade backend.** The app now deploys to Google
  Cloud Run with Firestore-backed persistence and auto-deploy from GitHub on every
  push to `main`; local development is unchanged (JSON file).
- Several smaller correctness fixes: candidate order no longer shuffles in "Manage
  Candidates" as votes come in; "Generate Codes" behavior (always additive) is now
  explained in the UI instead of just being surprising; house selection now actually
  persists for an entire polling booth as originally intended, instead of resetting
  after every single vote.

---

## 🏫 School Elections Features

### Election Posts
The software manages elections for **5 school-level posts**:

1. **HB** - Head Boy
2. **HG** - Head Girl
3. **SSC** - School Sports Captain
4. **SRC** - School Resources Captain
5. **SCC** - School Cultural Captain

### School Elections Workflow
- All voters cast votes for all 5 posts in one ballot
- Unified results dashboard
- Candidate management by post

---

## 🏠 House Elections Features

### Election Posts
Each house manages elections for **3 house-level posts**:

1. **HC** - House Captain
2. **HCC** - House Cultural Captain
3. **HSC** - House Sports Captain

### Houses Supported
The system supports **8 houses**:

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
   selection the first time only (see [House Elections Workflow](#house-elections-workflow)).
2. **House Selection** (house elections only, first voter at a booth) — officer
   picks one of the 8 houses; every later voter at the same booth skips this step.
3. **Activation Page** — the polling officer enters their personal **6-character
   activation code** (see [Per-Officer Activation Codes](#-per-officer-activation-codes)).
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
6. **Confirmation** — simple "Vote Recorded" receipt (timestamp only, no candidate
   choices shown, to protect ballot secrecy) plus the requesting officer's **running
   vote count for their station**, so they can cross-check against a physical voter
   list. "Finish" clears the session for the next voter.

### Candidate Photos
- Candidates can have a photo, uploaded from the admin "Manage Candidates" **Edit**
  flow (see below). Uploads are resized/compressed in the browser before saving.
- A candidate with no uploaded photo shows a neutral, unisex silhouette everywhere a
  photo would appear — the ballot, the review screen, and the admin candidate list —
  so the UI never looks broken or gendered by default.

### Voting Security Features
- **Per-officer single-use tokens**: each activation creates a unique session token
- **Token expiration**: tokens expire after 10 minutes if unused
- **Consumed tokens**: invalidated immediately after a vote is submitted
- **Poll state validation**: cannot activate a ballot if the poll is closed
- **Election type validation**: cannot activate if no election type is active
- **Human-readable errors**: activation/voting failures (wrong code, poll closed, no
  election configured, expired session, etc.) show a plain-language message instead
  of a raw HTTP status code

---

## 🎛️ Admin Dashboard Features

### Access Control
- The entire admin dashboard is **hidden behind a password screen**. Nothing about
  poll status, candidates, or results is visible or fetched until the admin secret is
  verified against the server.
- The verified secret is kept for the browser tab (`sessionStorage`) so it doesn't
  need to be re-entered on every page reload; "Log out" clears it.
- The public site navigation only ever links to the kiosk — there is no admin link
  for a voter to stumble onto.

### Election Type Management
- **Toggle between School and House Elections** — only one is active at a time
- Switching types requires the poll to be closed first, and clears active kiosk
  sessions
- Color-coded buttons show which type is active; disabled while the poll is open

### Poll Controls
- **Open Poll** / **Close Poll** / **Reset Poll** (clears all votes; only when
  closed, with a confirmation dialog) / **Refresh** (manual refresh of the whole
  dashboard)
- All poll-changing actions require the admin secret and confirm destructive ones

### Manage Candidates
- **School view**: candidates grouped by post (HB, HG, SSC, SRC, SCC)
- **House view**: all 8 houses in a fixed order, each with its 3 posts (HC, HCC, HSC)
  listed vertically
- **Add candidate**: name only, per post (and house, for house elections)
- **Edit candidate**: update the name and/or **photo** inline — upload a new photo,
  or "Remove photo" to fall back to the silhouette
- **Delete candidate**: with a confirmation prompt
- The candidate list order here is **stable** — it no longer reshuffles as votes come
  in (previously it briefly shared sort order with the live Results panel; now each
  panel sorts independently for its own purpose)

### Results Overview
- Results grouped the same way as Manage Candidates (by post, or by house then post)
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
This replaced the old single shared kiosk password:

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

---

## 🔐 Security Features

### Authentication & Authorization
- **Admin Secret** (`ADMIN_SECRET` env var): required to view the admin dashboard at
  all, and for every poll/candidate/officer-code mutation
- **Per-officer activation codes**: each polling officer/station gets their own
  6-character code (generated and managed from the admin dashboard) instead of one
  shared secret for the whole election
- The legacy single `KIOSK_SECRET` is no longer used to activate a kiosk; the
  variable is kept only for backward compatibility with older data

### Data Protection
- Session tokens held in memory server-side with a 10-minute expiry and single-use
  consumption
- Every vote has a unique ID and timestamp
- Votes tagged with election type, house (if applicable), and the officer code that
  activated the session — never with anything identifying the voter
- Cannot vote when the poll is closed; cannot activate without a valid, unrevoked
  officer code

---

## 📊 Data Management

### Data Storage
- **Local development**: JSON file (`backend/data/data.json`), written on every
  change
- **Production (Cloud Run)**: **Google Firestore**, gated by the `USE_FIRESTORE`
  environment variable — same in-memory data model, mirrored to Firestore instead of
  disk
- Because election state lives in a single in-memory document, the Cloud Run service
  must run with `--max-instances=1` so two instances can never diverge
- Candidate photos are stored inline as small, browser-compressed JPEG data URLs
  (capped in size on the backend) rather than as separate uploaded files, so no
  additional file storage is required

### Data Validation
- Candidate's post must match the active election type
- House required for house-election candidates
- A vote must include a valid candidate selection for every post of the active
  election type
- Uploaded candidate photos are validated server-side for type and size

---

## 🎨 User Interface Features

### Design Elements
- Card-based, modern layout with consistent color coding (green = active/success,
  red = errors/destructive, blue = informational/primary action)
- **EVM-style ballot unit** on the voting screen — numbered rows, candidate photo,
  a lit/unlit red LED, and a stylized blue vote button — deliberately generic
  styling (no official government marks) evoking a real ballot machine rather than a
  plain button list
- Candidate photos with a neutral silhouette fallback wherever no photo is set

### Navigation & Feedback
- Clear step-by-step routing through the kiosk flow, with a step indicator
  ("Step X of Y") and a review screen before final submission
- Human-readable error messages throughout (kiosk activation, voting, admin actions)
- Loading/disabled states prevent double-submits and invalid actions mid-request

---

## 🔄 Real-Time Features

### Scoped Auto-Refresh (Admin Dashboard)
- Every 3 seconds while the poll is open, the dashboard refreshes **vote counts
  only** — candidate results and each officer code's running vote total
- Deliberately does **not** refresh anything an admin might be mid-editing (poll
  status, an in-progress candidate edit, an officer name being typed) — those update
  only when an explicit action (save, generate, open/close poll, etc.) completes
- Stops automatically when the poll is closed; a manual "Refresh" is always available

### Live Vote Feedback (Kiosk)
- After submitting, a voter's confirmation screen shows their station's running vote
  count, sourced from the same officer-code vote tally the admin dashboard uses

---

## 📱 Operational Features

### Poll Lifecycle
1. **Setup**: pick election type, configure candidates, generate officer codes
2. **Open**: requires an election type to be selected
3. **During voting**: admin dashboard auto-refreshes vote counts; officers activate
   kiosks with their codes
4. **Close**: stops new ballot activations and votes; clears active sessions
5. **Reset** (optional, only while closed): deletes all votes, confirmed via dialog

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

#### Health
- `GET /api/health` — liveness check (used by Cloud Run)

---

## 📝 Configuration

### Environment Variables (Backend)
- `PORT` — server port (default: 4000; Cloud Run injects this automatically)
- `ADMIN_SECRET` — admin dashboard/API authentication secret
- `KIOSK_SECRET` — **legacy, no longer used** to activate a kiosk; kept only for
  backward-compatible data structures
- `DATA_FILE` — path to the local JSON data file (ignored when `USE_FIRESTORE=true`)
- `USE_FIRESTORE` — `true` in production to persist state in Firestore instead of a
  local file
- `STATIC_DIR` — directory of the built frontend to serve (used by the Docker image;
  set automatically there)

### Network Configuration
- Backend listens on `0.0.0.0` (reachable from other devices on the network in local
  dev)
- Frontend dev server proxies `/api` to the backend
- Local dev ports: backend `4000`, frontend `5173`

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
- Runs with `--max-instances=1` (required — see [Data Storage](#data-storage))
- Firestore document `school-election/state` holds the entire election dataset

### Local Development
- `npm run dev` in `backend/` and `frontend/` (see each `package.json`)
- Leave `USE_FIRESTORE` unset to use the local JSON file automatically

Full setup/redeploy instructions, IAM roles, and operational notes live in
`DEPLOYMENT-GUIDE.md`.

---

## 📋 Summary of Key Features

### ✅ Core Capabilities
- Dual election type support (School + House), one active at a time
- Separate candidate pools per election type (and per house)
- Real-time vote-count refresh, scoped so it never interrupts admin edits
- Per-polling-officer activation codes with live per-station vote tallies
- Candidate photos with a graceful silhouette fallback
- EVM-styled voting screen

### ✅ User Experience
- Single review screen with per-post "Change" before final submission
- Human-readable error messages everywhere
- Password-gated admin dashboard; no admin link in public navigation

### ✅ Security & Integrity
- Per-officer single-use, time-limited voting tokens
- Poll-state and election-type validation before any vote
- Votes traceable to a station, never to a voter

### ✅ Operational Features
- Automatic data persistence (Firestore in production, JSON file locally)
- Auto-deploy to Cloud Run on every push to `main`

---

## 📊 Feature Comparison: School vs House Elections

| Feature | School Elections | House Elections |
|---------|-----------------|-----------------|
| **Posts** | 5 posts (HB, HG, SSC, SRC, SCC) | 3 posts (HC, HCC, HSC) |
| **Organization** | Post-based | House-based, then post-based |
| **Candidate Pool** | Global (all students) | Per house |
| **Activation** | Officer code → activation | House selection → officer code → activation |
| **Results Display** | Post-wise | House-wise, then post-wise |

---

## ⚠️ Known Issues

1. Two `Candidate` fields — `manifesto` and an officer-code `label` — are accepted by
   the API and stored, but neither is exposed in any admin UI yet.

---

## 📞 Quick Reference

### Default Secrets (change before any real election)
- **Admin Secret**: `admin-secret` (local default; set via `ADMIN_SECRET` in
  production)
- Kiosk activation no longer uses a shared secret — see
  [Per-Officer Activation Codes](#-per-officer-activation-codes)

### URLs
- **Production**: https://school-election-584391847327.asia-south1.run.app
  (`/kiosk` and `/admin`)
- **Local dev frontend**: `http://localhost:5173`
- **Local dev backend API**: `http://localhost:4000/api`

### Posts
- **School**: HB, HG, SSC, SRC, SCC
- **House**: HC, HCC, HSC

### Houses
Anand, Dhiraj, Kripa, Prem, Namrata, Nishtha, Satya, Shanti

---

*Last updated: 2026-09-03, reflecting `main`.*
