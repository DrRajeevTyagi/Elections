// School election posts
export type SchoolPostId = 'HB' | 'HG' | 'SSC' | 'SRC' | 'SCC' | 'IC';
// House election posts
export type HousePostId = 'HC' | 'HCC' | 'HSC';
// All possible post IDs
export type PostId = SchoolPostId | HousePostId;

// House names
export type HouseId = 'Anand' | 'Dhiraj' | 'Kripa' | 'Prem' | 'Namrata' | 'Nishtha' | 'Satya' | 'Shanti';

// Election types
export type ElectionType = 'school' | 'house';

// School branches -- always "AN" in capitals, never spelled out or
// lowercased (see MULTI-BRANCH-EXPANSION-PLAN.md's naming convention: one of
// the house names is "Anand," and lowercase "an" collides with the ordinary
// English word). Optional everywhere for now since existing records predate
// this field -- default to 'dwarka' wherever one is missing, the only branch
// that has ever existed (see storage/datastore.ts normalization).
export type Branch = 'dwarka' | 'AN';

export interface Candidate {
  id: string;
  name: string;
  post: PostId;
  electionType: ElectionType;
  house?: HouseId; // Required for house elections
  imageUrl?: string;
  branch?: Branch;
}

export interface PollSettings {
  isOpen: boolean;
  allowRevote: boolean;
}

export interface VoteSubmission {
  selections: Record<PostId, string>;
  house?: HouseId; // Required for house elections
}

export interface StoredVote {
  id: string;
  timestamp: number;
  electionType: ElectionType;
  house?: HouseId; // Required for house elections
  officerCode?: string; // Which polling officer's code activated this vote
  selections: Record<PostId, string>;
  branch?: Branch;
}

export interface OfficerCode {
  code: string;
  officerName: string;
  // Which election this code was generated for -- a code generated for one
  // election type must never activate a ballot while the other is active,
  // even if the poll happens to be open (see routes/kiosk.ts activate).
  electionType: ElectionType;
  house?: HouseId; // Required (and always set) when electionType is 'house'
  createdAt: number;
  closedAt?: number; // Set when the polling officer closes this booth; blocks further activations
  branch?: Branch;
  // Set permanently to true the first time officerName is ever assigned a
  // non-blank value, and never cleared back to false even if the name is
  // later edited back to blank -- distinguishes "never named" from
  // "named, then cleared," which officerName alone cannot. Deletion (see
  // routes/officerCodes.ts DELETE) is refused once this is true, per the
  // stricter rule in ELECTION-INTEGRITY-AND-TRUST.md item 3: once a code
  // has been allotted to a real officer, it becomes permanent regardless
  // of whether it was ever used to vote.
  everNamed?: boolean;
  // Which election run this code is currently part of (see ElectionRun
  // below). Generation no longer requires an active run -- codes can be
  // prepared ahead of time, like candidates -- so this starts undefined and
  // gets stamped in once a matching run starts (see runService.ts
  // startRecording / storage/datastore.ts stampOfficerCodesRunId). Also
  // undefined for codes generated before this feature existed.
  runId?: string;
  // The officer's WhatsApp number, digits only with country code (e.g.
  // "919876543210") -- saved from the Bulk Allot teacher list (or typed in
  // later on the Send Codes screen) so codes can be sent at any time, not
  // only while the upload window happens to still be open.
  phone?: string;
  // When this code was last marked as sent on WhatsApp (Send Codes screen).
  // Cleared again by "Undo". Lets sending resume where it stopped after a
  // refresh or the next morning.
  sentAt?: number;
  // When the teacher first typed this code correctly on a kiosk -- proof
  // they received it and are ready (green on the Officer Codes tab).
  // Recorded even before voting opens; cleared by "Start Allotting Duties
  // for a Fresh Election".
  //
  // Duty colours on the Officer Codes tab, derived from these fields:
  // grey = repoll, red = closedAt ("duty over"), green = readyAt,
  // yellow = sentAt, white = none of these.
  readyAt?: number;
  // Set when the Chief Election Commissioner ordered a re-poll at this
  // booth (see routes/officerCodes.ts POST /:code/repoll). Every vote cast
  // under this code is then left out of all results -- the votes
  // themselves are never deleted or changed -- and the code can never
  // activate a ballot again. Permanent: never cleared.
  repoll?: RepollRecord;
  // On the fresh code issued for a re-poll: the code it replaces.
  replacesCode?: string;
  // "Verify & Seal" (Officer Codes tab): after the booth closed, the Chief
  // Election Commissioner checked the app's vote count against the Paper
  // List and they matched. Final: a sealed booth can't be reopened,
  // re-polled or deleted. End of Voting needs every booth with votes
  // sealed. Cleared only by a fresh election (startFreshDuties / Start).
  seal?: SealRecord;
}

export interface SealRecord {
  sealedAt: number;
  sealedBy: string; // actor label -- see LogEntry
  paperListCount: number; // voters on the printed Paper List, as typed in
  appCount: number; // votes counted by the app at that moment (always equal -- checked)
}

export type RepollReason = 'irregularity' | 'disruption' | 'count-mismatch' | 'other';

export interface RepollRecord {
  orderedAt: number;
  orderedBy: string; // actor label -- see LogEntry
  reason: RepollReason;
  note: string;
  // How many votes were set aside (frozen at the moment of the order --
  // no more can be added, the code is dead from then on).
  cancelledVoteCount: number;
  // What those cancelled votes had given each candidate, frozen at the
  // moment of the order -- the exact amount taken back off each count.
  // Missing on re-polls ordered before this was recorded (2026-10-09).
  cancelledByCandidate?: CandidateVoteCount[];
  replacementCode: string;
  runId?: string;
}

