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
  Results and Polling Officer Codes, and every report and Election Record can be
  printed per branch.

---

## 🗳️ Kiosk/Voting Features

### Voting Flow (both election types)

1. **Welcome Page** — "Welcome to the Polling Booth", with the **Officer
   Activation** button and a small "Close polling at this booth" link.
2. **Activation Page** — the polling officer enters their personal **6-character
   code**. It is refused if the code has no officer name yet, has been closed,
   was replaced by a re-poll, or is for the other election type. A single-use
   ballot session is issued.
   - **Check-in before voting opens:** a correct code entered while polling hasn't
     started (or is paused) shows a green *"✓ Your code is correct and you are
     marked as ready. Voting has not started yet…"* — and the code turns green on
     the admin's Polling Officer Codes tab. These check-ins never count towards the
     wrong-code lockout.
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
   done for the day; the code then stops working (red on the admin tab). The Chief
   Election Commissioner then checks the booth's count against its Paper List and
   either **Verifies & Seals** it or **Orders a Re-poll** (see Polling Officer Codes).

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
- **Sealed and re-polled booths are final**: a ballot that was opened just before
  its booth was sealed, or before a re-poll was ordered there, is refused on
  Submit (and the voter is told why) — so a sealed count can never change

---

## 🎛️ Admin Dashboard Features

### Access Control
- The entire admin dashboard is **hidden behind a password screen**. Nothing about
  poll status, candidates, or results is shown until the admin secret is verified
  against the server.
- The verified secret is kept for the browser tab (`sessionStorage`) so it doesn't
  need to be re-entered on every page reload; "Log out" clears it.
- **One admin terminal at a time, handed over only with consent**: logging in on
  a second device shows which device is in control and offers **Ask for Control**.
  The device in control gets an Allow / Deny popup (with a sound and a flashing
  tab title, naming the asking device):
  - **Allow** — control moves; the old device is signed out within seconds
  - **Deny** — the old device stays in control; the asker sees "Request refused"
  - **No answer in 1 minute** — counts as Deny
  - **Device in control silent for 3+ minutes** (switched off, closed, crashed) —
    the new device can log in without asking
  - Every request and answer is recorded in the Activity Log. Keep the admin tab
    in front during an election: browsers slow down background tabs, so a
    request could otherwise expire before the popup appears.

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
  poll, closes every booth of that election (red) and ends the Activity Log
  recording. **One rule: refused until every code of that election (Dwarka and
  AN) is either deleted, or closed and verified & sealed** — an unallotted code
  is deleted; every allotted booth, even one with no votes, is closed and sealed
  (Paper List 0). So the election can't be ended by mistake while any booth is
  still polling — important, because a closed election can't be reopened. A
  **"Before End of Voting"** box above the button lists what's left (booths still
  polling, closed booths waiting for Verify & Seal, unallotted codes to delete),
  and a refusal names the codes. Re-polled codes don't count; their fresh code
  does. The final vote counts stay on screen until the next election of the same
  type is started.
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
- If a re-poll was ordered, a note under the header says so, e.g. *"Includes 1
  re-poll: 14 votes cancelled at Dwarka booth ab12 (Anand House). Those votes are
  not counted; the re-poll's own votes are."*

### Polling Officer Codes

One code = one booth = one teacher in charge.

**Layout** (redesigned 2026-10-09). At the top, choose the **Election (School /
House)** and the **Branch (Dwarka / AN)** — only that election's codes are shown.
Then one of three steps:

| Step | What's on it |
| --- | --- |
| **1. Before the election** | Upload Teacher List · Send Codes (with "120 of 160 sent") · Print Code List · "Starting a new election?" (Reset Colours to White, Remove All Codes) · the code list |
| **2. Election day** | The End of Voting checklist · every booth with its one next step: **Close Booth → Verify & Seal → Done**, and **Re-poll** beside it |
| **More** | Make blank codes by hand · Clear Code Lockouts |

The tab opens on **Election day** while that election is running, otherwise on
step 1, and refreshes itself every 5 seconds. On a phone each row becomes a card.

**Duty colours** — every code is coloured. The colour counts above each list are
buttons: tap one (e.g. "Sent, not ready 12") to see just those codes.

