# Multi-Branch Expansion Plan (Dwarka + AN)

Status: **Mostly implemented and live in production.** This captures the
plan agreed on 2026-09-22; see the Progress note below for exactly what's
built versus still open (updated 2026-10-01), and [ROADMAP.md](ROADMAP.md) for
the authoritative sequencing of what's left.

**Sequencing:** see [ROADMAP.md](ROADMAP.md) for how this plan combines with
[ELECTION-INTEGRITY-AND-TRUST.md](ELECTION-INTEGRITY-AND-TRUST.md) (item 12
specifically) and [CANDIDATE-COLLECTION-PLAN.md](CANDIDATE-COLLECTION-PLAN.md).
The `branch` field addition below and item 12's votes-storage migration turned
out to be the same piece of work — ROADMAP.md's Phase 0 is the combined,
authoritative build order; the "Suggested build order" section later in this
document is superseded by it.

**Progress (updated 2026-10-01):**
- The `Branch` type and `branch` field exist on `Candidate`, `StoredVote`,
  `OfficerCode`, and `ElectionArchive`.
- **Backend (section 2, mostly done):** officer code generation and bulk allot,
  kiosk activation/session, vote recording *and validation*, candidate
  creation, results (`getResults`/`getTotalVotes`), and reports
  (`routes/report.ts`, `?branch=dwarka|AN`) all read/write/filter by branch.
  **Two pieces still deliberately not branch-aware** (see ROADMAP.md Phase 0 for
  why): Open Poll's "every post has a candidate" gate checks both branches
  together, so the poll can open with AN empty (listed as a known issue in
  FEATURES-REPORT.md); and an election is still saved as **one** archive covering
  both branches — with each branch's ballot count captured at save time — and
  narrowed to one branch when a report is read, rather than as two separate
  archives.
- **Frontend (section 3, done except one letterhead):** Manage Candidates, Live
  Results, and Polling Officer Codes all have a shared branch toggle and are
  fully functional per-branch. The Dashboard has **Download Dwarka Report /
  Download AN Report**, and every Election History entry has **View/Print
  Dwarka** and **View/Print AN**. The printable code list uses each branch's own
  letterhead; the results report says "Mount Carmel School — AN" / "— Dwarka";
  the officer turnout page still says only "Mount Carmel School" (see Open items).
  The Election Record (2026-10-09) prints "Mount Carmel School, Dwarka" /
  "Mount Carmel School, Anand Niketan" / "— Dwarka and AN".
- **Features added 2026-10-01 all respect the branch:** Send Codes on WhatsApp
  works on the selected branch's codes and names the branch in each message;
  Start Allotting Duties for a Fresh Election resets one election type in
  **both** branches at once (one election covers both); a re-poll's fresh code
  keeps the old code's branch and house; Verify & Seal is per booth, and End of
  Voting waits for every code **in both branches** to be deleted or sealed; the
  duty-colour summary counts the selected branch.
- **Added 2026-10-09, also branch-aware:** the redesigned Polling Officer Codes
  tab shows one election type and one branch at a time (its End of Voting
  checklist still counts both branches together); **Remove All Codes** clears
  one election type in **both** branches at once (both hold their elections
  together this year — to be revisited after this year's election if branches
  ever vote separately); the Order Re-poll window and the "Re-poll ordered"
  message name the branch, and the message shows only on that branch's tab
  (in the trial it stayed on screen after switching branch, which looked like a
  re-poll in both); Live Results' re-poll note lists only the selected branch's
  re-polls; the **Election Record** can be viewed for Dwarka, AN or both, and
  in the both-branches view shows each branch's results separately (each
  elects its own winners) — never one combined list.
- **A real bug shipped and was fixed in this rollout:** the first backend
  branch-wiring pass missed the actual ballot (`GET /posts`) and vote
  validation, so an AN ballot could show and accept Dwarka candidates. Caught
  by the Election Commissioner in live testing, fixed at the vote-validation
  trust boundary, covered by a regression test. See ROADMAP.md Phase 0 for
  the full account — worth reading before touching this area again.

## Naming convention — read this first

The Anand Niketan branch is referred to and coded throughout this project as **"AN," always in capitals** — never spelled out as "Anand Niketan," never shortened to just "Anand," and never written lowercase as "an." This is deliberate, for two separate reasons: (1) one of the 8 house names is "Anand" (Anand House), and "Anand Niketan"/"Anand" alone would be misread as referring to the house instead of the branch; (2) lowercase "an" is an ordinary English word, so it would be easy to misread in code, logs, or prose (e.g. "generate an code" vs. "generate AN code"). Capital "AN" avoids both collisions.

