import type { Candidate, PostCandidateGroup, PostId, ElectionType, HouseId } from './election';

export interface PostsResponse {
  posts: PostCandidateGroup[];
}

export interface ActivateRequest {
  secret: string;
  house?: HouseId;
}

export interface ActivateResponse {
  token: string;
  officerName?: string;
  house?: HouseId;
  stationVoteCount?: number;
  expiresAt?: number;
}

export interface VoteRequest {
  selections: Record<PostId, string>;
}

export interface VoteResponse {
  voteId: string;
  timestamp: number;
  stationVoteCount?: number;
}

export interface PollStatus {
  activeElectionType: ElectionType | null;
  settings: {
    isOpen: boolean;
    allowRevote: boolean;
  };
}

export interface PollResponse {
  poll: PollStatus;
}

export interface StorageHealth {
  ok: boolean;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError?: string;
}

export interface SetElectionTypeRequest {
  electionType: ElectionType;
}

export interface CandidateResult {
  candidate: Candidate;
  total: number;
}

export interface PostResult {
  post: PostId;
  candidates: CandidateResult[];
}

export interface ResultsResponse {
  results: PostResult[];
}

export interface OfficerCode {
  code: string;
  officerName: string;
  house?: HouseId;
  createdAt: number;
  closedAt?: number;
  voteCount: number;
}

export interface OfficerCodesResponse {
  codes: OfficerCode[];
}

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

export interface ElectionReport {
  id: string;
  archivedAt: number;
  electionType: ElectionType;
  totalVotes: number;
  results: ArchivedCandidateResult[];
  officerCodes: ArchivedOfficerCode[];
  name?: string;
}

export interface ArchiveSummary {
  id: string;
  archivedAt: number;
  electionType: ElectionType;
  totalVotes: number;
  name?: string;
}

export interface CurrentReportResponse {
  report: ElectionReport | null;
}

export interface ArchiveReportResponse {
  report: ElectionReport;
}

export interface ArchivesListResponse {
  archives: ArchiveSummary[];
}
