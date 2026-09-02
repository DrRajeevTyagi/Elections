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
  stationVoteCount?: number;
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
  label?: string;
  createdAt: number;
  voteCount: number;
}

export interface OfficerCodesResponse {
  codes: OfficerCode[];
}
