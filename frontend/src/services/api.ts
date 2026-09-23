import axios from 'axios';
import type {
  ActivateRequest,
  ActivateResponse,
  ArchiveReportResponse,
  ArchivesListResponse,
  CurrentReportResponse,
  CurrentRunResponse,
  OfficerCodesResponse,
  PollResponse,
  PostsResponse,
  ResultsResponse,
  RunLogResponse,
  RunsListResponse,
  LogSearchFilter,
  LogSearchResponse,
  StorageHealth,
  VoteRequest,
  VoteResponse,
  SetElectionTypeRequest,
  ElectionRun,
  BulkAllotment,
  BulkAllotResponse
} from '../types/api';
import type { ElectionType } from '../types/election';
import type { Branch, HouseId } from '../types/election';

const api = axios.create({
  baseURL: '/api'
});

// Identifies this browser tab to the backend's single-admin-console lock
// (see backend/src/services/adminSessionService.ts) -- separate from the
// admin secret, which is a shared password everyone with access knows.
// Stored in sessionStorage so it survives a page refresh within the same
// tab (and is copied into report tabs opened via window.open) but a
// genuinely different tab/terminal always gets its own id.
const ADMIN_CLIENT_ID_KEY = 'adminClientId';

const getAdminClientId = (): string => {
  let clientId = sessionStorage.getItem(ADMIN_CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    sessionStorage.setItem(ADMIN_CLIENT_ID_KEY, clientId);
  }
  return clientId;
};

api.defaults.headers.common['x-admin-client-id'] = getAdminClientId();

// A short, automatically-derived "what kind of device is this" tag (e.g.
// "Chrome / Windows") sent as the admin session's label -- see
// verifyAdminSecret below. There's deliberately no UI to type a name here
// (removed 2026-09-23: asking for one on the login screen added friction
// for no real benefit); this keeps the Activity Log and takeover messages
// readable without asking anyone to fill anything in. The trailing id
// fragment disambiguates two sessions that happen to share the same
// browser/OS combination.
const ADMIN_DEVICE_TAG_KEY = 'adminDeviceTag';

const describeUserAgent = (ua: string): string => {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'Mac'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'device';
  return `${browser} / ${os}`;
};

const getDeviceTag = (): string => {
  let tag = sessionStorage.getItem(ADMIN_DEVICE_TAG_KEY);
  if (!tag) {
    tag = `${describeUserAgent(navigator.userAgent)} · ${getAdminClientId().slice(0, 4)}`;
    sessionStorage.setItem(ADMIN_DEVICE_TAG_KEY, tag);
  }
  return tag;
};

// Set by AdminLandingPage (and ReportPage) so the response interceptor
// below can force a logout the moment any admin request comes back
// rejected because this tab lost the single-admin-console slot -- i.e. it
// was taken over from another device (the slot never expires on its own).
let onAdminSessionLost: (() => void) | null = null;
export const setAdminSessionLostHandler = (handler: (() => void) | null): void => {
  onAdminSessionLost = handler;
};

// Surface the backend's human-readable "error" message instead of axios's
// generic "Request failed with status code 4xx" text.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error?.response?.data?.error;
    const serverCode = error?.response?.data?.code;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      error.message = serverMessage;
    } else if (!error?.response) {
      error.message = 'Could not reach the server. Please check your network connection and try again.';
    }
    // Named `errorCode` (not `.code`) so it doesn't collide with axios's own
    // built-in error.code (e.g. "ERR_BAD_REQUEST").
    if (typeof serverCode === 'string') {
      error.errorCode = serverCode;
    }
    if (serverCode === 'ADMIN_SESSION_LOST') {
      onAdminSessionLost?.();
    }
    return Promise.reject(error);
  }
);

export const fetchPosts = async (house?: HouseId, branch?: Branch): Promise<PostsResponse> => {
  const params = { ...(house ? { house } : {}), ...(branch ? { branch } : {}) };
  const response = await api.get<PostsResponse>('/posts', { params });
  return response.data;
};

export const activateKiosk = async (secret: string): Promise<ActivateResponse> => {
  const payload: ActivateRequest = { secret };
  const response = await api.post<ActivateResponse>('/kiosk/activate', payload);
  return response.data;
};

export const submitVote = async (
  token: string,
  payload: VoteRequest
): Promise<VoteResponse> => {
  const response = await api.post<VoteResponse>('/votes', payload, {
    headers: {
      'x-kiosk-token': token
    }
  });
  return response.data;
};