// How many votes one candidate received at one booth.
export interface CandidateVoteCount {
  post: PostId;
  candidateId: string;
  name: string; // as it was at the time -- kept even if the candidate is later renamed or removed
  count: number;
}

export type RunStatus = 'running' | 'closed';

// The "Start Recording" / "Close Recording" concept (ELECTION-INTEGRITY-AND-TRUST.md
// items 5 and 11). Deliberately NOT branch-scoped -- a run always covers both
// branches together, matching the already-locked decision that Open Poll
// itself is shared, not per-branch. At most one run has status 'running' at
// any given time; everything logged while it's running is permanent and
// immutable (see LogEntry) until it's closed.
export interface ElectionRun {
  id: string;
  electionType: ElectionType;
  name: string; // human-entered label, e.g. "School Elections -- Term 1 2026"
  status: RunStatus;
  startedAt: number;
  startedBy: string; // actor label -- see LogEntry
  closedAt?: number;
  closedBy?: string;
  // Filled in when the run is closed -- the ElectionArchive id(s) this run
  // produced (one per branch, once branch-split archiving lands -- see
  // ROADMAP.md Phase 0's deliberately-deferred archive-splitting note).
  archiveIds?: string[];
}

// One entry in the permanent, append-only action log. Only ever created,
// never updated or deleted -- there is deliberately no update/delete method
// for this anywhere in datastore.ts (see ELECTION-INTEGRITY-AND-TRUST.md
// item 5). Writing an entry is itself gated on a run being currently active
// (see services/auditLogService.ts) -- nothing is logged before "Start
// Recording," by design.
export interface LogEntry {
  id: string;
  timestamp: number;
  runId: string;
  // The human-entered label captured at login/takeover time (see
  // adminSessionService.ts), falling back to the raw client id if no label
  // was given -- see ELECTION-INTEGRITY-AND-TRUST.md item 1/item 7 for why
  // this can't yet be a verified individual identity.
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  // First-class, top-level filter fields -- deliberately NOT left buried
  // inside `details`, so the search endpoint (routes/electionRuns.ts
  // GET /election-runs/log/search) can filter on them directly without
  // needing to know which actions happen to carry which detail keys.
  // `electionType` is stamped on every entry from the run it belongs to
  // (a run always has exactly one). `branch` is only set for actions that
  // are actually about one specific branch (officer-code actions); it's
  // left undefined for run/poll/archive/admin-session actions, which apply
  // to both branches together.
  electionType?: ElectionType;
  branch?: Branch;
}

export interface PollState {
  activeElectionType: ElectionType | null;
  // Stamped whenever activeElectionType is set through the current code path
  // (poll/set-type, runService.startRecording) -- see routes/poll.ts's
  // self-heal for why this, not hasActiveRun, is what tells a genuine
  // "type picked, run not started yet" apart from a pre-existing leftover
  // value from before this field existed.
  activeElectionTypeSetAt?: number;
  settings: PollSettings;
}

// A permanent snapshot of one election's results, taken automatically right
// before "Reset Poll" clears the live votes. Deliberately excludes candidate
// photos -- only ids/names/counts -- so archives stay small.
export interface ArchivedCandidateResult {
  candidateId: string;
  name: string;
  post: PostId;
  house?: HouseId;
  total: number;
  // Which branch this candidate belonged to. Undefined only for results
  // saved before this field existed -- treat those the same way the rest
  // of the codebase defaults a missing branch, as 'dwarka'.
  branch?: Branch;
}

export interface ArchivedOfficerCode {
  code: string;
  officerName: string;
  // Both added 2026-10-09 for the Election Record's booth-by-booth table;
  // missing on archives saved before then.
  house?: HouseId;
  closedAt?: number;
  // Votes that COUNT -- always 0 for a re-polled booth, whose votes are
  // reported separately in cancelledVoteCount.
  voteCount: number;
  branch?: Branch;
  cancelledVoteCount?: number;
  cancelledByCandidate?: CandidateVoteCount[];
  repollReason?: RepollReason;
  repollNote?: string;
  replacementCode?: string;
  replacesCode?: string;
  // Set when the booth was verified against the Paper List and sealed.
  paperListCount?: number;
}

export interface ElectionArchive {
  id: string;
  archivedAt: number;
  electionType: ElectionType;
  totalVotes: number;
  results: ArchivedCandidateResult[];
  officerCodes: ArchivedOfficerCode[];
  name?: string; // Admin-given label, e.g. "School Council -- Term 1 2026"
  // How many ballots each branch actually cast, captured at snapshot time
  // from the vote records themselves. Needed because a per-branch report
  // cannot be derived from `results` alone: every ballot contributes one
  // selection per post, so summing the filtered candidate totals counts
  // each ballot once per post (5x for School, 3x for House) -- see
  // resultsService.ts filterArchiveByBranch. Optional: archives saved
  // before this field existed fall back to an estimate.
  totalVotesByBranch?: Partial<Record<Branch, number>>;
  // Set on the archive itself only when a report was narrowed to one
  // branch at read time (see resultsService.ts filterArchiveByBranch) --
  // a stored archive always covers both branches together; this field is
  // never persisted, only present on a filtered response.
  branch?: Branch;
}
