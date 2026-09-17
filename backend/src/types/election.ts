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

export interface Candidate {
  id: string;
  name: string;
  post: PostId;
  electionType: ElectionType;
  house?: HouseId; // Required for house elections
  manifesto?: string;
  imageUrl?: string;
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
}

export interface OfficerCode {
  code: string;
  officerName: string;
  label?: string;
  house?: HouseId; // Bound house for a house-election code; undefined works for any house (legacy/manual flow)
  createdAt: number;
  closedAt?: number; // Set when the polling officer closes this booth; blocks further activations
}

export interface PollState {
  activeElectionType: ElectionType | null;
  settings: PollSettings;
}

// A permanent snapshot of one election's results, taken automatically right
// before "Reset Poll" clears the live votes. Deliberately excludes candidate
// photos/manifesto -- only ids/names/counts -- so archives stay small.
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
}
