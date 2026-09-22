# Combined Build Roadmap

Status: **Planning — supersedes the separate "Suggested build order" /
"Suggested build order" sections in the three plan documents below as the
authoritative sequencing.** Written 2026-09-22 once it became clear the three
plans in flight can't be sequenced independently without redoing work.

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

Per [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) section 3:
Manage Candidates as its own tab with Dwarka/AN sub-tabs, Live Results branch
sub-tabs, Officer Codes tab branch grouping and a branch selector on
generation, Election History branch grouping, report pages take a branch
selector.

## Phase 3 — "Start Recording" + the audit log (trust items 11 and 5, built together)

Now naturally follows the "collections, not array fields" pattern Phase 0
already established for votes — the audit log is built the same way from day
one (its own Firestore collection, append-only security rule, one document per
logged action) rather than needing a later migration. The `ElectionRun` record
itself stays `electionType + start marker`, not branch-scoped, per the earlier
decision that one recording always covers both branches together.

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
