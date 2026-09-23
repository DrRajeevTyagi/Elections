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
- **Every House code is tied to one house** at the moment it is created, so the
  ballot opens straight into that house — no house-selection step at the booth
- Separate candidate pools per house and post
- House-wise results display, grouped in the fixed order above

---

## 🏢 Two Branches: Dwarka and AN

- Candidates, officer codes and votes each belong to one branch — **Dwarka** or
  **AN**. A voter only ever sees their own branch's candidates; the branch comes
  from the officer code used to unlock the ballot, and is enforced by the server.
- One election covers both branches at once (one Start, one End of Voting).
- The admin dashboard has a **Dwarka / AN** toggle on Manage Candidates, Live
  Results and Polling Officer Codes, and every report can be printed per branch.

---

## 🗳️ Kiosk/Voting Features

### Voting Flow (both election types)

1. **Welcome Page** — "Welcome to the Polling Booth", with the **Officer
   Activation** button and a small "Close polling at this booth" link.
2. **Activation Page** — the polling officer enters their personal **6-character
   code**. It is refused if the code has no officer name yet, has been closed,
   is for the other election type, or if polling is paused. A single-use ballot
   session is issued.
3. **Voting screen, styled as an EVM ballot unit** — one post at a time, presented as
   a stylized electronic-voting-machine panel: a numbered row per candidate with the
   candidate's photo (or a default silhouette), a blue "vote" button, and a red
   indicator LED that lights up on selection. Must pick one candidate per post before
   moving on; Previous/Next navigation between posts.
4. **Review screen** — after the last post, every selection is shown on one screen
   (post name, candidate photo, candidate name) with a per-post **Change** button that
   jumps back to that post and returns to the review screen afterward. Nothing is
   submitted until "Submit Ballot" is pressed here.
5. **Confirmation** — simple "Vote Recorded" receipt plus the officer's **running
   vote count for their station**, so they can cross-check against a physical voter
   list. "Finish" clears the session for the next voter.
6. **Close polling at this booth** — the officer enters their code once they're
   done for the day; the code then stops working until the administrator reopens it.

### Candidate Photos
- Candidates can have a photo, uploaded from the admin "Manage Candidates" **Edit**
  flow (see below). Uploads are resized/compressed in the browser before saving.
- A candidate with no uploaded photo shows a neutral, unisex silhouette everywhere a
  photo would appear — the ballot, the review screen, and the admin candidate list.

### Voting Security Features
- **Per-officer single-use tokens**: each activation creates a unique session token
- **Token expiration**: tokens expire after 5 minutes, with an on-screen warning
  banner once the last 90 seconds are reached
- **Consumed tokens**: invalidated immediately after a vote is submitted
- **Branch and house come from the code, not the kiosk**: a ballot can only be
  cast for candidates of the code's own branch (and house)
- **No demo candidates**: a brand-new election starts with zero candidates
  everywhere; the poll cannot open until every post (and, for house elections,
  every house/post pair) has at least one real candidate
- **Poll state validation**: a ballot cannot be activated or submitted while
  polling is paused or no election is under way

---

## 🎛️ Admin Dashboard Features

### Access Control
- The entire admin dashboard is **hidden behind a password screen**. Nothing about
  poll status, candidates, or results is shown until the admin secret is verified
  against the server.
- The verified secret is kept for the browser tab (`sessionStorage`) so it doesn't
  need to be re-entered on every page reload; "Log out" clears it.
- **One admin terminal at a time**: logging in on a second device offers "Take
  Over This Terminal", which signs the first device out.

### Running an Election (Dashboard tab)
- **🗳️ Start the Voting Process (School / House)** — a step-by-step wizard:
  choose School or House → vote counts will reset to zero → officer codes ready
  (shows the count per branch, and how many are unnamed) → codes allotted →
  candidates will be locked → name this election → **Open the Poll**. It can be
  abandoned at any step with **Abort**.
- While an election is running, a green **ELECTION IN PROGRESS** banner shows
  its name, type, start time and who started it.
- **⏸ Pause Polling / ▶ Re-start Polling** — one button; pausing stops all voting
  (and cancels any ballot in progress) without ending the election.
- **⏹ End of Voting** — saves the final result to Election History, closes the
  poll and ends the Activity Log recording. The final vote counts stay on screen
  until the next election of the same type is started.
