import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { Firestore } from '@google-cloud/firestore';
import { env } from '../config/env.js';
import { DEFAULT_CANDIDATES, POST_IDS, SCHOOL_POST_IDS, HOUSE_POST_IDS } from '../config/posts.js';
import { generateUniqueCodes } from '../utils/officerCode.js';
import { Candidate, PollState, StoredVote, ElectionType, OfficerCode } from '../types/election.js';

// Single document holds the whole election state. This keeps the in-memory,
// synchronous DataStore API unchanged; only the persistence backend differs.
// Because state lives in memory, the service must run with a single Cloud Run
// instance (max-instances=1) so concurrent instances never diverge.
const FIRESTORE_COLLECTION = 'school-election';
const FIRESTORE_DOC_ID = 'state';

interface ElectionData {
  candidates: Candidate[];
  votes: StoredVote[];
  pollState: PollState;
  officerCodes: OfficerCode[];
}

const cloneCandidates = (candidates: Candidate[]): Candidate[] =>
  candidates.map((candidate) => ({ ...candidate }));

const createDefaultPollState = (): PollState => ({
  activeElectionType: null,
  settings: {
    isOpen: false,
    allowRevote: false
  },
  secretKey: env.kioskSecret
});

const createDefaultData = (): ElectionData => ({
  candidates: cloneCandidates(DEFAULT_CANDIDATES),
  votes: [],
  pollState: createDefaultPollState(),
  officerCodes: []
});

const isCandidate = (value: unknown): value is Candidate => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Candidate;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.post === 'string' &&
    (candidate.electionType === 'school' || candidate.electionType === 'house')
  );
};

const isStoredVote = (value: unknown): value is StoredVote => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const vote = value as StoredVote;
  return (
    typeof vote.id === 'string' &&
    typeof vote.timestamp === 'number' &&
    (vote.electionType === 'school' || vote.electionType === 'house') &&
    vote.selections !== undefined &&
    typeof vote.selections === 'object'
  );
};

const isOfficerCode = (value: unknown): value is OfficerCode => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as OfficerCode;
  return typeof entry.code === 'string' && typeof entry.officerName === 'string' && typeof entry.createdAt === 'number';
};

export class DataStore {
  private data: ElectionData = createDefaultData();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath = env.dataFile;
  private readonly firestore = env.useFirestore ? new Firestore() : null;

  async init(): Promise<void> {
    await this.load();
    this.ensureCandidateCoverage();
    await this.flush();
  }

  private async load(): Promise<void> {
    if (this.firestore) {
      await this.loadFromFirestore();
    } else {
      await this.loadFromDisk();
    }
  }