export const deactivateKiosk = async (token: string): Promise<void> => {
  await api.post('/kiosk/deactivate', { token });
};

export const closeBooth = async (secret: string): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>('/kiosk/close-booth', { secret: secret.trim() });
  return response.data;
};

export const getPollStatus = async (): Promise<PollResponse> => {
  const response = await api.get<PollResponse>('/poll');
  return response.data;
};

// `force` deliberately evicts another terminal that currently holds the
// single admin-console slot -- see ADMIN_SESSION_CONFLICT handling in
// AdminLandingPage. Only pass it after the user has explicitly confirmed
// a takeover. The device tag (see getDeviceTag above) is sent automatically
// as the session's label, so the Activity Log and takeover messages have
// something more readable than a raw client id, with no login-screen field
// to fill in.
export const verifyAdminSecret = async (adminSecret: string, force = false): Promise<void> => {
  await api.post('/admin/verify', { label: getDeviceTag() }, {
    headers: {
      'x-admin-secret': adminSecret,
      ...(force ? { 'x-admin-force': 'true' } : {})
    }
  });
};

// Frees this terminal's hold on the admin-console slot immediately -- since
// the slot never expires on its own, this is the only voluntary way to let
// another terminal log in without forcing a takeover.
export const logoutAdmin = async (): Promise<void> => {
  await api.post('/admin/logout').catch(() => {
    // Best-effort -- the local session is cleared either way (see
    // AdminLandingPage.handleLogout), and the slot will free itself once
    // this tab stops sending heartbeats regardless.
  });
};