| Colour | Meaning |
| --- | --- |
| ⚪ White | Fresh duty — not sent yet |
| 🟡 Yellow | Sent on WhatsApp — teacher hasn't entered it yet |
| 🟢 Green | **Ready** — teacher entered the code on a kiosk |
| 🔴 Red | **Polling closed** — waiting for the Paper List check (also every code after End of Voting) |
| ⚪ 🔒 | **Sealed** — verified against the Paper List; final |
| Grey | Re-polled — replaced by a fresh code, can never be used again |

**1. Before the election**
- **Upload Teacher List**: an Excel list — name, WhatsApp number, School duty,
  House duty — creates a named code for every duty in one go, saving each
  teacher's number with their code. One list per branch.
- **Send Codes**: sends from the saved list any time (e.g. the evening before).
  **Send Next** opens the WhatsApp app on the computer with the next teacher's
  message ready — press Enter in WhatsApp, come back, click again. One message per
  teacher carries both their School and House codes. Each is ticked as sent (with
  Undo), so sending resumes where it stopped, even the next day. A switch falls
  back to WhatsApp Web (reusing one browser tab). Teachers with no valid number
  are listed separately with a box to add one. The message wording can be edited.
- **Print Dwarka/AN Code List**: a printable "who has which code" roster per
  branch (re-polled codes are left off).
