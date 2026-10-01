import type { Candidate, PostCandidateGroup, PostId, ElectionType, HouseId, Branch } from './election';

export interface PostsResponse {
  posts: PostCandidateGroup[];
}

export interface ActivateRequest {
  secret: string;
}

export interface ActivateResponse {
  token: string;
  officerName?: string;
  house?: HouseId;
  branch?: Branch;
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
  // True only while an election is actually in progress (a run is active)
  // -- activeElectionType can stay set even once nothing is running, so
  // the "Election for X Posts" banner (AppLayout.tsx) must gate on this,
  // not on activeElectionType alone.
  hasActiveRun: boolean;
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
  totalVotes: number;
}

export interface OfficerCode {
  code: string;
  officerName: string;
  electionType?: ElectionType;
  house?: HouseId;
  createdAt: number;
  closedAt?: number;
  voteCount: number;
  branch?: Branch;
  everNamed?: boolean;
  runId?: string;
  phone?: string; // WhatsApp number, digits with country code
  sentAt?: number; // when last marked as sent on WhatsApp
  // Set once a re-poll was ordered at this booth -- its votes no longer
  // count (voteCount is 0) and the code can never be used again.
  repoll?: RepollRecord;
  // On the fresh code issued for a re-poll: the code it replaces.
  replacesCode?: string;
}

export type RepollReason = 'irregularity' | 'disruption' | 'count-mismatch' | 'other';

export const REPOLL_REASON_LABELS: Record<RepollReason, string> = {
  irregularity: 'Irregularity at the booth',
  disruption: 'Physical disruption',
  'count-mismatch': 'Vote count mismatch',
  other: 'Other'
};

export interface RepollRecord {
  orderedAt: number;
  orderedBy: string;
  reason: RepollReason;
  note: string;
  cancelledVoteCount: number;
  replacementCode: string;
  runId?: string;
}

// "Bulk Allot from List" (Officer Codes tab) -- see utils/bulkAllot.ts for
// how a teacher spreadsheet turns into an Allotment array.
export interface BulkAllotment {
  officerName: string;
  electionType: ElectionType;
  house?: HouseId;
  phone?: string;
}

export interface BulkAllotedCode {
  code: string;
  officerName: string;
  electionType: ElectionType;
  house?: HouseId;
  branch?: Branch;
}

export interface BulkAllotResponse {
  codes: BulkAllotedCode[];
}

// Asking the device in control of the admin console to hand over (see
// backend services/adminSessionService.ts).
export type TakeoverStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';

export interface TakeoverRequestInfo {
  id: string;
  label?: string;
  createdAt: number;
  expiresAt: number;
  status: TakeoverStatus;
}

export interface PendingTakeoverRequest {
  id: string;
  label?: string;
  createdAt: number;
  expiresAt: number;
}

// errorDetails on an ADMIN_SESSION_CONFLICT login error.
export interface AdminSessionConflictDetails {
  holderLabel?: string;
  activeSince?: number;
  takeableAt?: number;
}

export type RunStatus = 'running' | 'closed';

export interface ElectionRun {
  id: string;
  electionType: ElectionType;
  name: string;
  status: RunStatus;
  startedAt: number;
  startedBy: string;
  closedAt?: number;
  closedBy?: string;
  archiveIds?: string[];
}

export interface CurrentRunResponse {
  run: ElectionRun | null;
}

export interface RunsListResponse {
  runs: ElectionRun[];
}

export interface LogEntry {
  id: string;
  timestamp: number;
  runId: string;
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  electionType?: ElectionType;
  branch?: Branch;
}

// "Ask your data" search filters (all optional, combine with AND) -- see
// backend/src/storage/datastore.ts's searchLogEntries for exact semantics.
export interface LogSearchFilter {
  runId?: string;
  electionType?: ElectionType;
  branch?: Branch;
  actor?: string;
  action?: string;
  code?: string;
  adminOnly?: boolean;
}

export interface LogSearchResponse {
  entries: LogEntry[];
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
  branch?: Branch;
}

export interface ArchivedOfficerCode {
  code: string;
  officerName: string;
  voteCount: number; // votes that count -- 0 for a re-polled booth
  branch?: Branch;
  cancelledVoteCount?: number;
  repollReason?: RepollReason;
  repollNote?: string;
  replacementCode?: string;
  replacesCode?: string;
}

export interface ElectionReport {
  id: string;
  archivedAt: number;
  electionType: ElectionType;
  totalVotes: number;
  results: ArchivedCandidateResult[];
  officerCodes: ArchivedOfficerCode[];
  name?: string;
  // Set only when the report was narrowed to one branch at read time --
  // see api.ts getCurrentReport/getArchive.
  branch?: Branch;
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
