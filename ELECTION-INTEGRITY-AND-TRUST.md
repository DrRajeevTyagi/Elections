# Election Integrity: Designing Out Trust, Not Asking For It

Started 2026-09-22. Living document — add new concerns as they come up, and update
the Status line on existing ones as they get designed and built.

**Changelog:**
- 2026-09-22 (session 1): initial nine concerns captured (items 1-8 below, plus
  the "open items" list at the end).
- 2026-09-22 (session 2, same day): walked through every item in detail with the
  Election Commissioner. Several proposed fixes were corrected or sharpened based
  on how the real physical process actually works (see items 3, 4, 5 below); a
  design decision was made on how to handle irreversible/privileged actions (see
  "Decision" section after item 7); and a new concept — an explicitly started and
  closed **Election Run**, scoping officer codes and the action log to one specific
  election — was introduced (item 11). Two items from that session's chat
  (tamper-evident hash chain, signed final results slip) are recorded here for the
  first time as items 9 and 10.

## Why this document exists

The standard for this system is not "people should trust the Election Commissioner."
It's "manipulation should not be *possible*, or if it can't be made impossible, it
should be made impossible to hide." This matters in any election, but it matters
concretely here because the Election Commissioner's own child is a candidate — so
the system has to be provably neutral even to someone who has every reason to
distrust the person running it. Every control below should work even against a
fully self-interested super admin, not just against outside attackers.

Two design principles run through every item below:

1. **Prevent over detect over trust.** If an action can be made structurally
   impossible, that beats catching it after the fact, which beats "the admin
   promised not to."
2. **Every privileged action should be attributable and visible**, not just
   blocked-or-allowed. A log nobody can quietly edit is itself a control.

## Status legend

`Open` — discussed, not yet designed in detail.
`Designed` — approach agreed here, not yet built.
`Implemented` — shipped in the app.
`Won't fix` — considered and deliberately rejected, with reason.

---

## 1. Single super admin session, with visible takeover

**Concern (from discussion):** Only one person should be able to act as the
Election Commissioner at a time. If someone else tries to log in as super admin,
the real Election Commissioner should know about it.

**Current behavior in the code:** There is already a single-slot session lock
([adminSessionService.ts](backend/src/services/adminSessionService.ts)) — logging
in from a second device requires an explicit "force takeover"
(`x-admin-force: true`), which immediately evicts whoever held the slot. But the
eviction is *passive*: the person who got kicked out only finds out the next time
they click something in the dashboard and get "This admin console is no longer the
active session" ([adminAuth.ts:39-48](backend/src/middleware/adminAuth.ts#L39-L48)).
There is no active alert, no record of *when* it happened, and — most importantly —
nothing distinguishes "the real Commissioner logging in from a second device" from
"someone else who obtained the secret forcing a takeover." Both look identical to
the system today. There's also only one shared password
([adminSecret](backend/src/middleware/adminAuth.ts) — one string, checked with
`timingSafeEqual`), so the system can't tell *which* person is at the keyboard even
when it's legitimate.

**Why it's a manipulation risk:** A second person who has (or guesses, or is
handed) the admin secret can silently take control, make changes, and hand control
back — and unless the original Commissioner happens to notice the "logged out"
message and asks "wait, who did that?", it leaves no trace.

