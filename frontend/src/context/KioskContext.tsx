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
  expiresAt?: number;
  status: KioskStatus;
  error?: string;
  posts: PostCandidateGroup[];
  selections: Record<PostId, string | null>;
  confirmation?: VoteConfirmation;
  stationVoteCount?: number;
  setHouse: (house: HouseId | null) => void;
  activate: (secret: string, houseOverride?: HouseId) => Promise<void>;
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
  const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);
  // Deliberately kept separate from `confirmation` (and not cleared by reset())
  // so the station's running tally stays visible on-device across every
  // "Finish" -> next voter cycle, not just on the post-vote confirmation screen.
  const [stationVoteCount, setStationVoteCount] = useState<number | undefined>(undefined);

  const setHouse = useCallback((newHouse: HouseId | null) => {
    setHouseState(newHouse);
  }, []);

  const activate = useCallback(async (secret: string, houseOverride?: HouseId) => {
    setStatus('activating');
    setError(undefined);
    setConfirmation(undefined);

    try {
      const requestedHouse = houseOverride ?? house ?? undefined;
      const {
        token: sessionToken,
        officerName: activatedOfficerName,
        // The server resolves the house from the code itself when the code
        // is house-bound, which may differ from (or be absent from) what we
        // requested -- always trust the response over our own guess.
        house: resolvedHouse,
        stationVoteCount: activatedStationVoteCount,
        expiresAt: sessionExpiresAt
      } = await activateKiosk(secret.trim(), requestedHouse);
      const effectiveHouse = resolvedHouse ?? requestedHouse;
      const { posts: fetchedPosts } = await fetchPosts(effectiveHouse);
      if (effectiveHouse) {
        setHouseState(effectiveHouse);
      }
      setToken(sessionToken);
      setOfficerName(activatedOfficerName);
      setExpiresAt(sessionExpiresAt);
      setStationVoteCount(activatedStationVoteCount);
      setPosts(fetchedPosts);
      setSelections(createEmptySelections(fetchedPosts));
      setStatus('ready');
    } catch (activationError) {
      setToken(null);
      setExpiresAt(undefined);
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
      setStationVoteCount(response.stationVoteCount);
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
    setExpiresAt(undefined);
    // Deliberately not clearing house here - it persists for the polling booth
    // across every voter, not just the first.
    setOfficerName(undefined);
    setPosts([]);
    setSelections({} as Record<PostId, string | null>);
    setConfirmation(undefined);
    setStatus('idle');
    setError(undefined);
  }, [token]);

  const value = useMemo<KioskContextValue>(
    () => ({
      token,
      house,
      officerName,
      expiresAt,
      status,
      error,
      posts,
      selections,
      confirmation,
      stationVoteCount,
      setHouse,
      activate,
      updateSelection,
      submit,
      reset
    }),
    [
      activate,
      confirmation,
      error,
      expiresAt,
      house,
      officerName,
      posts,
      reset,
      selections,
      setHouse,
      status,
      stationVoteCount,
      submit,
      token,
      updateSelection
    ]
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