- Candidates are locked for the whole election, including while paused.
- **Storage** card — confirms changes are durably saved; a red banner appears at
  the top if saves start failing.

### Manage Candidates
- **🏫 School Posts / 🏠 House Posts** and **Dwarka / AN** toggles
- **School view**: one post per row (HB, HG, SSC, SRC, SCC)
- **House view**: all 8 houses in a fixed order, each with its 3 posts (HC, HCC, HSC)
- **Add candidate**: name only, per post (and house, for house elections), into
  the selected branch
- **Edit candidate**: update the name and/or **photo**,
  or "Remove photo" to fall back to the silhouette
- **Delete candidate**: with a confirmation prompt
- All changes are blocked while an election is in progress

### Live Results
- **🏫 School Posts / 🏠 House Posts** and **Dwarka / AN** toggles
- Candidates sorted **leading-candidate-first** within each post, with the current
  leader highlighted; a per-post total under each post, and the overall ballot
  count in the header
- **Auto-refreshes every 3 seconds** while polling is open (vote counts only —
  it never disturbs an admin who is mid-edit elsewhere); manual "Refresh" always
  available
- **🖥️ Present Full Screen** — a clean projector view without the toggles

### Polling Officer Codes
- **📋 Bulk Allot from List**: upload a teacher list (Excel) — name, WhatsApp
  number, School duty, House duty — and a named code is created for every duty in
  one go, with a WhatsApp link per teacher to send it
- **Generate codes**: for House (the same number for all 8 houses, or top up one
  house) or for School posts, into the selected branch. Each is a random
  6-character lowercase code (confusable characters `i`, `l`, `o`, `0`, `1`
  excluded; matching ignores capitals). **Generating always adds to the existing
  list — it never replaces or clears previously generated codes.**
- **Name a code**: a code cannot unlock a ballot until an officer's name is saved
  against it
- **Close / Reopen** a code directly from this tab (same effect as the officer's
  own "Close polling at this booth")
- **Delete a code**: allowed only if no vote has been cast under it; otherwise
  close it instead
- **Live "Votes Cast" column**, refreshed every 3 seconds while polling is open
- Codes carry forward from one election to the next; a code closed at the end of
  one election is automatically reopened when the next election of its type starts
- **🖨️ Print Dwarka/AN Code List**: a printable "who has which code" roster per branch
- **🖨️ Print Officer Turnout**: code, officer name and votes cast, while an
  election is under way
- Because each code is tied to one officer/station, votes can be traced back to a
  station for auditing without ever recording which voter cast which ballot

### Election History & Reports
- **🖨️ Download Dwarka Report / Download AN Report** (Dashboard): a printable,
  **results-only** report — the live results while an election is running, or the
  most recently finished election once voting has ended. "Print / Save as PDF"
  uses the browser's own print dialog.
- **Saved automatically at End of Voting**, under the election's own name: a full
  snapshot of results **and** officer turnout.
- **📋 Save to Election History**: an optional mid-election checkpoint, without
  affecting any votes.
- **Election History** tab lists every saved election (name, date, type, total
  votes), with the name editable inline, and **View/Print Dwarka** / **View/Print
  AN** for each — with an "Include polling officer turnout" tick box.
- The Delete button is intentionally hidden; removing a test entry needs a developer.

### Activity Log
- A permanent record of every admin action taken between Start the Voting Process
  and End of Voting (code generation, naming, closing, reopening, deletion; pause
  and re-start; saves to history; admin logins and takeovers), plus officers
  closing their own booths. Nothing in it can be edited or deleted.
- Click an election's name to see its log, or search by election, type, branch,
  code, actor or action. **👥 Who were the polling officers?** and **Admin actions
  only** are one-click filters.

---

## 🔐 Security Features

### Authentication & Authorization
- **Admin Secret** required to view the admin dashboard at all, and for every
  election, candidate, officer-code and report action — checked in constant time
- **Single admin session**: even with the secret, only the device currently
  holding the admin console can act
- **Per-officer activation codes**: each polling officer/station gets their own
  6-character code (generated and managed from the admin dashboard)
- **Rate limiting**: repeated wrong admin secrets (20 per 10 minutes) or wrong
  officer codes (30 per 10 minutes) from one network are temporarily blocked