  private async loadFromFirestore(): Promise<void> {
    const snapshot = await this.firestore!.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).get();
    if (snapshot.exists) {
      this.data = this.mergeWithDefaults((snapshot.data() as Partial<ElectionData>) ?? {});
    } else {
      this.data = createDefaultData();
      await this.persist();
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ElectionData>;
      this.data = this.mergeWithDefaults(parsed ?? {});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.data = createDefaultData();
        await this.persist();
      } else {
        throw error;
      }
    }
  }

  private mergeWithDefaults(parsed: Partial<ElectionData>): ElectionData {
    const defaults = createDefaultData();

    if (
      Array.isArray(parsed.candidates) &&
      parsed.candidates.length > 0 &&
      parsed.candidates.every((candidate) => isCandidate(candidate))
    ) {
      defaults.candidates = cloneCandidates(parsed.candidates);
    }

    if (Array.isArray(parsed.votes) && parsed.votes.every((vote) => isStoredVote(vote))) {
      defaults.votes = parsed.votes.map((vote) => ({
        id: vote.id,
        timestamp: vote.timestamp,
        electionType: vote.electionType,
        house: vote.house,
        officerCode: vote.officerCode,
        selections: { ...vote.selections }
      }));
    }

    if (Array.isArray(parsed.officerCodes) && parsed.officerCodes.every((entry) => isOfficerCode(entry))) {
      defaults.officerCodes = parsed.officerCodes.map((entry) => ({ ...entry }));
    }

    if (parsed.pollState && typeof parsed.pollState === 'object') {
      const pollState = parsed.pollState as Partial<PollState>;
      const basePollState = defaults.pollState;
      defaults.pollState = {
        activeElectionType: pollState.activeElectionType === 'school' || pollState.activeElectionType === 'house' 
          ? pollState.activeElectionType 
          : (basePollState.activeElectionType ?? null),
        secretKey: typeof pollState.secretKey === 'string' ? pollState.secretKey : basePollState.secretKey,
        settings: {
          isOpen: pollState.settings?.isOpen ?? basePollState.settings.isOpen,
          allowRevote: pollState.settings?.allowRevote ?? basePollState.settings.allowRevote
        }
      };
    }

    return defaults;
  }

  private async persist(): Promise<void> {
    if (this.firestore) {
      await this.firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).set(JSON.parse(JSON.stringify(this.data)));
      return;
    }
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private queuePersist(): void {
    this.writeQueue = this.writeQueue
      .then(() => this.persist())
      .catch((error) => {
        console.error('Failed to persist election data', error);
      });
  }

  private async flush(): Promise<void> {
    await this.writeQueue;
  }

  private ensureCandidateCoverage(): void {
    // Ensure school posts have at least one candidate
    const schoolCandidates = this.data.candidates.filter((c) => c.electionType === 'school');
    const schoolPostsWithCandidates = new Set(schoolCandidates.map((c) => c.post));
    for (const post of SCHOOL_POST_IDS) {
      if (!schoolPostsWithCandidates.has(post)) {
        this.data.candidates.push({
          id: post.toLowerCase() + '-placeholder',
          name: post + ' Candidate',
          post,
          electionType: 'school'
        });
      }
    }

    // Ensure house posts have at least one candidate per house
    const houseCandidates = this.data.candidates.filter((c) => c.electionType === 'house');
    // We'll rely on admin to add house candidates, so we don't auto-create placeholders
    // as that would create 8 houses × 3 posts = 24 candidates automatically
  }

  getCandidates(): Candidate[] {
    return this.data.candidates.map((candidate) => ({ ...candidate }));
  }

  setCandidates(candidates: Candidate[]): void {
    this.data.candidates = cloneCandidates(candidates);
    this.ensureCandidateCoverage();
    this.queuePersist();
  }

  getPollState(): PollState {
    return {
      activeElectionType: this.data.pollState.activeElectionType ?? null,
      secretKey: this.data.pollState.secretKey,
      settings: { ...this.data.pollState.settings }
    };
  }

  updatePollState(updater: (state: PollState) => PollState): PollState {
    this.data.pollState = updater(this.getPollState());
    this.queuePersist();
    return this.getPollState();
  }

  addVote(selections: StoredVote['selections'], electionType: ElectionType, house?: string, officerCode?: string): StoredVote {
    const vote: StoredVote = {
      id: randomUUID(),
      timestamp: Date.now(),
      electionType,
      house: house as StoredVote['house'],
      officerCode,
      selections: { ...selections }
    };
    this.data.votes.push(vote);
    this.queuePersist();
    return vote;
  }

  getVotes(): StoredVote[] {
    return this.data.votes.map((vote) => ({
      id: vote.id,
      timestamp: vote.timestamp,
      electionType: vote.electionType,
      house: vote.house,
      officerCode: vote.officerCode,
      selections: { ...vote.selections }
    }));
  }

  resetVotes(): void {
    this.data.votes = [];
    this.queuePersist();
  }

  countVotesByOfficerCode(code: string): number {
    return this.data.votes.filter((vote) => vote.officerCode === code).length;
  }

  getOfficerCodes(): OfficerCode[] {
    return this.data.officerCodes.map((entry) => ({ ...entry }));
  }

  findOfficerCode(code: string): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => item.code === code);
    return entry ? { ...entry } : undefined;
  }

  generateOfficerCodes(count: number): OfficerCode[] {
    const newCodes = generateUniqueCodes(count, this.data.officerCodes.map((entry) => entry.code));
    const createdAt = Date.now();
    const entries: OfficerCode[] = newCodes.map((code) => ({ code, officerName: '', createdAt }));
    this.data.officerCodes.push(...entries);
    this.queuePersist();
    return entries;
  }

  updateOfficerCode(code: string, updates: { officerName?: string; label?: string }): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => item.code === code);
    if (!entry) {
      return undefined;
    }
    if (updates.officerName !== undefined) {
      entry.officerName = updates.officerName;
    }
    if (updates.label !== undefined) {
      entry.label = updates.label;
    }
    this.queuePersist();
    return { ...entry };
  }

  deleteOfficerCode(code: string): void {
    this.data.officerCodes = this.data.officerCodes.filter((entry) => entry.code !== code);
    this.queuePersist();
  }
}

export const dataStore = new DataStore();