export const getStorageHealth = async (adminSecret: string): Promise<StorageHealth> => {
  const response = await api.get<StorageHealth>('/admin/storage-health', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

const updatePoll = async (action: 'open' | 'close', adminSecret: string): Promise<PollResponse> => {
  const response = await api.post<PollResponse>(`/poll/${action}`, undefined, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
  return response.data;
};

export const openPoll = (adminSecret: string): Promise<PollResponse> => updatePoll('open', adminSecret);

export const closePoll = (adminSecret: string): Promise<PollResponse> => updatePoll('close', adminSecret);

export const resetPoll = async (adminSecret: string, name?: string): Promise<PollResponse> => {
  const response = await api.post<PollResponse>('/poll/reset', name ? { name } : undefined, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
  return response.data;
};

export const setElectionType = async (
  electionType: 'school' | 'house',
  adminSecret: string,
  name?: string
): Promise<PollResponse> => {
  const response = await api.post<PollResponse>(
    '/poll/set-type',
    { electionType, name } as SetElectionTypeRequest & { name?: string },
    {
      headers: {
        'x-admin-secret': adminSecret
      }
    }
  );
  return response.data;
};

export const getResults = async (house?: HouseId, branch?: Branch): Promise<ResultsResponse> => {
  const params = { ...(house ? { house } : {}), ...(branch ? { branch } : {}) };
  const response = await api.get<ResultsResponse>('/results', { params });
  return response.data;
};

export const getOfficerCodes = async (adminSecret: string): Promise<OfficerCodesResponse> => {
  const response = await api.get<OfficerCodesResponse>('/officer-codes', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const generateOfficerCodes = async (
  count: number,
  adminSecret: string,
  house?: HouseId,
  branch?: Branch
): Promise<OfficerCodesResponse> => {
  const response = await api.post<OfficerCodesResponse>(
    '/officer-codes/generate',
    { count, ...(house ? { house } : {}), ...(branch ? { branch } : {}) },
    { headers: { 'x-admin-secret': adminSecret } }
  );
  return response.data;
};

// "Bulk Allot from List" -- one call generates+names a code for every
// allotment (up to 2 per teacher: School and/or House). See
// utils/bulkAllot.ts for turning a spreadsheet into `allotments`.
export const bulkAllotOfficerCodes = async (
  branch: Branch,
  allotments: BulkAllotment[],
  adminSecret: string
): Promise<BulkAllotResponse> => {
  const response = await api.post<BulkAllotResponse>(
    '/officer-codes/bulk-allot',
    { branch, allotments },
    { headers: { 'x-admin-secret': adminSecret } }
  );
  return response.data;
};

export const reopenOfficerCode = async (code: string, adminSecret: string): Promise<void> => {
  await api.post(`/officer-codes/${code}/reopen`, undefined, {
    headers: { 'x-admin-secret': adminSecret }
  });
};

export const updateOfficerCode = async (
  code: string,
  updates: { officerName?: string; label?: string },
  adminSecret: string
): Promise<void> => {
  await api.put(`/officer-codes/${code}`, updates, {
    headers: { 'x-admin-secret': adminSecret }
  });
};

export const deleteOfficerCode = async (code: string, adminSecret: string): Promise<void> => {
  await api.delete(`/officer-codes/${code}`, {
    headers: { 'x-admin-secret': adminSecret }
  });
};

export const updateCandidate = async (
  candidateId: string,
  updates: { name?: string; imageUrl?: string },
  adminSecret: string
): Promise<void> => {
  await api.put(`/candidates/${candidateId}`, updates, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
};

export const addCandidate = async (
  candidate: { id: string; name: string; post: string; electionType?: 'school' | 'house'; house?: HouseId; branch?: Branch },
  adminSecret: string
): Promise<void> => {
  await api.post('/candidates', candidate, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
};

export const deleteCandidate = async (
  candidateId: string,
  adminSecret: string
): Promise<void> => {
  await api.delete(`/candidates/${candidateId}`, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
};

export const getCurrentReport = async (adminSecret: string, branch?: Branch): Promise<CurrentReportResponse> => {
  const response = await api.get<CurrentReportResponse>('/report/current', {
    params: branch ? { branch } : undefined,
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

// Saves the current results to Election History without touching any
// votes -- unlike Reset Poll / Switch Election Type, which only archive as
// a side effect of clearing votes.
export const saveElectionToHistory = async (adminSecret: string, name?: string): Promise<void> => {
  await api.post('/report/archives', name ? { name } : undefined, {
    headers: { 'x-admin-secret': adminSecret }
  });
};

export const getArchivesList = async (adminSecret: string): Promise<ArchivesListResponse> => {
  const response = await api.get<ArchivesListResponse>('/report/archives', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const getArchive = async (id: string, adminSecret: string, branch?: Branch): Promise<ArchiveReportResponse> => {
  const response = await api.get<ArchiveReportResponse>(`/report/archives/${id}`, {
    params: branch ? { branch } : undefined,
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const renameArchive = async (id: string, name: string, adminSecret: string): Promise<void> => {
  await api.put(`/report/archives/${id}`, { name }, {
    headers: { 'x-admin-secret': adminSecret }
  });
};

export const deleteArchive = async (id: string, adminSecret: string): Promise<void> => {
  await api.delete(`/report/archives/${id}`, {
    headers: { 'x-admin-secret': adminSecret }
  });
};

// "Start Recording" / "Close Recording" (ROADMAP.md Phase 3). See
// backend/src/services/runService.ts for exactly what each does.
export const getCurrentRun = async (adminSecret: string): Promise<CurrentRunResponse> => {
  const response = await api.get<CurrentRunResponse>('/election-runs/current', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const getRuns = async (adminSecret: string): Promise<RunsListResponse> => {
  const response = await api.get<RunsListResponse>('/election-runs', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const getRunLog = async (runId: string, adminSecret: string): Promise<RunLogResponse> => {
  const response = await api.get<RunLogResponse>(`/election-runs/${runId}/log`, {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

// "Ask your data" -- filters the permanent action log across any run (or a
// specific one), by election type, branch, actor, action, or code. See
// datastore.ts's searchLogEntries for exact filter semantics (substring,
// case-insensitive, all filters combine with AND).
export const searchRunLog = async (filter: LogSearchFilter, adminSecret: string): Promise<LogSearchResponse> => {
  const params = {
    ...(filter.runId ? { runId: filter.runId } : {}),
    ...(filter.electionType ? { electionType: filter.electionType } : {}),
    ...(filter.branch ? { branch: filter.branch } : {}),
    ...(filter.actor ? { actor: filter.actor } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.code ? { code: filter.code } : {}),
    ...(filter.adminOnly ? { adminOnly: 'true' } : {})
  };
  const response = await api.get<LogSearchResponse>('/election-runs/log/search', {
    params,
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const startRecording = async (
  electionType: ElectionType,
  name: string,
  adminSecret: string
): Promise<ElectionRun> => {
  const response = await api.post<{ run: ElectionRun }>(
    '/election-runs/start',
    { electionType, name },
    { headers: { 'x-admin-secret': adminSecret } }
  );
  return response.data.run;
};

export const closeRecording = async (adminSecret: string): Promise<ElectionRun> => {
  const response = await api.post<{ run: ElectionRun }>('/election-runs/close', undefined, {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data.run;
};