- **Reset Colours to White** (was "Start Allotting Duties for a Fresh Election"):
  every code of the chosen election, in both branches, turns white (usable, not
  sent, not ready, not sealed). Re-polled codes stay dead. Not allowed while that
  election is running. If forgotten, Start the Voting Process turns any leftover
  red codes white automatically (keeping that morning's green check-ins).
- **Remove All Codes**: deletes **every** code of the chosen election, Dwarka and
  AN together, after typing CONFIRM — a completely clean list before uploading a
  new teacher list. Not allowed while that election is running. Past elections in
  Election History are not affected.
- **The code list**: code, teacher, WhatsApp number (last 4 digits), colour, and
  **Edit** / **Delete** on each row. A name is changed with **Edit** (type, Save),
  any time — even during the election. A code cannot unlock a ballot until an
  officer's name is saved against it.

**2. Election day**
- **The checklist** at the top: how many booths are still polling, how many are
  closed and waiting for Verify & Seal, and unused codes to delete — Dwarka and
  AN together — with a progress bar. Green once End of Voting can be pressed.
- **Close Booth / Reopen** directly from here (same effect as the officer's own
  "Close polling at this booth"). A sealed or re-polled booth can't be reopened.
- **Verify & Seal** (on each closed booth): the Chief Election Commissioner types
  the number of voters on the printed **Paper List**. If it matches the app's
  count for that booth, the booth is sealed for good (🔒 Sealed · Paper List 38)
  and can't be reopened or re-polled. If not, sealing stays locked and the screen
  offers **Order Re-poll** instead. The server re-checks the count at the moment
  of sealing. A booth that cast no votes is sealed too, with a Paper List of 0.
  An unallotted (unnamed) code shows **Delete Unused Code** instead.
- **Re-poll** a booth (only while its election is running, and not once sealed):
  the window names the **branch, booth, house and teacher**, and lists exactly
  what will be taken off each candidate (e.g. *"House Captain: Asha −30, Ravi
  −12"*). The Chief Election Commissioner picks a reason (irregularity, physical
  disruption, vote-count mismatch, other), adds a note and types CONFIRM.
  - Every vote from that booth is taken off every candidate's count, everywhere —
    results, totals, turnout, saved reports — but kept on record, never deleted.
    The per-candidate breakdown is saved with the re-poll for the Election Record.
  - The new code's votes are counted normally.
  - The old code is dead for good (can't be reopened or used to vote; a ballot
    already open there is refused on Submit).
  - A **fresh code** is issued with the same details (School/House, branch,
    house), to the same teacher (keeping their WhatsApp number) or a different
    one. It starts white, and is sent from Send Codes like any other.
  - The "Re-poll ordered" message names its branch and shows only on that
    branch's tab.
  - Everyone who voted at that booth must vote again — votes are secret, so the
    app can't tell who they were.

**More**
- **Make blank codes by hand**: for one house, all 8 houses (the same number
  each), or School — into the selected branch. Not normally needed, since
  uploading the teacher list makes and names codes in one go. Each is a random
  6-character lowercase code (confusable characters `i`, `l`, `o`, `0`, `1`
  excluded; matching ignores capitals). Making codes always adds to the list.
- **Clear Code Lockouts**: unblocks every device locked out for wrong codes.

**Deleting codes** (rule changed 2026-10-09)
- **While that election is running**, a code that has votes, a seal, or is part
  of a re-poll can't be deleted — close it instead. An unused code can be.
- **Before the election, or after End of Voting**, any code can be deleted,
  including used, sealed and re-poll codes — End of Voting has already saved the
  full record of every booth. Deleting a re-polled code also removes its cancelled
  votes (they never counted; the saved record keeps how many there were).
- Codes otherwise carry forward from one election to the next: at End of Voting
  every code turns red, and becomes usable again with Reset Colours to White, or
  automatically when the next election of that type is started.
- Because each code is tied to one officer/station, votes can be traced back to a
  station for auditing without ever recording which voter cast which ballot.

### Election History & Reports
- **🖨️ Download Dwarka Report / Download AN Report** (Dashboard): a printable,
  **results-only** report — the live results while an election is running, or the
  most recently finished election once voting has ended. "Print / Save as PDF"
  uses the browser's own print dialog.
- **Saved automatically at End of Voting**, under the election's own name: a full
  snapshot of results **and** every booth (teacher, votes, Paper List, house,
  re-polls with what each took off each candidate).
- **📋 Save to Election History**: an optional mid-election checkpoint, without
  affecting any votes.
- **Election History** tab lists every saved election (name, date, type, total
  votes), with the name editable inline, and **View/Print Dwarka** / **View/Print
  AN** for each — with an "Include polling officer turnout" tick box.
- The Delete button is intentionally hidden; removing a test entry needs a developer.

### Election Record (added 2026-10-09)
One election's whole story on one printable page — **📜 Election Record** next to
each election in Election History (only elections ended with End of Voting), and
**📜 Election Record (not final yet)** for the one running now. View it for
**Both branches**, **Dwarka** or **AN**.
1. **Summary** — when it started and ended and who did it, votes counted (and
   per branch), booths used and sealed, number of teachers, re-polls and how
   many votes they cancelled.
2. **Results** — the winner of every post (ties shown as ties), then every
   candidate's count. Always one branch at a time: each branch elects its own.
3. **Booth by booth** — code, teacher, votes counted, Paper List number, status
   (Sealed / Closed / Re-polled), grouped by house for House Elections; each
   re-poll's reason and what it took off each candidate, with its new code right
   below it. (This replaces the old "Print Officer Turnout".)
4. **What happened** — the Activity Log in plain sentences, in time order. Routine
   per-teacher steps (allotting, sending, logins) are counted in one line, with
   **Show every step** to list them.

Older elections open too, but without booth houses or per-candidate re-poll
breakdowns, which weren't saved before 2026-10-09.

### Activity Log
- A permanent record of every admin action taken between Start the Voting Process
  and End of Voting (code making, naming, phone numbers, WhatsApp sent marks,
  closing, reopening, deletion, removing all codes, **Verify & Seal** with both
  counts, **re-polls** with reason, breakdown and new code, colour resets; pause
  and re-start; saves to history; admin logins, **requests for control,
  approvals, refusals, expiries** and takeovers), plus officers closing their own
  booths. Nothing in it can be edited or deleted. Takeovers and refused requests
  are highlighted.
- Every entry reads as a plain sentence, e.g. *"Rajeev verified booth ab12 (Mrs.
  Sharma) against the Paper List and sealed it: Paper List 38, app 38."*
- Click an election's name to see its log, or search by election, type, branch,
  code, actor or action. **👥 Who were the polling officers?** and **Admin actions
  only** are one-click filters.
- Nothing is recorded between elections (e.g. codes deleted before Start).

---

## 🔐 Security Features

### Authentication & Authorization
- **Admin Secret** required to view the admin dashboard at all, and for every
  election, candidate, officer-code and report action — checked in constant time
- **Single admin session**: even with the secret, only the device currently
  holding the admin console can act; another device can only *ask* for control,
  and the device in control must allow it (see Access Control)
- **Per-officer activation codes**: each polling officer/station gets their own
  6-character code (generated and managed from the admin dashboard)
- **Rate limiting**: repeated wrong admin secrets (20 per 10 minutes, per network)
  or wrong officer codes (30 per 10 minutes, per device) are temporarily blocked.
  A correct code entered before voting opens (a check-in) is not counted. The
  admin can clear officer-code lockouts instantly (🔓 Clear Code Lockouts)
- Standard security headers (Helmet)