- Standard security headers (Helmet)

### Data Protection
- Cannot vote while polling is paused; cannot activate without a valid, named,
  open officer code of the right election type
- The server refuses to start if any stored vote record fails validation, rather
  than silently dropping it

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
- No CORS: the frontend is served from the same Express server

### Frontend Architecture
- **React + TypeScript**, built with **Vite**
- **React Router** for client-side routing
- **Context API** (`KioskProvider`) for kiosk session state
- **Axios** for API calls, with a response interceptor that surfaces the backend's
  plain-language error message instead of a generic HTTP status message

### API Endpoints

"Admin" below means the request needs the admin secret **and** must come from
the device currently holding the admin console.

#### Admin
- `POST /api/admin/verify` — check the admin secret and claim the admin console
  (`x-admin-force: true` takes it over from another device)
- `POST /api/admin/logout` — release the admin console
- `GET /api/admin/storage-health` — whether the last save succeeded, and when (admin)

#### Elections (all admin)
- `GET /api/election-runs/current` — the election in progress, if any
- `GET /api/election-runs` — every election, newest first
- `POST /api/election-runs/start` — Start the Voting Process
- `POST /api/election-runs/close` — End of Voting
- `GET /api/election-runs/:id/log` — one election's Activity Log
- `GET /api/election-runs/log/search` — search the Activity Log

#### Poll
- `GET /api/poll` — poll status (public)
- `POST /api/poll/set-type` — choose School/House (wizard step 1) (admin)
- `POST /api/poll/open` / `close` — open / pause polling (admin)
- `POST /api/poll/reset` — maintenance only; no button in the app, and refused
  while an election is in progress (admin)

#### Kiosk & Voting
- `POST /api/kiosk/activate` — unlock a ballot with an officer code
- `POST /api/kiosk/deactivate` — end a ballot session
- `POST /api/kiosk/close-booth` — officer closes their own code
- `POST /api/votes` — submit a vote (requires the kiosk session token)

#### Candidates & Results
- `GET /api/posts` — posts + candidates for the active election (optional
  `house`, `branch`) (public)
- `POST /api/candidates` / `PUT /api/candidates/:id` / `DELETE /api/candidates/:id`
  — admin; refused while an election is in progress
- `GET /api/results` — tallies (optional `house`, `branch`, `electionType`) —
  currently public, see Known Issues

#### Polling Officer Codes (all admin)
- `GET /api/officer-codes` — list codes with live vote counts
- `POST /api/officer-codes/generate` — generate `count` new codes
- `POST /api/officer-codes/bulk-allot` — create and name codes from a teacher list
- `PUT /api/officer-codes/:code` — set an officer's name
- `POST /api/officer-codes/:code/close` / `reopen`
- `DELETE /api/officer-codes/:code` — only if no votes were cast under it

#### Reports (all admin; optional `?branch=dwarka|AN`)
- `GET /api/report/current` — live snapshot, or the last finished election
- `POST /api/report/archives` — save a checkpoint to Election History
- `GET /api/report/archives` / `GET /api/report/archives/:id`
- `PUT /api/report/archives/:id` — rename
- `DELETE /api/report/archives/:id` — no button in the app

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
- Firestore document `school-election/state` holds candidates, poll state,
  officer codes and Election History; votes, elections and the Activity Log are
  stored as separate documents in its `votes`, `electionRuns` and `actionLog`
  subcollections (so vote volume never hits Firestore's per-document size limit)

---

## ⚠️ Known Issues

Found in the 2026-09-23 walkthrough; fixes pending. See ROLLOUT-CHECKLIST.md
"Current Limitations" for the workarounds.

- If a post has no candidate, Start the Voting Process starts the election but
  cannot open the poll, and candidates are then locked until End of Voting.
- The "every post has a candidate" check ignores branches, so the poll can open
  with AN empty.
- `GET /api/results` does not require the admin secret.
- Choosing School/House in the wizard takes effect immediately, even if the
  wizard is then aborted.
- Two consecutive zero-vote elections of the same type share one Election
  History entry.
- One malformed candidate, officer-code or history record in storage causes that
  whole list to be discarded on the next server restart.

---

*Last updated: 2026-09-23, reflecting `main`.*