This applies everywhere: the `Branch` type/values in code (`'dwarka' | 'AN'`), UI tab labels ("Dwarka" / "AN"), variable and file names, and all future documentation. Dwarka's name is unambiguous and needs no shortening.

## The ask

Run elections for both school branches — Dwarka and AN — through this one app, on the same day and at the same time, instead of Dwarka-only as today. A polling-officer code should already know which branch it belongs to (as it already knows School vs House today), and show that branch's candidates automatically. Admin needs: a standalone "Manage Candidates" tab with Dwarka/AN sub-tabs, a branch split on "Live Results," per-branch reports, and a separate code set per branch.

## Why this is bigger than adding tabs

The current app is built around a single, global election, not two running in parallel:

- **One global poll switch.** `PollState` ([backend/src/types/election.ts:54-57](backend/src/types/election.ts#L54-L57)) holds one `activeElectionType` and one `isOpen` flag for the *whole app*. Every kiosk activation ([backend/src/routes/kiosk.ts:32-52](backend/src/routes/kiosk.ts#L32-L52)) checks against that single shared state. There is no per-branch open/close today.
- **No branch dimension anywhere in the data.** `Candidate`, `StoredVote`, `OfficerCode`, and `ElectionArchive` ([backend/src/types/election.ts:14-84](backend/src/types/election.ts#L14-L84)) are only tagged with `electionType` and optional `house`. Adding branch sub-*tabs* to the UI without adding a `branch` field underneath would silently merge Dwarka's and AN's votes into the same tally — defeating the entire point.
- **One admin session, system-wide.** [backend/src/middleware/adminAuth.ts:34-48](backend/src/middleware/adminAuth.ts#L34-L48) only lets one terminal hold the admin console at a time. *(At the time of writing, a second login kicked the first one out; since 2026-10-01 the second device can only ask for control, and the device in control must allow it — see ELECTION-INTEGRITY-AND-TRUST.md item 1. Either way, one session runs both branches, per decision 2 below.)*

## Decisions made (2026-09-22, reconfirmed explicitly 2026-09-23)

These three choices set the scope of the change and are locked in, not just defaults:

1. **Poll Controls stay shared, not per-branch.** Both branches vote for the same election type, start voting at the same moment, and stop voting at the same moment — one Open Poll click opens both branches at once, one Close Poll click closes both branches at once. One Election Type selector and one Open/Close switch continue to govern both branches together, exactly as today — we do **not** build two independent poll state-machines, and there is no scenario where one branch is open while the other is closed.
2. **There is exactly one superadmin, for both branches together.** One coordinator (you) runs both branches from a single login/session. We do **not** need branch-scoped admin secrets, and there is no case where two people are logged in managing one branch each.
3. **Houses and school posts are identical across both branches.** AN uses the exact same 8 house names (Anand, Dhiraj, Kripa, Prem, Namrata, Nishtha, Satya, Shanti) and the exact same 5 school posts (HB, HG, SSC, SRC, SCC) as Dwarka — only the *candidates* standing for each post/house differ per branch. `HOUSE_IDS` and the post-ID lists stay global constants, shared by both branches; nothing about the houses or posts themselves becomes branch-specific.

Together, these keep the change scoped to **adding `branch` as a data field and an extra filter dimension**, rather than duplicating the poll/session machinery. That's the smaller, safer version of this project.

Reminder: always **"AN"** in capitals, never lowercase "an."

Note: Anand House exists in both branches' house list (every branch has its own "Anand House"). Since the branch is coded and labeled as "AN" everywhere per the naming convention above, this no longer risks confusion — but a one-line callout in the admin UI copy is still worthwhile so a reader unfamiliar with the shorthand doesn't wonder why "AN" and "Anand" both appear.

## What needs to change

### 1. Data model (backend/src/types/election.ts)
Add a `Branch` type — `'dwarka' | 'AN'` (capital "AN," per the naming convention above) — and a `branch` field to:
- `Candidate`
- `StoredVote`
- `OfficerCode`
- `ElectionArchive`

Existing data in Firestore has no `branch` field. On load, default any record missing it to `'dwarka'` (the only branch that has ever existed) — same pattern already used for legacy officer codes missing `electionType` in `normalizeOfficerCode` ([backend/src/storage/datastore.ts:80-91](backend/src/storage/datastore.ts#L80-L91)).

### 2. Backend services/routes
- `candidateService.findMissingCandidateCoverage` — since Open Poll is shared, it must check candidate coverage for **both** branches before allowing Open Poll; a branch left with an empty post would otherwise strand a voter there.
- `resultsService.getResults` / `getTotalVotes` / `buildElectionSnapshot` ([backend/src/services/resultsService.ts](backend/src/services/resultsService.ts)) — add `branch` as a filter alongside `electionType`/`house`, so tallies, "Total Votes," and archived snapshots are per-branch, not combined.
- `archiveCurrentElection` / `ElectionArchive` — one archive per branch per election (a Reset while both branches have votes should produce two history entries, one per branch, not one blended entry).
- `routes/kiosk.ts` `activate` — `officerCode.branch` flows into the kiosk session, the same way `officerCode.house` already does, so the voting screen knows the branch without asking the voter or officer.
- `routes/officerCodes.ts` generation — accepts and stores `branch`; code uniqueness can stay global (simplest, avoids two branches ever issuing the same code).
- `routes/report.ts` / turnout report — needs a `branch` parameter so each printed report is single-branch, per your point (c).

### 3. Frontend
- **Manage Candidates** — becomes its own top-level tab (out of the Dashboard grid), with Dwarka / AN sub-tabs, each showing the same post/house structure as today. `AddCandidateForm` and `CandidateEditor` need a `branch` prop threaded through.
- **Results Overview vs. Live Results** — these two already show near-duplicate content today (compare the "Results Overview" panel in the Dashboard tab against the "Live Results" tab in [AdminLandingPage.tsx](frontend/src/pages/AdminLandingPage.tsx)). Recommend **dropping "Results Overview" from the Dashboard tab** rather than keeping it — once Manage Candidates also moves out, Dashboard becomes a clean, single-purpose Poll Controls tab. Add Dwarka / AN sub-tabs to the existing **Live Results** tab instead of building a second results view.
- **Polling Officer Codes tab** — add a branch selector to code generation (for both School and House code generation), and a branch grouping above the existing per-house grouping in the codes table.
- **Election History tab** — not explicitly asked for, but needed for the same reason as results: archives need a branch dimension, and the tab should group/filter by branch so Dwarka's and AN's saved elections don't end up in one mixed list.
- **VotePage / kiosk flow** — filters candidates by branch (from the activated session) in addition to the existing electionType/house filtering, so a Dwarka code shows only Dwarka candidates and an AN code shows only AN candidates, automatically.

### What stays exactly as-is
- Single admin secret, single admin session lock.
- Single shared Election Type selector and Open/Close switch on the Dashboard tab.
- Global `HOUSE_IDS` and post-ID constants (houses.ts, config/posts.ts) — no branch-specific variants needed.
- Officer code alphabet/uniqueness — unchanged, just gains a `branch` tag alongside `electionType`/`house`.

## Suggested build order

1. Data model + storage migration (`branch` field, default-to-`dwarka` backfill for existing records) — no visible behavior change yet.
2. Backend services/routes updated to accept and filter by `branch` (candidates, results, archives, kiosk activation, officer codes, reports).
3. Frontend: Manage Candidates as its own tab with branch sub-tabs; Live Results branch sub-tabs (dropping Results Overview); Codes tab branch grouping; Election History branch grouping; report pages take a branch selector.
4. Add AN's real candidate list and generate its first code set.
5. Full dry run exactly like the existing testing-round process in [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md), but with both branches' test codes active at once, before trusting it on a real polling day.

As always, each phase gets typechecked/tested/built on both frontend and backend before it's pushed to `main` — this change touches nearly every backend route file and several frontend pages, so this matters more than usual here.

## Open items to nail down before coding starts

- Whether the Manage Candidates and Live Results sub-tabs should default to remembering the last branch viewed, or always default to Dwarka.
- ~~Confirm there's nothing branch-specific about the printable report letterhead/footer (school name, address) that also needs a branch-aware template.~~
  **Resolved for the officer-code roster (2026-09-22):** AN's branch is
  "Mount Carmel School, Anand Niketan" (Dwarka stays "Mount Carmel School") —
  see `OfficerCodesPrintPage.tsx`'s `BRANCH_LETTERHEAD` map. **Partly resolved
  for reports (as of 2026-10-01):** ReportPage.tsx now takes a branch and
  prints "Mount Carmel School — AN" / "— Dwarka", but not the full "Mount Carmel
  School, Anand Niketan" letterhead; TurnoutReportPage.tsx (the live "Print
  Officer Turnout" page) still prints only "Mount Carmel School". Both should
  use the same `BRANCH_LETTERHEAD` wording as the code list. (Since 2026-10-09
  the Print Officer Turnout button is gone — the Election Record covers it —
  so only ReportPage.tsx is still reachable from a button.)
- Open Poll's candidate-coverage gate and per-branch archiving (see Progress
  above) — decide whether to make them branch-aware now that AN has real data.
