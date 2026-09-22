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
