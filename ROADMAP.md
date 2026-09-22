# Combined Build Roadmap

Status: **In progress — supersedes the separate "Suggested build order" /
"Suggested build order" sections in the three plan documents below as the
authoritative sequencing.** Written 2026-09-22 once it became clear the three
plans in flight can't be sequenced independently without redoing work.

## Current status (read this first)

As of 2026-09-22, all committed and deployed to production (`main` auto-deploys
to Cloud Run):

- **Phase 0 is essentially done.** Votes moved off the single Firestore
  document into their own subcollection (closes the measured 59-107%-of-ceiling
  risk); the `Branch` type exists everywhere; officer codes, kiosk sessions,
  vote recording, and candidate creation are all branch-aware. A real bug in
  this pass — the actual ballot (`GET /posts`) and vote validation weren't
  filtering by branch, so an AN ballot could show/accept Dwarka candidates —
  was found by the Election Commissioner in live testing and fixed (see the
  "Bug found and fixed in real use" note under Phase 0 below). Two pieces
  remain deliberately deferred (Open Poll's coverage gate, per-branch
  archiving) until AN actually has real data — see Phase 0 for why.
- **Phase 2 (multi-branch frontend) is partially done**, ahead of its
  originally planned position, because the Election Commissioner needed to
  start entering AN's candidates for real. Done: a shared Dwarka/AN branch
  toggle on Manage Candidates, Live Results, and Polling Officer Codes (add
  candidates, generate codes, and view results scoped to whichever branch is
  selected). Not done: Election History branch grouping, report pages taking a
  branch selector. See Phase 2 below for the exact breakdown.
- **Extra, outside the original three plans:** Live Results now shows a
  "Total votes for this post" line under every post's candidates (the actual
  ballot count for that specific post — within one house, all three posts'
  totals should always agree, which doubles as a consistency check), and the
  House Elections header total is relabeled "Total Ballots (all 8 houses
  combined)" instead of looking like a per-house figure. Requested directly,
  2026-09-22.
