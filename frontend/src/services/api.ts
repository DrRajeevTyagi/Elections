import axios from 'axios';
import type {
  ActivateRequest,
  ActivateResponse,
  ArchiveReportResponse,
  ArchivesListResponse,
  CurrentReportResponse,
  OfficerCodesResponse,
  PollResponse,
  PostsResponse,
  ResultsResponse,
  StorageHealth,
  VoteRequest,
  VoteResponse,
  SetElectionTypeRequest
} from '../types/api';
import type { HouseId } from '../types/election';

const api = axios.create({
  baseURL: '/api'
});

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
    return Promise.reject(error);
  }
);

export const fetchPosts = async (house?: HouseId): Promise<PostsResponse> => {
  const params = house ? { house } : {};
  const response = await api.get<PostsResponse>('/posts', { params });
  return response.data;
};

export const activateKiosk = async (secret: string, house?: HouseId): Promise<ActivateResponse> => {
  const payload: ActivateRequest = { secret };
  if (house) {
    payload.house = house;
  }
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

export const verifyAdminSecret = async (adminSecret: string): Promise<void> => {
  await api.post('/admin/verify', undefined, {
    headers: {
      'x-admin-secret': adminSecret
    }
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

export const resetPoll = async (adminSecret: string): Promise<PollResponse> => {
  const response = await api.post<PollResponse>('/poll/reset', undefined, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
  return response.data;
};

export const setElectionType = async (
  electionType: 'school' | 'house',
  adminSecret: string
): Promise<PollResponse> => {
  const response = await api.post<PollResponse>('/poll/set-type', { electionType } as SetElectionTypeRequest, {
    headers: {
      'x-admin-secret': adminSecret
    }
  });
  return response.data;
};

export const getResults = async (house?: HouseId): Promise<ResultsResponse> => {
  const params = house ? { house } : {};
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
  house?: HouseId
): Promise<OfficerCodesResponse> => {
  const response = await api.post<OfficerCodesResponse>(
    '/officer-codes/generate',
    house ? { count, house } : { count },
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
  candidate: { id: string; name: string; post: string; electionType?: 'school' | 'house'; house?: HouseId },
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

export const getCurrentReport = async (adminSecret: string): Promise<CurrentReportResponse> => {
  const response = await api.get<CurrentReportResponse>('/report/current', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const getArchivesList = async (adminSecret: string): Promise<ArchivesListResponse> => {
  const response = await api.get<ArchivesListResponse>('/report/archives', {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};

export const getArchive = async (id: string, adminSecret: string): Promise<ArchiveReportResponse> => {
  const response = await api.get<ArchiveReportResponse>(`/report/archives/${id}`, {
    headers: { 'x-admin-secret': adminSecret }
  });
  return response.data;
};