**Confirmed while investigating (session 2):** checked the frontend directly —
the per-tab id used to hold the session lock is stored in `sessionStorage`, not
`localStorage` ([api.ts:26-37](frontend/src/services/api.ts#L26-L37)), and
`sessionStorage` is scoped **per browser tab**, not per device or per browser.
This means opening a harmless *second tab* on your own laptop looks structurally
identical to the server as a stranger logging in from another device — the app
has no concept of "device" at all today, so it can't say "Shikha's phone" vs.
"your own second tab," only "some other session."

**Proposed handling:**
- Every claim/takeover of the admin slot gets a durable, append-only log entry:
  timestamp, and whatever identifying info is available (client id, IP, user-agent).
  This is a prerequisite for #5 below and should probably be built together with it.
- Give the still-open dashboard tab a way to *actively* notice eviction (poll or
  push) and show a clear banner immediately — not just fail silently on the next
  click.
- On the login screen itself, show "Admin console was last active from a different
  session at HH:MM" so a takeover is visible to the person doing it, not just the
  person losing it.
- **Require a short human-entered label at login/takeover time** — e.g. "Rajeev —
  laptop" or "Shikha — phone" — the same pattern as requiring an officer's name for
  a code (item 3). Not independently verifiable (anyone can type any label), but
  combined with the immutable log (item 5) it makes a false label just as exposed
  as a fabricated officer-code name: evidence, not a lock by itself.
- Distinguish "another tab, same browser" from "a genuinely different session" so
  a legitimate second tab doesn't trigger a false eviction of yourself.
- Longer-term: move off one shared password toward per-person credentials (even a
  simple name + shared secret pair) so the log in #5 can say *who*, not just *that
  someone* — see item 7.
- A full second-person **approval** requirement for taking over the session was
  considered and **not** adopted for now — see the "Decision" section after item 7.

**Status:** Designed; one small piece pulled forward, built, then revised
same-day (2026-09-23) as part of Phase 3's audit log (item 5): login
originally captured a short human-entered label ("Rajeev -- laptop"), but
that field was removed a few hours later after direct feedback that it was
an unwanted addition to the login screen. In its place, an automatically-
derived, silent device tag (e.g. "Chrome / Windows", from the browser's own
user-agent string, no prompt) is sent and stored on the session the same
way the human-entered label was, so action-log entries and takeover
messages still say something more readable than a raw client id -- just
without asking anyone to type it. The rest of this item -- an active
eviction banner, "last active from a different session at HH:MM" on the
login screen, and distinguishing a harmless second tab from a genuinely
different device -- is still not built.

---

## 2. Does a code deployment wipe the election?

**Concern (from discussion):** If new code is pushed to the server, is all election
data lost if nothing has been saved yet?

**Current behavior in the code:** No — election state is decoupled from the app
code. In production the app stores everything (candidates, votes, officer codes,
poll state, archived election history) in a single Firestore document, not in the
container ([datastore.ts:14](backend/src/storage/datastore.ts#L14) and
`useFirestore`/`env.dataFile` in [env.ts](backend/src/config/env.ts)). A new deploy
replaces the running code, not the Firestore document, so a normal `git push` to
`main` (which auto-deploys to Cloud Run) does not erase votes already cast.

**The real risk isn't "deploy wipes data" — it's silent partial data loss on
load.** [datastore.ts's `mergeWithDefaults`](backend/src/storage/datastore.ts#L175-L224)
validates each array (`candidates`, `votes`, `officerCodes`, `archives`) against a
shape-checking function before accepting it. If even *one* record in an array
doesn't match the expected shape — e.g. because a future code change adds/renames a
field — the **entire array** silently falls back to its empty default
(`createDefaultData()`), with no error, no warning, nothing in the logs a human
would see. A single malformed vote record could make every other vote in that array
vanish on the next restart, without anyone being told.

**Why it's a manipulation risk (and an honest-mistake risk):** This isn't
manipulation by the admin, but it's exactly the kind of thing that would make
"nobody would trust the results" true even with zero bad intent — and a
sophisticated bad actor with deploy access could exploit it deliberately by
shipping a schema change that's designed to fail validation on inconvenient votes.

**Proposed handling:**
- Change `mergeWithDefaults` to fail loudly (refuse to start / alert) instead of
  silently substituting an empty array when validation fails on a non-empty input.
  Losing one bad record is very different from silently discarding all of them.
- Add a scheduled, independent backup export (e.g. nightly Firestore export to
  Cloud Storage, or an admin-triggered "Export full backup" button) so there's a
  copy that exists outside the live document entirely — see also #8.
- Confirm and document that `main` is frozen on election day (already true per
  [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) — "One Hard Rule").

**Status:** Open.

---

## 3. Officer codes must be attributable, and unused codes must not exist

**Concern (from discussion):** The super admin could create an extra polling
officer code and use it to cast extra votes. Every unused code should be deleted
with zero record, and every issued code must carry the name of the person it was
issued to.

**Current behavior in the code (updated 2026-09-22 — see Status below):**
- Codes are generated blank: `generateOfficerCodes` creates each entry with
  `officerName: ''` and `everNamed: false` ([datastore.ts](backend/src/storage/datastore.ts)),
  and the name is only attached later via a separate `PUT /:code` call
  ([officerCodes.ts](backend/src/routes/officerCodes.ts)), which also
  permanently flips `everNamed` to `true` the first time a non-blank name is
  saved.
  **Kiosk activation now rejects a blank-named code outright** — `POST
  /kiosk/activate` ([kiosk.ts](backend/src/routes/kiosk.ts)) checks
  `officerCode.officerName.trim()` and refuses activation before checking
  anything else, in addition to its existing checks (exists, not closed,
  matches active election type).
- `DELETE /:code` ([officerCodes.ts](backend/src/routes/officerCodes.ts))
  now refuses to delete a code if `everNamed` is `true` **or** it has any
  votes — matching the stricter rule below exactly. No record of the
  deletion itself is kept yet (that's item 5's audit log, tracked as
  ROADMAP.md Phase 3).
- Votes do carry the `officerCode` they were cast under
  ([voteService/datastore StoredVote](backend/src/types/election.ts)), so votes
  *are* traceable to a station/code even after the code itself is deleted from the
  officer-codes list — the vote isn't erased, only the code-to-name mapping can be.
  That's actually good for forensics but means "delete the code" is not the same as
  "delete the evidence."

**Why it's a manipulation risk:** An admin (or anyone who reaches the dashboard)
could generate a code, use it once or twice while it has no name attached, then
delete it — leaving orphaned votes with no way to say who cast them, and no record
that the code ever existed to explain the discrepancy.

**Refined during discussion (session 2):** requiring a name on a code only has
value in combination with the no-quiet-deletion rule below — a fabricated code
with a made-up name is still just a made-up name unless it's also true that (a) it
can never be erased once used or named, so it survives as permanent evidence, and
(b) there's a pre-published, agreed list of the real polling officers (fixed
*before* the election starts — see item 11's "start the run" step) that a fake
name would visibly fail to match. The name field's real job isn't verifying
identity, it's making sure a fabricated code **can't hide**.

The Election Commissioner also specified a stricter deletion rule than originally
proposed: a code should be deletable **only** if both (a) it has never been
allotted to a polling officer (no name ever attached — not just "currently blank")
and (b) its vote count is zero. In other words: once a code has been named for a
real officer, it becomes permanent regardless of whether it was ever used to vote
— only a code that was *never named at all* can be deleted, and only while it's
also unused. This is deliberately stricter than "just check the vote count" —
it closes the gap where an admin names a code, decides not to use it, then quietly
deletes it before anyone reviews the officer list.

**Revised (2026-09-25): the stricter half of that rule (a) was dropped, by
direct request.** A named-but-unvoted code can now be deleted; the only
remaining condition is (b), zero votes. This is a deliberate loosening, not
an oversight, because how codes are actually allotted changed: a full staff
roster is loaded into the app at once, a code is generated and named for
every teacher on it, and each is sent their code over WhatsApp. It's routine
for some teachers not to report for duty — under the original rule, every one
of those codes stayed in the list forever, named and unused, indistinguishable
from the abuse case rule (a) existed to catch. The abuse case rule (a) was
guarding against ("generate a code, use it while unnamed, delete it before
anyone reviews the roster") is still fully covered by rule (b) alone, since
a code cannot cast a vote at all until it's named (see the kiosk-activation
rule above) -- a code that was ever used necessarily has a name attached and
a nonzero vote count, and stays permanent either way. What rule (a) alone
additionally caught was a named, unused code being deleted -- and every
naming and every deletion is still permanently logged regardless (item 5's
audit log, built since this section was first written), so that history is
never actually lost, only no longer forced to clutter the live list.

**Handling — implemented 2026-09-22, remaining items still open:**
- ✅ **Require a name before a code can activate a ballot.** Kiosk activation
  now rejects any code with a blank `officerName`, not just closed ones. This
  was the single highest-leverage fix here — it closes the "anonymous code"
  path entirely. Enforcing it before House and General elections start
  requires the admin to name every code first, which is a normal workflow
  step anyway (see [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) — "record
  which teacher holds which code").
- ✅ **Deletion rule (revised, then revised again 2026-09-25).** `DELETE
  /:code` originally refused unless the code had *never* had a name attached
  (tracked via the `everNamed` field, which distinguishes "never named" from
  "named, then cleared back to blank" — `officerName` alone couldn't) **and**
  `countVotesByOfficerCode(code) === 0`. Now refuses only on the vote-count
  half — see the addendum above for why. `everNamed` is still tracked, just
  no longer checked by this route.
- ⬜ Codes scoped to a specific, explicitly started election — see item 11 —
  rather than generatable "anytime, for any election," which is still
  today's behavior.
- ⬜ **Log every code generation, naming, and deletion** (who, when, count,
  election) — see #5, tracked as ROADMAP.md Phase 3.
- Surface, in the dashboard, a simple discrepancy check: total votes cast under
  officer codes vs. total votes recorded overall should always be equal — flag if
  they ever diverge (would indicate a vote with no valid code, which shouldn't be
  reachable but is worth alarming on if it ever happens).

**Status:** **Name requirement and stricter deletion rule implemented and live
in production** (2026-09-22). `POST /kiosk/activate` now rejects any code
whose `officerName` is blank, before checking anything else about the
election. `DELETE /officer-codes/:code` now refuses to delete a code if
either `everNamed` is `true` (a new field, set permanently the first time a
name is ever attached and never cleared back to `false` even if the name is
later edited back to blank) or its vote count is nonzero — matching the
stricter rule agreed above exactly, including the "named then cleared"
closing case. Both changes are covered by regression tests
(`routes/kiosk.test.ts`, `routes/officerCodes.test.ts`). Still open: the
discrepancy check (last bullet above) and logging every generation/naming/
deletion, which folds into item 5's audit log — tracked as ROADMAP.md
Phase 3. Election-run scoping is still tracked separately in item 11.

---

## 4. Electronic count must be reconciled against a signed physical count

**Concern (from discussion):** If voters are absent, the polling officer should
write the number of votes cast at that station on paper, in pen, with two
witnesses signing over it — and the electronic count for that booth must match the
physical sheet.

**Current behavior in the code:** This is currently a fully manual, off-app
process. [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) already tells polling
officers to check the running vote count shown after each vote against their
physical voter list (line: "check the running vote count shown against your
physical voter list, then tap Finish") — but this is advisory only. The app
tracks a per-code vote count (`countVotesByOfficerCode`) but has no field to record
a physical/paper count, no way to mark a booth as "reconciled," and no way to flag
a mismatch. It also explicitly supports multiple devices sharing one officer code
at once ("It's fine to speed things up by using more than one device on the same
code" — ROLLOUT-CHECKLIST.md), which is useful for throughput but means a single
code's count is a station total, not a one-device, one-person total — worth keeping
in mind when designing reconciliation (it reconciles at the *station* level, which
matches the physical sheet, which is also per-station).

**Why it's a manipulation risk:** Without a required, recorded reconciliation step,
a discrepancy between what was physically witnessed and what the system recorded
could go unnoticed, or be noticed by only one person with no independent
corroboration.

**Corrected during discussion (session 2):** the original proposal below had the
*polling officer* enter their own physical count for the app to check — the
Election Commissioner pointed out this is weaker than the real intended process,
which already has a built-in independent check: two witnesses sign the polling
officer's paper, the polling officer then carries that signed paper to a
**presiding officer** (a distinct, neutral role, not the polling officer
themselves), and it's the presiding officer who compares the signed paper against
the electronic count. The app should support *that* role, not ask the polling
officer to self-report.

**Proposed handling (revised):**
- Add a "Booth reconciliation" screen for the **presiding officer** (a role
  distinct from both the polling officer and, ideally, the Election Commissioner)
  — one row per officer code/booth, showing the app's own
  `countVotesByOfficerCode` total. The presiding officer records "compared
  against the signed physical sheet: match" or "mismatch" with a timestamp, after
  physically checking it themselves — the app never takes the physical number as
  input from the polling officer, only the presiding officer's verified
  comparison.
- On a mismatch, the record is permanent (not editable away) and the admin
  dashboard should flag it prominently — see the "big font" flagging described in
  the Decision section after item 7.
- This reconciliation record should be included in the officer turnout report
  (["Print Officer Turnout"](ROLLOUT-CHECKLIST.md)) so it's part of the same
  document the two witnesses can be shown.
- This doesn't replace the pen-and-paper witnessing (the app has no way to verify
  physical signatures) — it makes the *comparison*, done by a neutral third party,
  a recorded, structural step instead of an unrecorded habit.

**Status:** Designed.

---

## 5. No audit log of admin actions exists at all

**Concern (new — surfaced while investigating #1 and #3):** There is currently
**no audit/action log anywhere in the backend** (confirmed by search — no
audit/activity-log module exists). Nothing records who opened/closed the poll, who
generated or deleted officer codes, who added/edited/deleted candidates, who reset
votes, who renamed or deleted an Election History archive, or when admin session
takeovers happened. The only history kept is the *outcome* (current candidate list,
current officer codes, archived results) — never the *sequence of actions* that
produced it.

**Why it's a manipulation risk:** Every other item in this document (#1, #3, #4,
and more below) depends on being able to answer "who did what, when." Without a log,
even a fix that *prevents* an action (like requiring a name before a code works)
can't answer "was this ever attempted?" — and a discrepancy discovered after the
fact has no trail to investigate.

**Agreed during discussion (session 2), with a specific scope:** the Election
Commissioner confirmed this should be built, but scoped to an **election run**
(item 11), not as one continuous global log forever:
- Logging starts the moment an election run is explicitly started (item 11's
  "Start the process of School Elections for Dwarka" action) — not before.
- From that point until the run is closed and its Election History snapshot is
  generated, **every** action is logged and the log is fully immutable — no edit,
  no delete, by anyone, admin included.
- Any lapse relevant to trust (e.g. a code that was ever used while unnamed —
  which shouldn't be reachable once item 3 is built, but is exactly the kind of
  thing this log exists to catch if it ever happens; a mismatch flagged in item 4)
  should be rendered **prominently** in the dashboard — large, hard-to-miss
  styling, not a quiet line in a long table.
- When the run is closed and declared final, the log is sealed and carried into
  Election History alongside the results snapshot, as a permanent record of that
  specific election.

**Proposed handling:**
- Add an append-only action log, stored the same durable way votes are (Firestore),
  written for at least: admin session claim/takeover, poll open/close, election
  type switch, officer code generate/name/delete/close/reopen, candidate
  add/edit/delete, vote reset, archive create/rename/delete, booth reconciliation
  entries (item 4).
- Each entry: timestamp, action, relevant ids, and whatever client identity is
  available (client id / IP / the human-entered device label from item 1).
- Expose it read-only in the dashboard (a simple "Activity Log" tab) so it's not
  just sitting in the database unread — visibility is the point, not just
  existence. Flag lapses in large, prominent styling rather than burying them in
  a normal log row.
- The log itself must not be editable or deletable from within the app by anyone,
  admin included — otherwise it's not actually a control.

**Correction (2026-09-23, during implementation):** the original plan above
proposed a Firestore *security rule* to make the log append-only "even against
direct Google Cloud console access." That doesn't actually work: Firestore
Security Rules only govern requests made through a client-side SDK or the REST
API under Firebase Auth — they have no effect on the server-side Admin SDK
(`@google-cloud/firestore`, which is what this backend uses exclusively) or on
Cloud Console/`gcloud` access, both of which are governed by IAM instead and
bypass Security Rules entirely by design. Since this app has no client-side
Firestore access at all, a rules file here would be inert — not deployed by
anything, and not actually restricting the one access path (the Admin SDK)
that matters. **The real protection implemented instead:** no code path to
update or delete a log entry exists anywhere in the application
(`datastore.ts` only ever provides `appendLogEntry`, never an update/delete
counterpart) — verified by a test that asserts those methods don't exist.
That's a guarantee against *this app* editing its own log; it does not (and,
per the correction above, could not via Security Rules) stop someone with
direct GCP project access. Detecting that kind of out-of-band tampering is
still item 8's job (an independent backup a live edit would disagree with) —
item 8 remains unbuilt, so this gap is real and open, not closed by the log
alone.

**Status:** **Implemented and live in production** (2026-09-23). The
`electionRuns`/`actionLog` Firestore subcollections, the append-only-by-code
guarantee, the "Activity Log" dashboard tab, and logging for every action
listed above except candidate add/edit/delete (deferred as an explicit
fast-follow, see ROADMAP.md Phase 3) are all built and covered by tests. Item
8 (independent backup) is still open and is what would actually catch
out-of-band tampering — see the correction above.

**Follow-up, same day:** "visibility is the point, not just existence" (this
item's own proposed handling, above) turned out to need more than a plain
table — the Election Commissioner pointed out a long log book is
impractical to actually read, so nobody would use it. Added a search/filter
UI on the same tab (`GET /election-runs/log/search`, filtering by run,
election type, branch, actor, action, or code) plus a one-click "Who were
the polling officers?" button, rather than a natural-language chatbot — see
ROADMAP.md's "Why a search UI instead of a chatbot" for the reasoning
(mainly: every real question asked was a structured lookup, and an
LLM-based answer carries a hallucination risk that's especially bad for a
trust/audit tool).

---

## 6. Irreversible actions have no second-person confirmation

**Concern (new):** Deleting a candidate, deleting an officer code, resetting votes,
or deleting an Election History archive are each a single action by the one person
who holds the admin secret. [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) already
shows awareness of this for Election History specifically ("The Election History
tab's Delete button is now intentionally hidden once real users are on the app...
so clearing test entries out now needs a developer, not just the superadmin" —
see recent commit "Hide the Election History Delete button"), but that pattern
hasn't been applied anywhere else yet.

**Why it's a manipulation risk:** A single person acting alone can permanently
destroy evidence (a candidate record, an officer code's name attribution, an
archived result) with no one else's knowledge, let alone consent — even if the log
in #5 records *that* it happened, it can't undo it.

**Proposed handling:**
- For the highest-stakes irreversible actions (vote reset outside of an
  archive-then-clear flow, deleting a used officer code, deleting any archive),
  consider requiring the action to be *requested* by the admin and *confirmed* by
  a second, separately-authenticated party (a second fixed secret held by someone
  other than the Election Commissioner — e.g. the school's administration).
- Short of a full two-person control, at minimum: these actions should always be
  in the audit log from #5, and ones that touch already-cast votes should require
  typing a confirmation phrase, not just a click.

**Decision (session 2):** the full second-person *approval* control described
above was discussed and **not adopted for now** — see the "Decision" section
right after item 7 for the reasoning. The lighter version (always logged,
confirmation phrase for vote-affecting actions) stays as the current plan.

**Status:** Deprioritized — logging (item 5) and confirmation phrases adopted as
the near-term approach; full two-person approval left as a possible future
addition, not built now.

---

## 7. Shared single admin password means no true individual accountability

**Concern (new — root cause underlying #1, #5, #6):** `ADMIN_SECRET` is one string
compared with `timingSafeEqual` ([adminAuth.ts](backend/src/middleware/adminAuth.ts)).
Anyone who has it *is* "the super admin" — the system has no concept of individual
admin identity, only "knows the secret or doesn't." Every log entry proposed above
can record *that* an action happened, but not reliably *who* did it beyond a
random per-tab client id.

**Why it's a manipulation risk:** If the secret is shared with even one other
person (which [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) already anticipates —
"Decide who besides you will hold the admin secret"), actions by either person are
indistinguishable in every log or session record.

**Proposed handling:**
- Move from one shared secret to named admin credentials (even something simple:
  a small fixed list of `{name, secret}` pairs checked server-side) so every
  session, log entry, and takeover notice in #1/#5 can say a real name, not just
  "the admin."
- This is a prerequisite for #1's "the real Commissioner should know it wasn't
  them" — right now the system can't express that distinction at all.
- Ties directly into item 1's human-entered device/person label at login — both
  come from the same root gap: the system has no concept of "which person," only
  "knows the secret or doesn't."

**Status:** Open.

---

## Decision: an immutable, comprehensive action log, chosen instead of a second-credential / two-person approval requirement

**Context:** item 6 raised requiring a second, independent person to *approve*
irreversible actions (vote reset, deleting a used code, etc.) before they can
happen — a prevention control. The Election Commissioner proposed an alternative:
log everything comprehensively and immutably from the moment an election run
starts (item 11) until it's closed and archived, and flag any lapse (like a code
that was never named) in large, impossible-to-miss styling — a detection and
transparency control instead.

**Why the immutable-log approach was chosen as the primary control:**
- It doesn't require finding and trusting a specific second person for this
  election — the two-person approach only works if that person genuinely has no
  stake in the outcome, which is a real logistical ask each time.
- It's more honest about what it actually guarantees. A second-approval
  requirement *sounds* like it prevents manipulation, but the Election
  Commissioner could still, in principle, be the one who recruits and briefs
  that second person — it shifts trust rather than removing it. An immutable log
  doesn't ask anyone to believe a control worked; it lets anyone go look.
- It generalizes to every concern in this document at once (items 1, 3, 4, and
  any future one) instead of needing a bespoke two-person flow designed for each
  specific irreversible action.

**What this does and doesn't guarantee — stated plainly, not oversold:**
- It does **not** stop a fabricated officer code from being created and voted
  with, or any other privileged action from happening — the Election
  Commissioner retains sole operational control throughout the run, by design
  (this app has exactly one superadmin — see
  [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md), "There is
  exactly one superadmin... We do **not** need branch-scoped admin secrets").
- It **does** guarantee that action cannot be hidden, denied, or quietly
  reversed afterward — it happens permanently, in large visible type, on a record
  that gets carried into Election History and outlives the run itself.
- **Residual risk, named honestly:** the log lives in the same Firestore database
  as everything else. Someone with direct Google Cloud console access (a
  different, higher privilege than the app's admin password — see item 8) could
  in principle try to edit both the data and the log to match. This is why item 5
  specifies a database-level append-only rule and an independent backup of the
  log specifically — those two steps are what make this decision hold even
  against that stronger threat model, not the application code alone.

**Status:** Decided — implement per item 5 (log) and item 11 (run-scoped
lifecycle). Item 6's full two-person approval stays on record as a possible
future addition if experience shows the log alone isn't enough, but is not part
of the near-term build.

---

## 8. No backup that lives outside the live database

**Concern (new — extension of #2):** All election state lives in exactly one place
— the single Firestore document (or single disk file in non-Firestore mode). There
is no scheduled export, no off-system copy, nothing that survives if that one
document is corrupted, deleted, or manipulated directly (e.g. via Firestore console
access, which is a separate privilege from the app's admin secret entirely and
isn't discussed anywhere in this app's own trust model).

**Why it's a manipulation risk:** Someone with Google Cloud project access (not
just the app's admin secret) could alter the live document directly, and there
would be no independent copy to compare it against.

**Proposed handling:**
- Enable scheduled Firestore exports to Cloud Storage (daily during any active
  election, or on every poll close) as a cheap, automatic off-document backup.
  This should specifically include the action log from item 5, not just votes/
  candidates/codes — see item 5's hardening steps.
- Document, separately from this file, exactly who has Google Cloud project access
  — that's a distinct trust boundary from the app-level admin secret and deserves
  its own review.

**Status:** Open.

---

## 9. Tamper-evident hash chain for votes and the action log

**Concern (raised in discussion, session 2):** could each vote/log record include
a hash of the previous record, so a chain forms — the same underlying idea used
in blockchains (though nothing here needs cryptocurrency machinery, just the
hash-chaining technique) — so that even someone with direct database access
couldn't quietly edit or delete a past record without the chain visibly breaking.

**The Election Commissioner's read on this:** "it appears like blockchain, maybe
we look at it later, not for now" — correct read, and agreed. This is the
strongest possible answer to "what if someone bypasses the app entirely and edits
Firestore directly," which is a real but more exotic threat than the ones items
1-8 and 11 cover. It's meaningfully more engineering effort than the append-only
Firestore security rule already proposed in item 5, which covers most of the same
threat far more cheaply.

**Status:** Deferred — revisit later if time allows; the append-only rule in item
5 is the near-term substitute for this threat model.

---

## 10. Signed final results slip at the close of an election run

**Concern (raised in discussion, session 2) — distinct from item 4:** item 4 is
about reconciling the physical paper count against the electronic count **per
booth, during polling**. This item is different: at the very end, after every
booth is reconciled and the run is closed, print the final combined results and
have the Election Commissioner and witnesses physically sign a slip containing a
short summary/checksum of the final tally.

**Why it's needed even with item 4 in place:** item 4 protects the count *during*
polling. It says nothing about the gap between "Close Poll" and "the results are
announced/declared" — a window where, in principle, the stored results could be
altered before anyone outside the app has seen them. A physically signed final
results slip anchors the *announced* outcome to a tamper-evident paper artifact,
the same way the booth-level paper sheets anchor the *per-booth* count — it
protects a different moment in the process, not a duplicate of item 4.

**Status:** Open — not yet designed in detail (what exactly goes on the slip,
whether a short checksum/hash of the results is printed alongside the numbers
themselves for extra tamper-evidence).

---

## 11. "Start Recording" — a named, scoped log for one election, not "Start Election"

**Reframed (clarified in discussion):** this item is not really "start the
election" (that's what Set Election Type / Open Poll already do) — it's **"start
recording."** The button's job is to begin a permanent, unmutable log and ask,
right then, *which* election this recording covers (e.g. "Dwarka branch, School
elections"). That answer becomes the label/filename for this specific log
segment — so instead of one endless, unnamed log, you get a series of clearly
named, closed, filed records: "Dwarka — School Elections — [date]," "Dwarka —
House Elections — [date]," etc. — the same way Election History already gives
each archived result a name today (`renameArchive` /
[report.ts](backend/src/routes/report.ts)'s "Save to Election History" flow).
This keeps the *logging* concern (item 5) and the *election run* concept cleanly
tied to one clear trigger and one clear artifact, rather than the log being an
undifferentiated stream that happens to have run boundaries buried inside it.

**The primary reason this item exists (clarified later in the same discussion) —
lead with this, everything else here is secondary to it:** item 5's audit log
cannot simply start recording from the moment the app is first touched. Setting
up an election involves a lot of legitimate, low-stakes churn — adding
candidates, fixing a misspelled name, re-uploading a photo until the crop looks
right, generating and deleting test codes during a testing round (exactly what
[ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) already describes as normal:
"test rounds will leave clutter"). If all of that were mixed into the same
permanent, immutable log as the real election, two things go wrong: the log
becomes too long for anyone to practically review, and — worse — a genuine
irregularity gets *easier* to hide, not harder, buried as one line among
thousands of routine setup edits instead of standing out in a short, meaningful
record.

**So the log needs a deliberate, explicit start boundary**, not just a
technical one. Item 11 is what defines that boundary: everything before "Start
the process of School Elections for Dwarka branch" is unlogged, freely-editable
setup work with no permanence and no review burden; the moment that action is
taken, logging switches on and becomes permanent until the run closes. The
officer-code and branch-scoping points below are real, but they're downstream of
this — the log needing a clean start is the reason this item has to exist at
all, independent of whether multi-branch or code-scoping mattered.

**Two open questions this reframing surfaced — both now decided:**
1. **Does "Start Recording" also reset votes/codes to zero in the same action?
   Decided: yes, one button does both**, atomically. "Start Recording" *is* the
   start of the run — naming the log, zeroing votes, and zeroing codes all
   happen together, so there's never a window where recording is on but the run
   hasn't really begun.
2. **Should "Start Recording" be one shared action covering both branches, or
   one per branch? Decided: one shared recording for both branches**, consistent
   with the already-locked decision in
   [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) that Poll
   Controls (Open/Close) are shared across Dwarka and AN, not independent. One
   "Start Recording" click names one log covering both branches together (e.g.
   "School Elections — Term 1 2026"), and resets votes/codes to zero for both
   branches at once.

**The three related points raised in the original discussion (session 2):**

1. Officer codes are currently generatable "anytime, for any election" — there's
   no concept tying a batch of codes to one specific election (e.g. "Dwarka
   branch, School elections" as opposed to "Dwarka branch, House elections," or
   the same combination run again next year).
2. There needs to be an explicit **starting point** — an action that says "Start
   the process of School Elections for Dwarka branch" — which resets **votes**
   and **officer codes** to zero for that run (the **candidate list is
   deliberately left untouched**, since building it correctly takes real time and
   care, unlike codes/votes which are meant to start fresh each run). From that
   start action onward, *everything* is logged with no way to edit or delete
   anything until the election is closed and its Election History snapshot is
   generated — including tracking candidate list changes per post from that point
   forward, even though the starting list itself isn't wiped.
3. Generating officer codes is the **first thing that happens** after starting a
   run, scoped only to that run; more codes can be generated later in the same
   run; codes can only be deleted under the stricter rule from item 3 (never
   named, and zero votes).

**Current behavior in the code — this is a real gap, not just missing polish:**
- There is **no run/session concept at all** today. `PollState`
  ([election.ts:54-57](backend/src/types/election.ts#L54-L57)) only tracks
  `activeElectionType` and `isOpen` — a single live flag, not an identified,
  named election that started at a point in time and will close at another.
- **`POST /poll/reset` and `POST /poll/set-type`
  ([poll.ts](backend/src/routes/poll.ts)) clear votes (`resetVotes` /
  `resetVotesByType`) but never touch officer codes.** Confirmed directly in the
  code — `dataStore.generateOfficerCodes`/`deleteOfficerCode` are never called
  from either route. Today, officer codes from a previous election simply persist
  forever unless someone manually deletes them one at a time — exactly the gap
  point 2 above is closing.
- There's no "branch" concept in the data model yet at all
  (`Candidate`/`StoredVote`/`OfficerCode`/`ElectionArchive` only carry
  `electionType` and optional `house`) — but this is already planned, decided,
  and scoped separately in
  [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) (adding a
  `branch: 'dwarka' | 'AN'` field to those same four types). **This item builds on
  top of that plan**, not instead of it: an "election run" is
  `electionType + an iteration/start marker` — *not* branch-scoped, since a run
  covers both branches together (see the shared-recording decision above) — so
  this needs the branch field from that plan as a prerequisite (each vote/code
  still tags its own branch, just not the run as a whole), plus a new explicit
  lifecycle (started → open/closed → declared) that doesn't exist in either plan
  today.
- There's no candidate-change tracking at all today — `setCandidates`
  ([datastore.ts:277-280](backend/src/storage/datastore.ts#L277-L280)) replaces
  the whole candidate array with no history kept of what changed or when. Point 2
  above asks for this to start being tracked, per post, from the moment a run
  starts — a new capability, not a refinement of an existing one.

**Why it's a manipulation risk without this:** without a run boundary, "which
codes belong to this election" and "what counts as this election's official
record" are matters of informal bookkeeping (per
[ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md)'s manual "delete all test officer
codes... record which teacher holds which code" steps) rather than something the
system itself enforces and remembers. A leftover code from a prior run, or a
candidate edit made mid-election with no record of when or by whom, both become
invisible exactly where it matters most.

**Proposed handling (high-level — needs its own detailed design pass before
building; updated to reflect the two decisions above):**
- A new `ElectionRun` concept: id, electionType (`school`/`house` — **not**
  branch-scoped, since one run always covers every branch together, per the
  shared-recording decision), a human-entered name/label (e.g. "School Elections
  — Term 1 2026") captured when the button is pressed, `startedAt`, `startedBy`,
  status (`running` / `closed`), and eventually a link to the Election History
  archive(s) it produces on close (one archive per branch, as
  [MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md) already
  specifies — "a Reset while both branches have votes should produce two history
  entries, one per branch").
- A single **"Start Recording"** admin action, asking for the election
  name/label at the moment it's pressed, that atomically:
  - creates the new run record with that name,
  - clears live votes and officer codes down to zero for **both branches**
    (candidates untouched, per the explicit decision above),
  - begins the immutable action log window described in item 5, scoped to this
    run and named for it,
  - and only after this point allows officer-code generation — codes are tagged
    with the run they belong to (and with their branch, once
    MULTI-BRANCH-EXPANSION-PLAN.md's `branch` field lands), not just
    `electionType`/`house`. **Generation is explicitly per branch and per type**
    — e.g. "Generate codes for Dwarka School Elections" — not one combined
    action, since Dwarka and AN each need their own distinct code set even
    though they share one recording (confirmed in discussion: four generation
    combinations exist — Dwarka/AN × School/House).
- Officer codes generated mid-run are allowed (more codes as needed); deletion
  follows item 3's stricter rule (never named + zero votes) regardless of when in
  the run they were created.
- Candidate list changes (add/edit/delete per post, either branch) made after the
  run has started get their own log entries in the run's action log, even though
  the starting list itself isn't reset — so "what did the candidate list look
  like at any point during this run" becomes answerable, not just "what does it
  look like now."
- Closing the run seals its action log (item 5), generates the Election History
  snapshot(s) (one per branch), and only then is a genuinely fresh state
  available for the next run of that election type.

**Status:** **Implemented and live in production** (2026-09-23), with one
deliberate scope decision that differs from the proposal above (decided with
the Election Commissioner before building, since only test data existed in
production at the time — see ROADMAP.md Phase 3):
- Officer-code generation is gated on an active run matching that code's
  election type, exactly as proposed. **Open Poll itself was deliberately
  left ungated** (not blocking real voting on a run being active), unlike
  what a strict reading of "only after this point allows officer-code
  generation" might suggest for the rest of the flow — lower regression risk
  for this year's live election; can be hardened into a hard gate later once
  Start Recording has been used successfully across a few real runs.
- "Close Recording" was built as a **new, separate action from the existing
  Reset Poll button**, not a replacement — Reset Poll keeps its exact
  pre-existing behavior (zero regression risk), while Close Recording is the
  proper run-aware equivalent (archives under the run's name, resets
  votes/codes for that run's type, closes the poll, seals the run and its
  log). Reset Poll is still logged if used while a run happens to be active,
  specifically to catch that bypass scenario.
- Candidate-change logging (add/edit/delete per post, during a run) is an
  explicit **fast-follow**, not included in this pass — everything else
  listed in "Proposed handling" above is built: the `ElectionRun` model,
  atomic start (name + reset both branches' votes/codes for that type +
  begin logging), per-branch-and-type code generation tagged with the
  active run's id, and closing (archive + reset + seal).
- One addition beyond the original proposal: login now optionally captures a
  short human-entered label ("Rajeev -- laptop"), pulled forward from item
  1, specifically so log entries say a real name instead of an anonymous
  session id — see item 1's status.
Verified end-to-end with a real browser run: generation correctly blocked
with no active run and correctly gated to the matching election type once
one starts; the Activity Log tab shows `run.start`/`officerCode.generate`
entries with the actor label attached; closing seals the run and produces a
correctly-named Election History entry.

**Addendum (2026-09-23, later the same day): "Start Recording" redesigned,
and the officer-code generation gate above removed**, both in direct
response to the Election Commissioner's feedback that the flow had become
stressful and unnecessarily complicated rather than a "joy to use":
- **Officer-code generation gate removed.** The gating described above
  ("only after this point allows officer-code generation") is superseded —
  codes are now prep work, generated any time, the same way candidates are.
  This required a real fix, not just removing a check: `startRecording` used
  to reset officer codes to zero at the *start* boundary as a safety net;
  since codes can now exist before a run starts, that reset was removed from
  *start* (kept at *close*, which still fully clears a finished run's codes
  — so by construction nothing stale from an old run can be present when a
  new one begins). Pre-generated codes are instead carried forward and
  stamped with the new run's id. Verified with a real browser run: a code
  generated and named before starting an election survives the start and is
  correctly attached to the new run.
- **"Start Recording" replaced by a guided wizard** (name the election,
  confirm/change election type, a vote-reset notice, a codes-readiness
  checklist showing real counts, a codes-distributed confirmation, a
  candidates-lock notice, then one final action that starts the run *and*
  opens the poll together). Abortable with no effect at any point before
  that final step. The separate standalone "Election Type" control is gone,
  folded into the wizard. User-facing wording changed throughout
  ("RECORDING" → "ELECTION IN PROGRESS", "Close Recording" → "End the
  Election Process"); the underlying run/log data model, the append-only
  guarantee, and Close Recording's own behavior (still resets votes/codes
  for that run's type, still archives, still seals the log) are unchanged.
- Open Poll's gating did change in one respect not covered above: the
  Dashboard's Open Poll button (for pausing/resuming voting) is now
  disabled unless a run is currently active, since opening the very first
  poll of a new election always goes through the wizard now — otherwise a
  stale `activeElectionType` left over from a previously-closed run could
  let voting reopen with un-reset vote counts, bypassing the run entirely.

See item 1's status below for the related login-label addendum, and
ROADMAP.md's "Current status" for the full account.

**Addendum (2026-09-24): Close Recording ("End of Voting") no longer resets
votes.** Line 803 above ("still resets votes/codes for that run's type") is
now only half true -- the codes half was already reversed same-day
2026-09-23 (see ROADMAP.md), and the votes half was reversed 2026-09-24, by
direct request: a School/House election runs once a year, so there is no
reason the live vote count needs to go blank the moment voting ends. It now
stays frozen everywhere (Live Results, the Dashboard total, each officer
code's turnout) until a fresh election of that type is deliberately started
via Start the Voting Process, whose own reset (unchanged, still the safety
net described above) is now the only place votes reset. Votes live in their
own Firestore subcollection, not the size-limited main document, so
retaining a year's worth costs nothing. See TESTING-DEMO-SCRIPT.md's change
log for the verification.

---

## Suggested build order

**Superseded by [ROADMAP.md](ROADMAP.md).** Once item 12 (the Firestore
document-size ceiling) turned out to collide directly with
[MULTI-BRANCH-EXPANSION-PLAN.md](MULTI-BRANCH-EXPANSION-PLAN.md)'s `branch`
field addition — both touch votes and the same core files — the two-branch and
integrity work stopped being separable into independent tracks. ROADMAP.md is
now the authoritative combined sequencing across this document,
MULTI-BRANCH-EXPANSION-PLAN.md, and CANDIDATE-COLLECTION-PLAN.md together. In
short: a combined "Phase 0" data-model/storage restructuring (branch field +
votes moved to their own Firestore collection + candidate photos moved to
Cloud Storage) comes first and unblocks everything else; items 5 and 11 here
are still bundled together within that plan, for the same reason as before (a
log with no start boundary is worse than no log at all).

---

## 12. The single-document Firestore design has a real, quantified size ceiling — votes, not just photos

**Concern (surfaced while answering a question about GitHub-as-backup and
candidate photos):** [CANDIDATE-COLLECTION-PLAN.md](CANDIDATE-COLLECTION-PLAN.md)
already identified that inline candidate photos alone could run ~10x over
Firestore's hard 1 MiB per-document limit at full candidate volume. The
follow-up question — "if we drop photos, would keeping log files still blow it
up?" — led to checking real numbers from the current dev data
([data.json](backend/data/data.json)): a photo-free candidate is ~91 bytes, a
vote record is ~183 bytes.

**Measured, not guessed:** without photos, 174 candidates ≈ 16 KB — a
non-issue. Historical archives stay small indefinitely (they store aggregated
result tallies, not raw ballots). The future audit log (item 5), for one run's
worth of admin actions, would plausibly add tens of KB. **The real growing risk
is live votes while a run is in progress.**

**Confirmed at the school's actual scale (3,000+ students, each voting in both
School and House elections):** computed real per-vote JSON sizes — a school
vote (5 posts) is ~224 bytes, a house vote (3 posts) is ~206 bytes. School and
House votes don't coexist in the live document (one is archived and cleared
before the other starts), but at 3,000 voters, **whichever one is currently
live already consumes 59-64% of the entire 1 MiB ceiling by itself** — before
candidates, officer codes, archives, or the log are added on top. At 4,000
voters that's 79-85%. At 5,000, live votes alone **exceed the ceiling on their
own**. This is a consequence of one specific design choice: the *entire*
election state — candidates, votes, officer codes, archives, and (once built)
the action log — lives in **one single Firestore document**
([datastore.ts:14](backend/src/storage/datastore.ts#L14)), which has a hard
1 MiB limit no matter what's in it. **Given these numbers, this is not a
future/eventual risk — it is a near-certain failure on the first two-branch
election at stated turnout, and it would fail mid-polling, not at a planned
moment.**

**Why it matters for trust, not just capacity:** if this ceiling were ever hit
while a run is active, *every* write fails at once — including vote
persistence — at exactly the worst possible moment (mid-polling), not as a
predictable, plannable maintenance event.

**The assured fix (not a mitigation — this removes the risk category
entirely):** move votes, and (once built) the action log from item 5, out of
the single shared document and into their own Firestore **collections** — one
small document per vote, one small document per log entry — instead of growing
array fields inside one document. Firestore's 1 MiB limit is per-document, not
per-collection, so a collection holding any number of ~200-byte vote documents
has no comparable ceiling. This keeps the app's existing in-memory, synchronous
read model exactly as it is today (load the current run's votes into memory
once, compute results the same way `resultsService.ts` already does) — only
*how a vote gets persisted* changes, from "rewrite the entire state document"
(what happens today, on every single vote) to "write one small document." That
second part is also a meaningful efficiency win on its own, independent of the
size ceiling: today's per-vote write cost grows with every vote ever cast, this
fix makes it constant.

**Proposed handling:**
- Move photo storage to Cloud Storage (already planned in
  [CANDIDATE-COLLECTION-PLAN.md](CANDIDATE-COLLECTION-PLAN.md)) — removes the
  candidate-side driver.
- Move votes to their own Firestore collection — the assured fix above. This is
  the one that actually matters at 3,000+ dual-voting students.
- Build the action log (item 5) directly as its own collection from the start,
  not as a field on the shared document — avoids needing to migrate it later,
  and is also the natural place for item 5's append-only security rule.
- Candidates, officer codes, and archives can stay on the shared document for
  now — they're genuinely small and not the bottleneck.

**Status:** **Implemented and live in production** (updated 2026-09-22).
Votes live in a Firestore subcollection, one document per vote, with a
migration path for any pre-existing inline votes and a loud failure instead of
silent data loss if a legacy record is malformed; covered by 8 tests in
[datastore.test.ts](backend/src/storage/datastore.test.ts) against a simulated
Firestore. `branch` is now read/written/filtered end to end: officer-code
generation, kiosk activation, vote recording *and validation*, candidate
creation, and results all respect it, with a real bug in this rollout (the
ballot itself wasn't filtered by branch — see ROADMAP.md Phase 0) found in
live use and fixed. **Still open:** candidate photos are not moved to Cloud
Storage (deliberately deferred — no photos this year at all, see
CANDIDATE-COLLECTION-PLAN.md); `routes/report.ts` doesn't take a branch
parameter yet; Open Poll's coverage gate and archive-splitting are
deliberately not branch-aware yet (real regression risk until AN has data) —
see ROADMAP.md Phase 0 for the full current state.

---

## Open items still to think through (not yet designed)

- Voter eligibility / one-vote-per-person is entirely physical today (the polling
  officer's paper list) — see [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md): "the
  app does not check who the voter is; it only trusts you... this is the only thing
  that stops someone voting twice." Worth a deliberate decision on whether this
  stays fully physical (simplest, matches a small school election) or whether any
  electronic assist (e.g. a voter roll) is ever worth the added complexity and
  privacy tradeoff of linking a vote to a voter identity, which the system
  currently and deliberately does not do.
- **Results are live, unauthenticated, and viewable the whole time the poll is
  open — confirmed in code, not speculation.** `GET /results`
  ([results.ts](backend/src/routes/results.ts)) has no admin-secret check and no
  gate on `pollState.settings.isOpen` — it returns the current tally for whatever
  election is active to *anyone* who requests it, at any time, including while
  votes are still being cast. That's fine for the intended "Live Results on a
  projector" use, but it means results are never actually secret mid-poll to
  anyone who finds the URL — worth a deliberate decision on whether that's
  acceptable (arguably it's *good* for trust — nothing hidden — but it does mean
  someone watching the running count could see it swing and, in principle, use
  that to influence late voters. Not obviously worth restricting, but worth
  recording as a conscious choice rather than an oversight).

Add more here as they come up.