- **Two officer-code integrity rules from item 3 were closed out just before
  Phase 3 started (2026-09-22), at the Election Commissioner's explicit
  request:** (1) a code with a blank `officerName` can no longer activate a
  kiosk — `POST /kiosk/activate` now rejects it outright; (2) `DELETE
  /officer-codes/:code` now enforces the full stricter rule already agreed in
  item 3 — a code can only be deleted if it was *never* named (tracked via a
  new permanent `everNamed` flag, since `officerName` alone can't tell "never
  named" apart from "named, then cleared") **and** has zero votes. Both are
  covered by regression tests. See ELECTION-INTEGRITY-AND-TRUST.md item 3 for
  the full account.
- **Two more pieces, requested the same session, needed for the actual
  real-world handout-codes-to-teachers workflow (2026-09-22):**
  1. **Printable per-branch code-allotment roster.** A new page
     (`OfficerCodesPrintPage.tsx`, route `/admin/report/officer-codes/:branch`)
     lists every code and its allotted teacher name, grouped by house/school
     post, for exactly one branch at a time — reachable via a "Print Dwarka/AN
     Code List" button on the Polling Officer Codes tab (follows the
     selected-branch toggle). This is the document meant to be handed to each
     branch's Election Head/Principal for distributing codes to teachers; it
     deliberately omits vote counts (that's the separate Turnout report) and
     flags any not-yet-allotted code in red so gaps are caught before
     printing. Resolves the open item in MULTI-BRANCH-EXPANSION-PLAN.md about
     a branch-aware letterhead — for *this* page only; ReportPage/
     TurnoutReportPage still hardcode "Mount Carmel School" regardless of
     branch (still open, tracked under Phase 2's "report pages branch
     selector").
  2. **Officer code alphabet switched to lowercase.** Codes are easier to
     type on a phone keyboard (which defaults to lowercase) than one that
     visually reads as needing capitals. Still excludes the same
     easily-confused characters (now `i`, `l`, `o`, `0`, `1`). Matching is
     case-insensitive everywhere a code is looked up (`datastore.ts`'s
     `codesMatch`), specifically so codes generated before this change
     (stored uppercase) keep working exactly as before, and so an officer
     typing a code in either case is never rejected on a technicality.
     `generateUniqueCodes` also compares case-insensitively now, so a new
     lowercase code can never collide with an old uppercase one merely by
     case. Covered by new tests in `officerCode.test.ts` and
     `datastore.test.ts`.
- **Phase 3 — "Start Recording" + the audit log — done (2026-09-23).** The
  `ElectionRun`/`LogEntry` model, the Dashboard "Recording" section (Start/
  Close Recording), officer-code generation gated on a matching active run,
  and a new "Activity Log" tab are all built, tested, and verified end-to-end
  with a real browser run. See Phase 3 below for the exact scope, the one
  correction to the original design (a Firestore security rule can't
  actually enforce append-only against this app's own Admin-SDK access —
  the real guarantee is that no update/delete code path exists at all), and
  what's deliberately deferred (candidate-change logging, hard-gating Open
  Poll on an active run).
- **"Ask your data" log search — done (2026-09-23), same-day follow-up to
  Phase 3.** The Election Commissioner's own framing: reading the raw log
  top-to-bottom is impractical and "no one will use it," so a search/filter
  UI was built directly into the Activity Log tab instead of a chatbot (an
  LLM-based "ask a question" interface was considered and explicitly
  rejected — see the discussion right after Phase 3's "Next" note below for
  why). `GET /election-runs/log/search` filters the log by run, election
  type, branch, actor, action, or code (all substring/case-insensitive,
  combine with AND); `LogEntry` gained first-class `electionType`/`branch`
  fields so this doesn't need to cross-reference other collections. A
  one-click "Who were the polling officers?" button answers that exact
  question from the Election Commissioner's original request; pasting a
  code answers "what happened under this code"; Election Type + Branch +
  "Admin actions only" together answer "what did the admin account do for
  School/House Elections, Dwarka/AN." Verified end-to-end with a real
  browser run.
- **Next:** no explicit direction given yet for what comes after this.
  Candidate-change logging (Phase 3's own fast-follow) or Phase 1's
  remaining items (session/device labeling, named admin credentials) are
  the most natural next steps — see "Bandwidth notes" below.

### Why a search UI instead of a chatbot

The Election Commissioner asked directly whether the log should be exposed
through a natural-language "ask your data" chatbot (an LLM answering
questions like "who were the polling officers for AN House Elections").
Recommendation given, and agreed: **build structured filtering first, not an
LLM chatbot** —
- Every example question asked ("who held code X," "activity for a code,"
  "superadmin's actions for School/AN") is a structured lookup by a small,
  fixed set of dimensions (run, election type, branch, actor, action, code),
  not something that needs open-ended reasoning.
- A chatbot wired to an LLM adds an external API dependency, per-query cost,
  latency, and — the decisive concern for a trust/audit tool — real
  hallucination risk. A wrong answer about "who did what" is exactly the
  failure this log exists to prevent; a filter UI's answers are always
  literally the underlying data, nothing more.
- The structured version was also simply faster and cheaper to build and
  ships with zero new infrastructure or ongoing cost.
A natural-language layer on top of this same search endpoint remains a
possible future addition if the structured UI turns out not to be enough in
practice — not ruled out, just not built first.

This project currently has three plans, each with its own document:

- [ELECTION-INTEGRITY-AND-TRUST.md](ELECTION-INTEGRITY-AND-TRUST.md) — manipulation
  resistance: session control, officer-code integrity, the audit log, booth
  reconciliation, and (item 12) the Firestore document-size ceiling.
- [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) — running
  Dwarka and AN together, adding a `branch` field throughout.
- [CANDIDATE-COLLECTION-PLAN.md](CANDIDATE-COLLECTION-PLAN.md) — collecting and
  bulk-importing ~174 candidates' names/photos across both branches.

## Why these can't be sequenced independently

All three converge on the exact same files: `backend/src/types/election.ts`,
`backend/src/storage/datastore.ts`, and most of `backend/src/routes/`. Two
concrete collisions:

1. **Multi-branch wants to add a `branch` field to `StoredVote`. Trust item 12
   wants to move votes off the array-in-one-document model entirely, into
   their own Firestore collection**, because at the school's actual scale
   (3,000+ students voting twice) live votes alone were measured at 59-107% of
   Firestore's 1 MiB per-document ceiling — a near-certain failure, not a
   theoretical one (see item 12's numbers). Adding `branch` to the *old* vote
   storage first, then migrating storage second, means writing the branch-aware
   version of code that's about to be thrown away. These need to happen as
   **one combined change**, not two sequential ones.
**Correction (after Phase 0's first slice landed):** the candidate-photos side
of this originally looked like the same kind of collision as votes, and got
bundled into Phase 0 on that basis. On reflection that was overstated: `branch`
on `Candidate` is just an additive, optional field, harmless to have added
regardless of when photo storage changes — there's no rework risk in doing
these separately, unlike votes. The Cloud Storage migration is now deferred to
sit **immediately before Phase 5** (bulk import) instead, for three separate
reasons: it needs a bucket that doesn't exist yet (unlike Firestore
subcollections, which need no setup step); nothing before Phase 5 actually
requires it; and today's ordinary one-at-a-time candidate entry, at current
scale, doesn't come near the size ceiling that only bulk-loading 174 photos at
once would trigger. See "Phase 5" below.

So the real first phase of work isn't "start multi-branch" or "fix the size
ceiling" as separate efforts — it's the votes/branch restructuring pass that
does both together, once, correctly. Everything else in all three plans builds
cleanly on top of it afterward instead of needing rework.

## Phase 0 — Foundational data-model & storage restructuring (do first, blocks everything below)

**Done:**
- Added the `Branch` type (`'dwarka' | 'AN'`) and a `branch` field to
  `Candidate`, `StoredVote`, `OfficerCode`, and `ElectionArchive` — optional,
  defaulting to `'dwarka'` for any existing record that predates it (same
  backfill pattern already used for legacy officer codes missing
  `electionType`).
- **Votes moved to their own Firestore subcollection** — one small document
  per vote, never an array on the shared document. `dataStore.addVote`/
  `getVotes`/`resetVotes`/`resetVotesByType`/`countVotesByOfficerCode` all keep
  their exact original signatures and in-memory synchronous behavior (existing
  callers, including `resultsService.ts` and every existing test, needed zero
  changes). Any legacy inline votes on the main document are migrated into the
  subcollection (and cleared off the main document) automatically on first
  load; if any legacy record fails validation, startup now refuses to
  continue instead of silently discarding it (closes the item 2 gap for this
  specific path). Reset/switch-type deletions are batched to stay under
  Firestore's 500-op batch limit. Covered by 8 new tests in
  [datastore.test.ts](backend/src/storage/datastore.test.ts) against a
  simulated Firestore (migration, loud failure on malformed data, branch
  defaulting/override, reset behavior, and restart-survives). Backend
  typecheck, full test suite (27/27), and build all pass; frontend confirmed
  unaffected.

**Done (backend branch-wiring):**
- Officer code generation (`routes/officerCodes.ts`), kiosk activation
  (`routes/kiosk.ts` → `kioskService` → `routes/votes.ts` → `voteService`),
  and candidate creation (`routes/candidates.ts`) all now accept and validate
  an optional `branch`, defaulting to `'dwarka'` when omitted — so a code
  generated for AN, activated at a kiosk, produces votes correctly tagged
  `'AN'` end to end. Verified with a new test in
  [kiosk.test.ts](backend/src/routes/kiosk.test.ts) asserting the branch
  survives the full activation response, plus the full existing suite (28/28
  passing), a clean typecheck, and a clean build on both frontend and backend.
- `candidateService` (`listCandidates`/`listCandidatesByPost`/
  `listCandidatesForActiveElection`) and `resultsService`
  (`getResults`/`getTotalVotes`, plus the public `/results` route) all gained
  an optional `branch` filter parameter — purely additive, every existing call
  site still omits it and behaves exactly as before.

**Deliberately deferred, not forgotten — two specific pieces carry real
regression risk for this year's live Dwarka election if turned on before AN
actually has data:**
- `candidateService.findMissingCandidateCoverage` gained an optional `branch`
  parameter, but `routes/poll.ts`'s Open Poll gate does **not** pass it yet.
  Since Open Poll is shared across both branches (a locked decision in
  MULTI-BRANCH-EXPANSION-PLAN.md), making that gate check *both* branches
  before AN has any candidates entered would block Dwarka's real election from
  opening at all. Wire this once AN's candidates actually exist.
- `buildElectionSnapshot`/`archiveCurrentElection` still produce one snapshot
  for the whole active election type, not one per branch yet. Splitting this
  now, before AN has real data, would litter Election History with an empty
  'AN' archive on every single Dwarka reset. Split this once AN is populated.

**Still open in Phase 0:** `routes/report.ts` doesn't take a branch parameter
yet (needed once turnout reports should be per-branch) — lower urgency than
the two items above since it carries no regression risk either way.

**Bug found and fixed in real use (2026-09-22):** the first branch-wiring pass
above missed the actual ballot itself. `GET /posts` (which builds the list of
candidates a voter sees) and `routes/votes.ts`'s vote validation were never
updated to filter by branch, even though officer codes/kiosk sessions/vote
records already carried it correctly. Reported directly by the Election
Commissioner: an AN Satya House code showed all 6 Satya HC candidates (3
Dwarka + 3 AN) instead of just AN's 3. Worse than display-only — a voter
could have submitted a Dwarka candidate's id on a ballot whose vote record
gets tagged 'AN' from the session, corrupting both branches' results with an
internally inconsistent vote. Fixed at the real trust boundary
(`validateVote` now filters by the session's server-derived branch, not
client input) with `GET /posts` filtering the same way so the ballot matches
what will actually be accepted; covered by
[votes.test.ts](backend/src/routes/votes.test.ts). **Lesson for whatever
comes next in this rollout:** "branch-wiring the backend" needs to explicitly
include the read path the voter's own ballot is built from, not just
generation/activation/recording — those three all "worked" individually
while the actual candidate list voters saw was still unfiltered.

## Phase 1 — small, independent trust fixes (can run in parallel with Phase 0)

Minimal file overlap with Phase 0, so these don't need to wait:

- Item 8 (trust doc): enable scheduled Firestore backups. Pure Cloud Console
  configuration, zero code, do anytime.
- Item 1's core fixes: human-entered device/person label at login and
  takeover, active eviction banner, distinguishing a harmless second tab from a
  genuinely different session. Touches `adminAuth.ts`/`adminSessionService.ts`
  — essentially no overlap with Phase 0.
- Item 3's core fixes: require an officer name before a code can activate a
  ballot; the stricter deletion rule (never-named + zero-votes). Touches
  `officerCodes.ts`/`kiosk.ts`, which Phase 0 also touches for branch-scoping —
  worth doing right after Phase 0's data model lands rather than fully in
  parallel, to avoid two people (or two passes) editing the same functions at
  once.

## Phase 2 — Multi-branch frontend (depends on Phase 0's backend branch support)

Pulled forward out of its original order because the Election Commissioner
needed to start entering AN's candidates for real, not wait for Phase 3/4.

**Done:**
- A shared Dwarka/AN branch toggle (`renderBranchToggle` helper in
  [AdminLandingPage.tsx](frontend/src/pages/AdminLandingPage.tsx)), present on
  Manage Candidates, Live Results, and Polling Officer Codes — one shared
  `selectedBranch` state drives all three, not independent per-tab state.
  Deliberately kept outside the fullscreen ref on Live Results so it never
  shows up on a projector.
- Manage Candidates: add/view candidates scoped to the selected branch.
- Live Results: results filtered to the selected branch (shares the same
  fetch as Manage Candidates).
- Polling Officer Codes: generation and the codes list both scoped to the
  selected branch, so Dwarka's and AN's codes don't mix in the same table.
- All verified with real headless-browser runs against local dev servers
  (not just typecheck/build) — see commit history for what each run checked.

**Not done yet:**
- Election History branch grouping.
- Report pages (`routes/report.ts`, `TurnoutReportPage.tsx`, etc.) taking a
  branch selector — `routes/report.ts` still doesn't accept a `branch`
  parameter at all (see Phase 0's "still open" note).

## Phase 3 — "Start Recording" + the audit log (trust items 11 and 5, built together) — DONE

Built and deployed 2026-09-23, following a clarifying-questions pass with the
Election Commissioner beforehand (see the four decisions below marked
"2026-09-23").

Follows the "collections, not array fields" pattern Phase 0 already
established for votes — `electionRuns` and `actionLog` are their own
Firestore subcollections under `school-election/state`, exactly like `votes`
(disk mode keeps them on the main document, same as before). The
`ElectionRun` record stays `electionType + start marker`, not branch-scoped,
per the earlier decision that one recording always covers both branches
together.

What's built, matching the design recap from before implementation:

- **The run boundary:** "Start Recording" (`POST /election-runs/start`) asks
  for an election type and a name, then atomically resets votes and officer
  codes to zero for that type (both branches), and creates the run. Nothing
  is logged before this point — normal setup work stays free and unlogged, by
  design.
- **One shared recording across both branches** — confirmed, one run/one log
  covers both Dwarka and AN together, matching Open Poll's own shared state.
- **Officer code generation gated on a matching active run** — `POST
  /officer-codes/generate` now requires `dataStore.getCurrentRun()` to exist
  and match the code's `electionType`; codes are tagged with `runId`.
  Generation stays scoped per branch (via the existing `branch` param) *and*
  per type (via the run), so the four Dwarka/AN × School/House combinations
  still work independently within one recording.
- **The log itself:** its own Firestore subcollection, one document per
  action (`admin.session.claim`/`takeover`, `poll.open`/`close`/`reset`,
  `officerCode.generate`/`name`/`reopen`/`delete`/`close`,
  `archive.create`/`rename`/`delete`, `run.start`/`close`), with `logAction`
  silently no-op-ing whenever no run is active. No update/delete method for
  log entries exists anywhere in `datastore.ts` — verified by a test that
  asserts those methods don't exist. A new "Activity Log" dashboard tab shows
  entries for any run (current or past), with takeovers and the legacy Reset
  Poll button (used while a recording is active) flagged in red as
  trust-relevant.
- **(2026-09-23) Existing production data was only test/dummy codes**,
  confirmed with the Election Commissioner before building — so the reset-to-
  zero behavior above needed no migration/grandfathering path.
- **(2026-09-23) Open Poll deliberately left ungated.** Generation is gated on
  an active run, but `POST /poll/open` is not — lower regression risk to this
  year's live election. Can be hardened into a hard gate later once Start
  Recording has been used successfully across a few real runs.
- **(2026-09-23) "Close Recording" is a new, separate action, not a
  replacement for Reset Poll.** `POST /election-runs/close` archives under the
  run's name (reusing `archiveCurrentElection`), resets votes/codes for that
  run's type, closes the poll, and seals the run — while the existing Reset
  Poll button keeps its exact prior behavior, zero change, for ad-hoc
  corrections with no run active. Reset Poll is still logged if used while a
  run happens to be active, specifically to catch that bypass.
- **(2026-09-23) Candidate-change logging deferred as a fast-follow**, not
  included in this pass.
- **One addition beyond the original design:** login now optionally captures
  a short human-entered label ("Rajeev -- laptop"), pulled forward from trust
  item 1, so log entries say a real name instead of an anonymous session id.
- **One correction to the original design**, made during implementation: a
  Firestore security rule cannot actually enforce append-only against this
  app's own writes — Security Rules only govern client-SDK/REST access under
  Firebase Auth, not the server-side Admin SDK this backend uses exclusively,
  nor Cloud Console/`gcloud` access (both governed by IAM instead). No rules
  file was added; the actual guarantee is the missing update/delete code path
  described above. See ELECTION-INTEGRITY-AND-TRUST.md item 5 for the full
  explanation. Item 8 (independent backup) remains the only thing that would
  actually catch tampering via direct GCP access, and is still unbuilt.

Verified end-to-end with a real browser run (not just unit tests): generation
correctly blocked with no active run and correctly gated to the matching
type once one starts; the Activity Log tab shows entries with the actor
label attached; closing seals the run and produces a correctly-named
Election History entry.

## Phase 4 — builds on an active recording

- Item 4: presiding-officer booth reconciliation screen.
- Item 6 (lightweight): typed confirmation phrase for vote-affecting
  irreversible actions.
- Item 7: named admin credentials (can piggyback on Phase 1's item 1 work if
  more convenient to do together).

## Phase 5 — deferred for year 1 (2026-09-22 decision)

No candidate photos and no Google Form / bulk import this year — see
[CANDIDATE-COLLECTION-PLAN.md](CANDIDATE-COLLECTION-PLAN.md)'s updated status.
All ~174 candidates' names are entered manually, branch by branch, through the
existing Manage Candidates screen once Phase 2's branch UI exists. This phase
is preserved for a future year, not scheduled now.

## Phase 6 — needs a full run cycle to exist

Item 10: the signed final results slip. Design what goes on it once a real run
has gone through Phases 3-4 end to end at least once.

## Deferred

Item 9 (trust doc): the tamper-evident hash chain — lower priority than the
append-only Firestore rule already covering most of the same threat.

## Bandwidth notes

Phase 0 is the hard bottleneck — it's the largest single piece of work and
almost everything else either depends on it directly (Phase 2, 3, 5) or is
cheaper to do right after it lands than fully in parallel (Phase 1's item 3).
Only item 8 (a Cloud Console setting) and item 1's core fixes are genuinely
independent of it. Given that, the practical order is: **Phase 0 first,
essentially exclusively, then everything else opens up** — trying to run
Phase 0 alongside Phase 2/3/5 would mean building against a data model that's
actively changing underneath.