### Data Protection
- Cannot vote while polling is paused; cannot activate without a valid, named,
  open officer code of the right election type
- Votes from a re-polled booth are never deleted, but never counted in any result
- The election cannot be declared closed until every code of it is deleted, or
  closed and checked against its Paper List and sealed — so it can't be ended by
  mistake while any booth is still polling
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
  (refused with `ADMIN_SESSION_CONFLICT` while another live device holds it; a
  device silent for 3+ minutes is replaced without asking)
- `POST /api/admin/takeover-requests` — ask the device in control to hand over
  (secret only); `GET`/`DELETE /api/admin/takeover-requests/:id` — check on or
  withdraw that request
- `GET /api/admin/session-status` — the device in control checks in every few
  seconds; returns any request waiting for its answer (admin)
- `POST /api/admin/takeover-requests/:id/respond` — Allow / Deny (admin)
- `POST /api/admin/logout` — release the admin console
- `GET /api/admin/storage-health` — whether the last save succeeded, and when (admin)

#### Elections (all admin)
- `GET /api/election-runs/current` — the election in progress, if any
- `GET /api/election-runs` — every election, newest first
- `POST /api/election-runs/start` — Start the Voting Process
- `POST /api/election-runs/close` — End of Voting
- `GET /api/election-runs/:id/record` — the Election Record: the election, its
  results and booths (live while running), and its log (optional `branch`)
- `GET /api/election-runs/log/search` — search the Activity Log

#### Poll
- `GET /api/poll` — poll status (public)
- `POST /api/poll/set-type` — choose School/House (wizard step 1) (admin)
- `POST /api/poll/open` / `close` — open / pause polling (admin)
- `POST /api/poll/reset` — maintenance only; no button in the app, and refused
  while an election is in progress (admin)

#### Kiosk & Voting
- `POST /api/kiosk/activate` — unlock a ballot with an officer code; a correct
  code also marks the officer ready (even before voting opens, when it answers
  `READY_POLL_NOT_OPEN`)
- `POST /api/kiosk/deactivate` — end a ballot session
- `POST /api/kiosk/close-booth` — officer closes their own code
- `POST /api/votes` — submit a vote (requires the kiosk session token; refused
  for a sealed or re-polled booth)

#### Candidates & Results
- `GET /api/posts` — posts + candidates for the active election (optional
  `house`, `branch`) (public)
- `POST /api/candidates` / `PUT /api/candidates/:id` / `DELETE /api/candidates/:id`
  — admin; refused while an election is in progress
- `GET /api/results` — tallies (optional `house`, `branch`, `electionType`) —
  currently public, see Known Issues

#### Polling Officer Codes (all admin)
- `GET /api/officer-codes` — list codes with live (counted) vote counts, phone
  numbers and duty marks (sent / ready / sealed / re-poll)
- `POST /api/officer-codes/generate` — generate `count` new codes
- `POST /api/officer-codes/bulk-allot` — create and name codes from a teacher
  list, saving each teacher's WhatsApp number
- `PUT /api/officer-codes/:code` — set an officer's name and/or WhatsApp number
- `POST /api/officer-codes/mark-sent` — tick (or with `sent: false`, undo) codes
  as sent on WhatsApp
- `POST /api/officer-codes/fresh-duties` — Reset Colours to White
  (`electionType`); refused while that election is running
- `POST /api/officer-codes/remove-all` — Remove All Codes of one election, both
  branches (`electionType`); refused while that election is running
- `GET /api/officer-codes/:code/vote-breakdown` — what a booth's votes gave each
  candidate (shown before a re-poll is confirmed)
- `POST /api/officer-codes/:code/close` / `reopen` — reopen refused for a sealed
  or re-polled code
- `POST /api/officer-codes/:code/seal` — Verify & Seal (`paperListCount`);
  refused unless the booth is closed and the count matches
- `POST /api/officer-codes/:code/repoll` — Order Re-poll (`reason`, `note`,
  optional `officerName`/`phone` for a different teacher); saves the per-candidate
  breakdown and returns the fresh code
- `DELETE /api/officer-codes/:code` — while that election is running, only if no
  votes were cast under it and it isn't sealed or part of a re-poll; otherwise
  always (a re-polled code's cancelled votes are removed with it)

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

*Last updated: 2026-10-09 — adds the Election Record, plain-sentence Activity
Log, re-poll breakdowns, Remove All Codes, deleting codes between elections, and
the redesigned Polling Officer Codes tab.*
