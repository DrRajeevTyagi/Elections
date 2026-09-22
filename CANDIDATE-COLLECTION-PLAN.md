# Candidate Collection & Bulk Import Plan

Status: **Deferred — out of scope for year 1 (2026-09-22 decision).** Being
the first year running this app, the Election Commissioner scoped year 1 down
to what can be delivered solidly: no candidate photos this year, and no
Google Form / bulk import — all ~174 candidates' names entered manually
through the existing Manage Candidates screen, branch by branch. Manual entry
of names alone (no photos) never comes close to Firestore's document-size
ceiling (measured at ~91 bytes per photo-free candidate — see
[ELECTION-INTEGRITY-AND-TRUST.md](ELECTION-INTEGRITY-AND-TRUST.md) item 12),
so nothing in this document is a year-1 blocker. Revisit this plan for a
future year once photos and/or bulk import are actually wanted. Everything
below is preserved as-is for that future conversation, not being acted on now.

**Sequencing:** see [ROADMAP.md](ROADMAP.md) for how this plan combines with
[MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) and
[ELECTION-INTEGRITY-AND-TRUST.md](ELECTION-INTEGRITY-AND-TRUST.md). The photo
Cloud Storage migration below is now Phase 5, step 1 — done immediately before
bulk import itself, not earlier — since, unlike the votes/branch work in
Phase 0, it needs a bucket that doesn't exist yet and isn't blocking anything
in between (see ROADMAP.md's "Correction" note under Phase 0 for why this
moved). The "Suggested build order" section later in this document is
superseded by ROADMAP.md.

## The ask

Two branches (Dwarka, AN — see [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md))
× 29 posts each = 58 posts, at roughly 3 candidates per post = **~174 candidates
total**, each needing a name and a photo. That's too many to hand-enter one at a
time through the current Manage Candidates screen without it being slow and
error-prone. The plan: collect submissions from both schools via an external
form, review them, then **bulk-import** the reviewed data into the app in one
action per branch instead of manual one-by-one entry.

## Why this is bigger than "add a form" — read this first

**The current photo-storage design cannot hold this volume, at all, full stop.**

