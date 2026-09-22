import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { Firestore } from '@google-cloud/firestore';
import { env } from '../config/env.js';
import { DEFAULT_CANDIDATES } from '../config/posts.js';
import { generateUniqueCodes } from '../utils/officerCode.js';
import { Candidate, PollState, StoredVote, ElectionType, OfficerCode, ElectionArchive, HouseId } from '../types/election.js';

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
  archives: ElectionArchive[];
}

const cloneCandidates = (candidates: Candidate[]): Candidate[] =>
  candidates.map((candidate) => ({ ...candidate }));

const createDefaultPollState = (): PollState => ({
  activeElectionType: null,
  settings: {
    isOpen: false,
    allowRevote: false
  }
});

const createDefaultData = (): ElectionData => ({
  candidates: cloneCandidates(DEFAULT_CANDIDATES),
  votes: [],
  pollState: createDefaultPollState(),
  officerCodes: [],
  archives: []
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

// electionType was added after codes without it could already exist in
// storage. Infer it the same way it's always been implied: a code with a
// house on it was generated for House elections, and one without was
// generated for School elections -- see routes/officerCodes.ts generate.
const normalizeOfficerCode = (entry: OfficerCode): OfficerCode => ({
  ...entry,
  electionType: entry.electionType === 'house' || entry.electionType === 'school'
    ? entry.electionType
    : entry.house
    ? 'house'
    : 'school'
});

const isElectionArchive = (value: unknown): value is ElectionArchive => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const archive = value as ElectionArchive;
  return (
    typeof archive.id === 'string' &&
    typeof archive.archivedAt === 'number' &&
    (archive.electionType === 'school' || archive.electionType === 'house') &&
    typeof archive.totalVotes === 'number' &&
    Array.isArray(archive.results) &&
    Array.isArray(archive.officerCodes)
  );
};

// What the admin dashboard's Storage status indicator reports (see
// routes/admin.ts GET /storage-health). Distinguishes "every write so far
// has landed" from "writes are currently failing" -- the thing a vote count
// alone can't tell you, since a vote is pushed into memory (and so counted)
// before its write to Firestore/disk is even attempted. See queuePersist.
export interface StorageHealth {
  ok: boolean;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError?: string;
}

export class DataStore {
  private data: ElectionData = createDefaultData();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath = env.dataFile;
  private readonly firestore = env.useFirestore ? new Firestore() : null;
  private storageHealth: StorageHealth = { ok: true, lastSuccessAt: null, lastErrorAt: null };

  async init(): Promise<void> {
    await this.load();
    await this.flush();
    this.storageHealth = { ok: true, lastSuccessAt: Date.now(), lastErrorAt: null };
  }

  // Read by the admin dashboard so a human can tell "one write blipped and
  // already recovered" apart from "writes are failing right now" -- the
  // second case means anything in memory but not yet durable (recent votes
  // included) would be lost if this instance restarted before it got
  // through. Polling should stop and get IT help if this stays unhealthy.
  getStorageHealth(): StorageHealth {
    return { ...this.storageHealth };
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
      defaults.officerCodes = parsed.officerCodes.map((entry) => normalizeOfficerCode({ ...entry }));
    }

    if (Array.isArray(parsed.archives) && parsed.archives.every((entry) => isElectionArchive(entry))) {
      defaults.archives = parsed.archives.map((entry) => ({
        ...entry,
        results: entry.results.map((r) => ({ ...r })),
        officerCodes: entry.officerCodes.map((o) => ({ ...o }))
      }));
    }

    if (parsed.pollState && typeof parsed.pollState === 'object') {
      const pollState = parsed.pollState as Partial<PollState>;
      const basePollState = defaults.pollState;
      defaults.pollState = {
        activeElectionType: pollState.activeElectionType === 'school' || pollState.activeElectionType === 'house'
          ? pollState.activeElectionType
          : (basePollState.activeElectionType ?? null),
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

  // Returns a promise for THIS write specifically, so a caller that needs to
  // know a particular change is durable (e.g. a cast vote, before telling
  // the voter it was recorded) can await it. The shared this.writeQueue is
  // kept alive even if this write fails (via the trailing .catch below), so
  // one failed persist never wedges every write after it.
  private queuePersist(): Promise<void> {
    const attempt = this.writeQueue.then(() => this.persist());
    attempt.then(
      () => {
        this.storageHealth = { ok: true, lastSuccessAt: Date.now(), lastErrorAt: this.storageHealth.lastErrorAt };
      },
      (error) => {
        console.error('Failed to persist election data', error);
        this.storageHealth = {
          ok: false,
          lastSuccessAt: this.storageHealth.lastSuccessAt,
          lastErrorAt: Date.now(),
          lastError: error instanceof Error ? error.message : String(error)
        };
      }
    );
    this.writeQueue = attempt.catch(() => {
      // Already recorded above -- swallowed here only so one failed write
      // never wedges every write queued after it.
    });
    return attempt;
  }

  private async flush(): Promise<void> {
    await this.writeQueue;
  }

  getCandidates(): Candidate[] {
    return this.data.candidates.map((candidate) => ({ ...candidate }));
  }

  // Deliberately does NOT backfill a placeholder candidate for a post left
  // at zero -- that used to happen here and defeated
  // candidateService.findMissingCandidateCoverage's job of blocking Open
  // Poll until every post/house genuinely has a real candidate. A post with
  // zero candidates should stay visibly empty until the admin adds one.
  setCandidates(candidates: Candidate[]): void {
    this.data.candidates = cloneCandidates(candidates);
    this.queuePersist();
  }

  getPollState(): PollState {
    return {
      activeElectionType: this.data.pollState.activeElectionType ?? null,
      settings: { ...this.data.pollState.settings }
    };
  }

  updatePollState(updater: (state: PollState) => PollState): PollState {
    this.data.pollState = updater(this.getPollState());
    this.queuePersist();
    return this.getPollState();
  }

  // Awaits persistence before resolving -- a vote is only reported as
  // "recorded" to the voter once it is actually durable, not just sitting
  // in memory (Cloud Run can throttle/stop this instance between requests).
  async addVote(
    selections: StoredVote['selections'],
    electionType: ElectionType,
    house?: string,
    officerCode?: string
  ): Promise<StoredVote> {
    const vote: StoredVote = {
      id: randomUUID(),
      timestamp: Date.now(),
      electionType,
      house: house as StoredVote['house'],
      officerCode,
      selections: { ...selections }
    };
    this.data.votes.push(vote);
    // Left in memory even if the persist below throws -- it will be
    // included in the next successful write instead of being dropped.
    await this.queuePersist();
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

  resetVotesByType(electionType: ElectionType): void {
    this.data.votes = this.data.votes.filter((vote) => vote.electionType !== electionType);
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

  generateOfficerCodes(count: number, electionType: ElectionType, house?: HouseId): OfficerCode[] {
    const newCodes = generateUniqueCodes(count, this.data.officerCodes.map((entry) => entry.code));
    const createdAt = Date.now();
    const entries: OfficerCode[] = newCodes.map((code) => ({ code, officerName: '', electionType, house, createdAt }));
    this.data.officerCodes.push(...entries);
    this.queuePersist();
    return entries;
  }

  closeOfficerCode(code: string): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => item.code === code);
    if (!entry) {
      return undefined;
    }
    entry.closedAt = Date.now();
    this.queuePersist();
    return { ...entry };
  }

  reopenOfficerCode(code: string): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => item.code === code);
    if (!entry) {
      return undefined;
    }
    entry.closedAt = undefined;
    this.queuePersist();
    return { ...entry };
  }

  updateOfficerCode(code: string, updates: { officerName?: string }): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => item.code === code);
    if (!entry) {
      return undefined;
    }
    if (updates.officerName !== undefined) {
      entry.officerName = updates.officerName;
    }
    this.queuePersist();
    return { ...entry };
  }

  deleteOfficerCode(code: string): void {
    this.data.officerCodes = this.data.officerCodes.filter((entry) => entry.code !== code);
    this.queuePersist();
  }

  getArchives(): ElectionArchive[] {
    return this.data.archives.map((entry) => ({
      ...entry,
      results: entry.results.map((r) => ({ ...r })),
      officerCodes: entry.officerCodes.map((o) => ({ ...o }))
    }));
  }

  getArchive(id: string): ElectionArchive | undefined {
    const entry = this.data.archives.find((item) => item.id === id);
    if (!entry) {
      return undefined;
    }
    return {
      ...entry,
      results: entry.results.map((r) => ({ ...r })),
      officerCodes: entry.officerCodes.map((o) => ({ ...o }))
    };
  }

  addArchive(archive: ElectionArchive): void {
    this.data.archives.push(archive);
    this.queuePersist();
  }

  // Lets the admin fix up or add a label after the fact -- e.g. an archive
  // created before this feature existed, or a typo in the name given at
  // Reset/Switch-type time.
  renameArchive(id: string, name: string): ElectionArchive | undefined {
    const entry = this.data.archives.find((item) => item.id === id);
    if (!entry) {
      return undefined;
    }
    entry.name = name.trim() || undefined;
    this.queuePersist();
    return { ...entry };
  }

  // Lets the admin clear out test/junk archives (e.g. from a teacher
  // testing round) -- there was previously no way to remove an archive at
  // all once created, only to rename it. Permanent, same as any other
  // delete in this app.
  deleteArchive(id: string): boolean {
    const lengthBefore = this.data.archives.length;
    this.data.archives = this.data.archives.filter((entry) => entry.id !== id);
    const deleted = this.data.archives.length < lengthBefore;
    if (deleted) {
      this.queuePersist();
    }
    return deleted;
  }
}

export const dataStore = new DataStore();
