import axios from 'axios';
import type {
  ActivateRequest,
  ActivateResponse,
  PollResponse,
  PostsResponse,
  ResultsResponse,
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
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      error.message = serverMessage;
    } else if (!error?.response) {
      error.message = 'Could not reach the server. Please check your network connection and try again.';
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

export const getPollStatus = async (): Promise<PollResponse> => {
  const response = await api.get<PollResponse>('/poll');
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

export const updateCandidate = async (
  candidateId: string,
  updates: { name?: string; manifesto?: string; imageUrl?: string },
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
