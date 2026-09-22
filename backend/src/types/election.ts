// School election posts
export type SchoolPostId = 'HB' | 'HG' | 'SSC' | 'SRC' | 'SCC';
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
  // Which election run this code was generated under (see ElectionRun
  // below). Undefined for codes generated before this feature existed, or
  // (in principle) any code generated outside an active run -- generation
  // is gated on an active run matching this code's electionType, so in
  // practice every code generated after this feature ships always has one.
  runId?: string;
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
}

export interface PollState {
  activeElectionType: ElectionType | null;
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
}

export interface ArchivedOfficerCode {
  code: string;
  officerName: string;
  voteCount: number;
}

export interface ElectionArchive {
  id: string;
  archivedAt: number;
  electionType: ElectionType;
  totalVotes: number;
  results: ArchivedCandidateResult[];
  officerCodes: ArchivedOfficerCode[];
  name?: string; // Admin-given label, e.g. "School Council -- Term 1 2026"
  branch?: Branch;
}
