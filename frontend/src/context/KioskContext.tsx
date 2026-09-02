import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { activateKiosk, deactivateKiosk, fetchPosts, submitVote } from '../services/api';
import type { PostCandidateGroup, PostId, HouseId } from '../types/election';

export type KioskStatus = 'idle' | 'activating' | 'ready' | 'submitting' | 'completed' | 'error';

interface VoteConfirmation {
  voteId: string;
  timestamp: number;
  stationVoteCount?: number;
}

interface KioskContextValue {
  token: string | null;
  house: HouseId | null;
  officerName?: string;
  status: KioskStatus;
  error?: string;
  posts: PostCandidateGroup[];
  selections: Record<PostId, string | null>;
  confirmation?: VoteConfirmation;
  setHouse: (house: HouseId | null) => void;
  activate: (secret: string) => Promise<void>;
  updateSelection: (post: PostId, candidateId: string) => void;
  submit: () => Promise<void>;
  reset: () => Promise<void>;
}

const KioskContext = createContext<KioskContextValue | undefined>(undefined);

const createEmptySelections = (posts: PostCandidateGroup[]): Record<PostId, string | null> => {
  return posts.reduce((acc, group) => {
    acc[group.post] = null;
    return acc;
  }, {} as Record<PostId, string | null>);
};

export const KioskProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [token, setToken] = useState<string | null>(null);
  const [house, setHouseState] = useState<HouseId | null>(null);
  const [status, setStatus] = useState<KioskStatus>('idle');
  const [error, setError] = useState<string | undefined>(undefined);
  const [posts, setPosts] = useState<PostCandidateGroup[]>([]);
  const [selections, setSelections] = useState<Record<PostId, string | null>>({} as Record<PostId, string | null>);
  const [confirmation, setConfirmation] = useState<VoteConfirmation | undefined>(undefined);
  const [officerName, setOfficerName] = useState<string | undefined>(undefined);

  const setHouse = useCallback((newHouse: HouseId | null) => {
    setHouseState(newHouse);
  }, []);

  const activate = useCallback(async (secret: string) => {
    setStatus('activating');
    setError(undefined);
    setConfirmation(undefined);

    try {
      const { token: sessionToken, officerName: activatedOfficerName } = await activateKiosk(secret.trim(), house || undefined);
      const { posts: fetchedPosts } = await fetchPosts(house || undefined);
      setToken(sessionToken);
      setOfficerName(activatedOfficerName);
      setPosts(fetchedPosts);
      setSelections(createEmptySelections(fetchedPosts));
      setStatus('ready');
    } catch (activationError) {
      setToken(null);
      setPosts([]);
      setSelections({} as Record<PostId, string | null>);
      setStatus('error');
      setError(activationError instanceof Error ? activationError.message : 'Activation failed');
      throw activationError;
    }
  }, [house]);

  const updateSelection = useCallback((post: PostId, candidateId: string) => {
    setSelections((prev) => ({
      ...prev,
      [post]: candidateId
    }));
  }, []);

  const submit = useCallback(async () => {
    if (!token) {
      throw new Error('Ballot has not been activated');
    }

    setStatus('submitting');
    setError(undefined);

    try {
      const entries = Object.entries(selections) as [PostId, string | null][];
      if (entries.some(([, candidateId]) => !candidateId)) {
        throw new Error('Please select a candidate for every post.');
      }

      const payload = {
        selections: Object.fromEntries(entries.map(([post, candidateId]) => [post, candidateId!])) as Record<
          PostId,
          string
        >
      };

      const response = await submitVote(token, payload);
      await deactivateKiosk(token);
      setConfirmation({ voteId: response.voteId, timestamp: response.timestamp, stationVoteCount: response.stationVoteCount });
      setStatus('completed');
    } catch (submissionError) {
      setStatus('error');
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to submit vote');
      throw submissionError;
    }
  }, [selections, token]);

  const reset = useCallback(async () => {
    if (token) {
      await deactivateKiosk(token).catch(() => undefined);
    }
    setToken(null);
    setHouseState(null); // Don't reset house - it persists for the polling booth
    setOfficerName(undefined);
    setPosts([]);
    setSelections({} as Record<PostId, string | null>);
    setConfirmation(undefined);
    setStatus('idle');
    setError(undefined);
  }, [token]);

  const value = useMemo<KioskContextValue>(
    () => ({ token, house, officerName, status, error, posts, selections, confirmation, setHouse, activate, updateSelection, submit, reset }),
    [activate, confirmation, error, house, officerName, posts, reset, selections, setHouse, status, submit, token, updateSelection]
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
};

export const useKiosk = (): KioskContextValue => {
  const context = useContext(KioskContext);
  if (!context) {
    throw new Error('useKiosk must be used within a KioskProvider');
  }
  return context;
};