- Candidate photos are stored as inline base64 data URLs, written directly into
  the one Firestore document (`school-election/state`) that holds the *entire*
  election state — candidates, votes, officer codes, archives, all of it (see
  [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) and
  [datastore.ts](backend/src/storage/datastore.ts)). Each photo is capped at
  `MAX_IMAGE_DATA_URL_LENGTH = 60_000` characters
  ([candidates.ts:24-27](backend/src/routes/candidates.ts#L24-L27)) — a limit
  clearly sized for a handful of candidates, not 174.
- Firestore enforces a **hard 1 MiB (1,048,576 byte) limit per document**, no
  exceptions. 174 candidates at up to 60,000 characters each is up to ~10.4
  million characters of photo data alone — roughly **10x over the limit**, before
  counting votes, officer codes, or anything else sharing that same document.
- Because *everything* lives in that one document, this isn't a "candidate
  photos stop working" failure — once the document is full, **every write to
  the datastore starts failing**, including vote persistence. The app's own
  Storage Health indicator ([ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md)) would
  catch this (writes fail loudly, not silently — see
  [ELECTION-INTEGRITY-AND-TRUST.md](ELECTION-INTEGRITY-AND-TRUST.md) item 2 for
  why loud failure matters), but discovering this because votes stopped saving
  on election day would be far too late.

**The fix:** move candidate photos out of the Firestore document entirely, into
a Cloud Storage bucket (in the same `school-election-rt2026` GCP project — see
[DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)), and store only the resulting HTTPS
URL in `Candidate.imageUrl` instead of the raw base64 data. This is a contained,
well-understood change — it touches candidate add/edit and the new bulk-import
path, not the rest of the data model. Doing this *as part of* bulk-import work is
the efficient order: building bulk-import against today's inline-base64 storage
would just make the size problem worse, faster.

## Decisions made (2026-09-22)

1. **Intake via an external form**, not a custom form built into the app —
   Google Forms (or equivalent) already handles file uploads and needs no
   engineering to stand up. Sent to each branch's coordinator, forwarded to
   house/post in-charges, one submission per candidate.
2. **Bulk import into the app**, not one-by-one manual entry — a new admin
   feature takes the reviewed submissions and creates all of a branch's
   candidates in one action, rather than ~174 individual form fills in the
   existing UI.
3. **Photo storage moves to Cloud Storage** as part of this work (see above) —
   not deferred to "later," since bulk-importing photos is exactly what would
   expose the current ceiling.

## What needs to change

### 1. Photo storage (backend)
- Add a Cloud Storage bucket in the `school-election-rt2026` project.
- Candidate add/edit ([candidates.ts](backend/src/routes/candidates.ts)) and the
  new bulk-import endpoint upload photos to that bucket and store the resulting
  URL in `imageUrl`, instead of accepting/storing inline base64.
- `validateImageUrl` needs updating to accept the bucket's URL pattern instead
  of (or alongside, during a transition) `data:image/...;base64,...`.
- Decide whether to migrate Dwarka's *existing* candidate photos to the bucket
  too, for consistency, or only apply this to new imports going forward.

### 2. The intake form
- One form (or one per branch, TBD) with: branch, post, house (for house posts
  only), candidate name, photo upload.
- Response spreadsheet reviewed by an admin before anything touches the live
  app — checking spelling, duplicate posts, missing photos, and that each
  post/house combination is valid (matching the existing validation already in
  [candidates.ts](backend/src/routes/candidates.ts): correct post IDs, house
  required for house posts, etc.).

### 3. Bulk import feature (new)
- New admin-only endpoint/UI: upload the reviewed spreadsheet (CSV) plus the
  photo files, per branch.
- Validate every row against the same rules the single-candidate endpoint
  already enforces (valid post ID, valid house for house posts, election type
  match, no duplicate candidate IDs) before creating anything.
- **Needs a dry-run/preview step** — given the volume (174 rows) and that a bad
  import is tedious to unwind by hand, show what will be created and flag any
  row that fails validation *before* committing, rather than partially
  succeeding.
- Decide whether re-running the import to add/update a partial batch (e.g. 3
  posts still missing photos when the rest are ready) is supported, or each
  import is one-shot per branch.

### How this connects to the other two plans in flight
- **[MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md):**
  candidates need the `branch` field that plan already specifies adding —
  bulk import should write it once that field exists. These two pieces of work
  will need to land in a compatible order (or together).
- **[ELECTION-INTEGRITY-AND-TRUST.md](ELECTION-INTEGRITY-AND-TRUST.md) item 11:**
  if a bulk import happens *before* "Start Recording" is pressed (the normal
  case — this is exactly the kind of setup work item 11 describes as free and
  unlogged), it's unlogged, same as any other pre-election candidate edit. If a
  correction/import happens *after* a run has started, it should generate log
  entries the same way any other candidate edit would under that item's design.

## Suggested build order

1. Cloud Storage bucket + migrate photo storage on the existing single-candidate
   add/edit endpoints (the size-ceiling fix — needed regardless of the form, and
   safe to do first since it doesn't depend on anything else here).
2. Design and publish the form(s); pilot with a handful of real submissions to
   check the review workflow actually works before relying on it for all 174.
3. Build the bulk-import feature (CSV/spreadsheet + photos in, dry-run preview,
   then commit) against the now-fixed photo storage.
4. Full dry run with real Dwarka data (and placeholder/test AN data) before
   trusting it for the real candidate list, same testing discipline as
   [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) already uses elsewhere.

## Open items to nail down before coding starts

- Exact review process for the response spreadsheet — who reviews it, which
  checks are manual vs. built into the import's validation.
- Whether existing Dwarka candidate photos get migrated to Cloud Storage now or
  left as-is until they're next edited.
- One form per branch, or one form with a branch selector field — affects how
  submissions get routed/reviewed.
- Photo size/format requirements to state in the form itself, so submissions
  arrive in a shape the import can use without a separate compression step.
