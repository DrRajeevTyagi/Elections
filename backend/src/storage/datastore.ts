import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { Firestore } from '@google-cloud/firestore';
import { env } from '../config/env.js';
import { DEFAULT_CANDIDATES } from '../config/posts.js';
import { generateUniqueCodes } from '../utils/officerCode.js';
import { Candidate, PollState, StoredVote, ElectionType, OfficerCode, ElectionArchive, HouseId, Branch, ElectionRun, LogEntry } from '../types/election.js';

// Single document holds candidates/pollState/officerCodes/archives. This
// keeps the in-memory, synchronous DataStore API unchanged for those; only
// the persistence backend differs. Because state lives in memory, the
// service must run with a single Cloud Run instance (max-instances=1) so
// concurrent instances never diverge.
//
// Votes are deliberately NOT part of this document (see the `votes` class
// field and `votesCollection()` below) -- at the school's actual scale
// (3,000+ students voting twice), live votes alone were measured at 59-107%
// of Firestore's 1 MiB per-document limit. Storing each vote as its own
// small document in a subcollection instead removes that ceiling entirely,
// since Firestore's size limit is per-document, not per-collection. See
// ELECTION-INTEGRITY-AND-TRUST.md item 12 and ROADMAP.md Phase 0.
const FIRESTORE_COLLECTION = 'school-election';
const FIRESTORE_DOC_ID = 'state';
const FIRESTORE_VOTES_SUBCOLLECTION = 'votes';
// Runs and log entries are brand new (no legacy data to migrate, unlike
// votes) -- they follow the same "own subcollection, not an array field on
// the shared document" pattern from day one. See ELECTION-INTEGRITY-AND-
// TRUST.md items 5/11 and ROADMAP.md Phase 3.
const FIRESTORE_RUNS_SUBCOLLECTION = 'electionRuns';
const FIRESTORE_LOG_SUBCOLLECTION = 'actionLog';
// Firestore batch writes cap at 500 operations; stay comfortably under that
// so a large Reset Poll's vote deletion never risks hitting the ceiling.
const VOTE_DELETE_BATCH_SIZE = 450;
const DEFAULT_BRANCH: Branch = 'dwarka';

interface ElectionData {
  candidates: Candidate[];
  // In Firestore mode, this field only ever holds *legacy* inline votes read
  // from the main document on a pre-migration deploy -- see loadVotes(). It
  // is migrated into the votes subcollection and cleared on first load, and
  // never written back into the main document again. In disk mode (local
  // dev only, no Firestore size ceiling to worry about), this stays the
  // live, ongoing home for votes, unchanged from before.
  votes: StoredVote[];
  pollState: PollState;
  officerCodes: OfficerCode[];
  archives: ElectionArchive[];
  // Disk mode only (matches votes' disk-mode behavior) -- in Firestore mode
  // these live in their own subcollections, never on this document. See
  // loadRuns()/loadLogEntries().
  runs: ElectionRun[];
  actionLog: LogEntry[];
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
  archives: [],
  runs: [],
  actionLog: []
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
//
// branch is defaulted the same way: every record that predates the
// multi-branch field belongs to 'dwarka', the only branch that has ever
// existed (see MULTI-BRANCH-EXPANSION-PLAN.md).
// Officer codes are compared case-insensitively everywhere they're looked
// up. This matters because the code alphabet switched to lowercase
// (2026-09-22, easier to type on a phone keyboard) while codes generated
// before that change remain stored uppercase in existing data -- neither a
// polling officer typing an old code in caps out of habit, nor one typing a
// new code in lowercase, should ever fail to match on case alone.
const codesMatch = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const normalizeOfficerCode = (entry: OfficerCode): OfficerCode => ({
  ...entry,
  electionType: entry.electionType === 'house' || entry.electionType === 'school'
    ? entry.electionType
    : entry.house
    ? 'house'
    : 'school',
  branch: entry.branch ?? DEFAULT_BRANCH,
  // A record that predates the everNamed field: if it already carries a
  // name, treat it as having been named (the safe assumption -- we have no
  // history to say otherwise); if blank, treat it as never named.
  everNamed: entry.everNamed ?? Boolean(entry.officerName)
});

const normalizeCandidateBranch = (entry: Candidate): Candidate => ({
  ...entry,
  branch: entry.branch ?? DEFAULT_BRANCH
});

// Deliberately NOT branch-normalized on load, unlike candidates above. A
// stored archive always covers BOTH branches together; its `branch` field
// only ever means "this particular response was narrowed to that branch"
// (see resultsService.ts filterArchiveByBranch) and is never persisted.
// Defaulting it to 'dwarka' here made every archive come back claiming to be
// Dwarka after a restart, so an unnarrowed report header read "Mount Carmel
// School -- Dwarka" while listing both branches' candidates underneath. The
// per-result/per-officer branch fields are defaulted at read time instead,
// where the distinction actually matters.

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

const isElectionRun = (value: unknown): value is ElectionRun => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const run = value as ElectionRun;
  return (
    typeof run.id === 'string' &&
    (run.electionType === 'school' || run.electionType === 'house') &&
    typeof run.name === 'string' &&
    (run.status === 'running' || run.status === 'closed') &&
    typeof run.startedAt === 'number' &&
    typeof run.startedBy === 'string'
  );
};

const isLogEntry = (value: unknown): value is LogEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as LogEntry;
  return (
    typeof entry.id === 'string' &&
    typeof entry.timestamp === 'number' &&
    typeof entry.runId === 'string' &&
    typeof entry.actor === 'string' &&
    typeof entry.action === 'string'
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

// See DataStore.searchLogEntries below.
export interface LogSearchFilter {
  runId?: string;
  electionType?: ElectionType;
  branch?: Branch;
  actor?: string;
  action?: string;
  code?: string;
  adminOnly?: boolean;
}

export class DataStore {
  private data: ElectionData = createDefaultData();
  // The live, in-memory source of truth for votes -- see the comment on
  // ElectionData.votes above for why this is separate from `this.data` once
  // Firestore mode is loaded. Populated by loadVotes() at startup.
  private votes: StoredVote[] = [];
  // Live, in-memory source of truth for runs/log entries -- same reasoning
  // as `votes` above. Populated by loadRuns()/loadLogEntries() at startup.
  private runs: ElectionRun[] = [];
  private logEntries: LogEntry[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath = env.dataFile;
  private readonly firestore = env.useFirestore ? new Firestore() : null;
  private storageHealth: StorageHealth = { ok: true, lastSuccessAt: null, lastErrorAt: null };

  async init(): Promise<void> {
    await this.load();
    await this.loadVotes();
    await this.loadRuns();
    await this.loadLogEntries();
    await this.flush();
    this.storageHealth = { ok: true, lastSuccessAt: Date.now(), lastErrorAt: null };
  }

  private subcollection(name: string) {
    return this.firestore!.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).collection(name);
  }

  private votesCollection() {
    return this.subcollection(FIRESTORE_VOTES_SUBCOLLECTION);
  }

  private runsCollection() {
    return this.subcollection(FIRESTORE_RUNS_SUBCOLLECTION);
  }

  private logCollection() {
    return this.subcollection(FIRESTORE_LOG_SUBCOLLECTION);
  }

  // No migration needed (unlike loadVotes) -- runs/log entries are a brand
  // new concept with no legacy inline data to move. Disk mode keeps them on
  // the main document (see ElectionData.runs/actionLog); Firestore mode
  // reads them from their own subcollection.
  private async loadRuns(): Promise<void> {
    if (!this.firestore) {
      this.runs = this.data.runs;
      return;
    }
    const snapshot = await this.runsCollection().get();
    this.runs = snapshot.docs.map((doc) => doc.data() as ElectionRun);
  }

  private async loadLogEntries(): Promise<void> {
    if (!this.firestore) {
      this.logEntries = this.data.actionLog;
      return;
    }
    const snapshot = await this.logCollection().get();
    this.logEntries = snapshot.docs.map((doc) => doc.data() as LogEntry);
  }

  // In disk mode, votes stay embedded in the main file (loadFromDisk already
  // populated this.data.votes -- no Firestore size ceiling to avoid, so no
  // reason to complicate local dev). In Firestore mode, votes live in their
  // own subcollection -- this both loads them into memory and, on first run
  // against data written before this migration existed, moves any legacy
  // inline votes still sitting on the main document into that subcollection
  // (defaulting their branch, since they predate the multi-branch field)
  // before clearing them off the main document for good.
  private async loadVotes(): Promise<void> {
    if (!this.firestore) {
      this.votes = this.data.votes;
      return;
    }

    if (this.data.votes.length > 0) {
      const legacyVotes = this.data.votes;
      const batchSize = VOTE_DELETE_BATCH_SIZE;
      for (let i = 0; i < legacyVotes.length; i += batchSize) {
        const batch = this.firestore.batch();
        for (const vote of legacyVotes.slice(i, i + batchSize)) {
          const migrated: StoredVote = { ...vote, branch: vote.branch ?? DEFAULT_BRANCH };
          batch.set(this.votesCollection().doc(vote.id), JSON.parse(JSON.stringify(migrated)));
        }
        await batch.commit();
      }
      this.data.votes = [];
      await this.persist();
    }

    const snapshot = await this.votesCollection().get();
    this.votes = snapshot.docs.map((doc) => doc.data() as StoredVote);
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
      defaults.candidates = cloneCandidates(parsed.candidates).map(normalizeCandidateBranch);
    }

    // This is the one place a validation failure here would silently discard
    // real votes (see loadVotes(), which migrates whatever survives this
    // check into the votes subcollection). Unlike the other arrays below,
    // losing votes silently is exactly the failure ELECTION-INTEGRITY-AND-
    // TRUST.md item 2 warns about -- so this one case fails loudly instead of
    // falling back to an empty array, rather than waiting for item 2's
    // general fix to land everywhere.
    if (Array.isArray(parsed.votes)) {
      const validVotes = parsed.votes.filter((vote) => isStoredVote(vote));
      if (validVotes.length !== parsed.votes.length) {
        throw new Error(
          `Refusing to start: ${parsed.votes.length - validVotes.length} of ${parsed.votes.length} ` +
          'stored vote record(s) failed validation on load. Loading anyway would silently discard them ' +
          '(and, via the votes-subcollection migration, permanently lose them). Investigate the raw data ' +
          'before restarting.'
        );
      }
      defaults.votes = validVotes.map((vote) => ({
        id: vote.id,
        timestamp: vote.timestamp,
        electionType: vote.electionType,
        house: vote.house,
        officerCode: vote.officerCode,
        selections: { ...vote.selections },
        branch: vote.branch ?? DEFAULT_BRANCH
      }));
    }

    if (Array.isArray(parsed.officerCodes) && parsed.officerCodes.every((entry) => isOfficerCode(entry))) {
      defaults.officerCodes = parsed.officerCodes.map((entry) => normalizeOfficerCode({ ...entry }));
    }

    if (Array.isArray(parsed.runs) && parsed.runs.every((entry) => isElectionRun(entry))) {
      defaults.runs = parsed.runs.map((entry) => ({ ...entry }));
    }

    if (Array.isArray(parsed.actionLog) && parsed.actionLog.every((entry) => isLogEntry(entry))) {
      defaults.actionLog = parsed.actionLog.map((entry) => ({ ...entry, details: entry.details ? { ...entry.details } : undefined }));
    }

    if (Array.isArray(parsed.archives) && parsed.archives.every((entry) => isElectionArchive(entry))) {
      defaults.archives = parsed.archives.map((entry) => ({
        ...entry,
        results: entry.results.map((r) => ({ ...r })),
        officerCodes: entry.officerCodes.map((o) => ({ ...o })),
        totalVotesByBranch: entry.totalVotesByBranch ? { ...entry.totalVotesByBranch } : undefined
      }));
    }

    if (parsed.pollState && typeof parsed.pollState === 'object') {
      const pollState = parsed.pollState as Partial<PollState>;
      const basePollState = defaults.pollState;
      defaults.pollState = {
        activeElectionType: pollState.activeElectionType === 'school' || pollState.activeElectionType === 'house'
          ? pollState.activeElectionType
          : (basePollState.activeElectionType ?? null),
        activeElectionTypeSetAt: typeof pollState.activeElectionTypeSetAt === 'number'
          ? pollState.activeElectionTypeSetAt
          : basePollState.activeElectionTypeSetAt,
        settings: {
          isOpen: pollState.settings?.isOpen ?? basePollState.settings.isOpen,
          allowRevote: pollState.settings?.allowRevote ?? basePollState.settings.allowRevote
        }
      };
    }

    return defaults;
  }

  private async persist(): Promise<void> {
    // Built explicitly rather than persisting `this.data` as-is: in
    // Firestore mode, this.data.votes/runs/actionLog are always [] and
    // nothing else should ever write them back onto the main document, but
    // building the payload this way (rather than trusting that invariant
    // silently) keeps this document guaranteed small no matter what. In disk
    // mode, `this.votes`/`this.runs`/`this.logEntries` are the authoritative
    // in-memory arrays -- persist() must read from those, not `this.data`'s
    // copies, or a reset/run-start/log-append would write stale data back to
    // disk.
    const payload: ElectionData = this.firestore
      ? { ...this.data, votes: [], runs: [], actionLog: [] }
      : { ...this.data, votes: this.votes, runs: this.runs, actionLog: this.logEntries };

    if (this.firestore) {
      await this.firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).set(JSON.parse(JSON.stringify(payload)));
      return;
    }
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private async persistVote(vote: StoredVote): Promise<void> {
    if (this.firestore) {
      await this.votesCollection().doc(vote.id).set(JSON.parse(JSON.stringify(vote)));
      return;
    }
    // Disk mode: votes travel with the rest of the state (see persist()).
    await this.persist();
  }

  // Deletes vote documents by id, batched to stay under Firestore's 500-op
  // batch limit -- used by resetVotes/resetVotesByType so a large Reset
  // Poll's cleanup can't silently fail partway through a single oversized
  // batch.
  private async deleteVoteDocs(ids: string[]): Promise<void> {
    if (!this.firestore || ids.length === 0) {
      return;
    }
    const collection = this.votesCollection();
    for (let i = 0; i < ids.length; i += VOTE_DELETE_BATCH_SIZE) {
      const batch = this.firestore.batch();
      for (const id of ids.slice(i, i + VOTE_DELETE_BATCH_SIZE)) {
        batch.delete(collection.doc(id));
      }
      await batch.commit();
    }
  }

  // Runs are updated in place (started -> closed), unlike votes/log entries
  // which are pure create-only -- a full-document overwrite via .set() is
  // fine either way since a run is a small, single document.
  private async persistRun(run: ElectionRun): Promise<void> {
    if (this.firestore) {
      await this.runsCollection().doc(run.id).set(JSON.parse(JSON.stringify(run)));
      return;
    }
    await this.persist();
  }

  // No update/delete counterpart exists anywhere in this class, deliberately
  // -- this is the actual enforcement of the audit log's append-only
  // guarantee (ELECTION-INTEGRITY-AND-TRUST.md item 5). A Firestore security
  // rule denying update/delete on this subcollection is added as
  // defense-in-depth, but doesn't stop direct Admin-SDK/Console access (see
  // ROADMAP.md Phase 3's design note) -- the real guarantee is that no code
  // path to edit or remove an entry exists in this application at all.
  private async persistLogEntry(entry: LogEntry): Promise<void> {
    if (this.firestore) {
      await this.logCollection().doc(entry.id).set(JSON.parse(JSON.stringify(entry)));
      return;
    }
    await this.persist();
  }

  // Returns a promise for THIS write specifically, so a caller that needs to
  // know a particular change is durable (e.g. a cast vote, before telling
  // the voter it was recorded) can await it. The shared this.writeQueue is
  // kept alive even if this write fails (via the trailing .catch below), so
  // one failed write never wedges every write after it. Shared by every kind
  // of write (main document, a single vote, or a batch of vote deletions) so
  // they all report through the same StorageHealth the admin dashboard reads.
  private queueWrite(operation: () => Promise<void>): Promise<void> {
    const attempt = this.writeQueue.then(operation);
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

  private queuePersist(): Promise<void> {
    return this.queueWrite(() => this.persist());
  }

  private queueVotePersist(vote: StoredVote): Promise<void> {
    return this.queueWrite(() => this.persistVote(vote));
  }

  private queueVoteDeletion(ids: string[]): Promise<void> {
    return this.queueWrite(() => (this.firestore ? this.deleteVoteDocs(ids) : this.persist()));
  }

  private queueRunPersist(run: ElectionRun): Promise<void> {
    return this.queueWrite(() => this.persistRun(run));
  }

  private queueLogPersist(entry: LogEntry): Promise<void> {
    return this.queueWrite(() => this.persistLogEntry(entry));
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
      activeElectionTypeSetAt: this.data.pollState.activeElectionTypeSetAt,
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
  //
  // `branch` defaults to 'dwarka' since kiosk sessions don't carry a branch
  // yet (that's wired up once officer codes and the kiosk flow become
  // branch-aware -- see ROADMAP.md Phase 2); today there is only one branch
  // actually running, so this keeps behavior unchanged while the storage
  // layer underneath is already branch-ready.
  async addVote(
    selections: StoredVote['selections'],
    electionType: ElectionType,
    house?: string,
    officerCode?: string,
    branch: Branch = DEFAULT_BRANCH
  ): Promise<StoredVote> {
    const vote: StoredVote = {
      id: randomUUID(),
      timestamp: Date.now(),
      electionType,
      house: house as StoredVote['house'],
      officerCode,
      selections: { ...selections },
      branch
    };
    this.votes.push(vote);
    // Left in memory even if the persist below throws -- it will be
    // included in the next successful write instead of being dropped.
    await this.queueVotePersist(vote);
    return vote;
  }

  getVotes(): StoredVote[] {
    return this.votes.map((vote) => ({
      id: vote.id,
      timestamp: vote.timestamp,
      electionType: vote.electionType,
      house: vote.house,
      officerCode: vote.officerCode,
      selections: { ...vote.selections },
      branch: vote.branch
    }));
  }

  resetVotes(): void {
    const removedIds = this.votes.map((vote) => vote.id);
    this.votes = [];
    this.queueVoteDeletion(removedIds);
  }

  resetVotesByType(electionType: ElectionType): void {
    const removedIds = this.votes.filter((vote) => vote.electionType === electionType).map((vote) => vote.id);
    this.votes = this.votes.filter((vote) => vote.electionType !== electionType);
    this.queueVoteDeletion(removedIds);
  }

  countVotesByOfficerCode(code: string): number {
    return this.votes.filter((vote) => vote.officerCode === code).length;
  }

  getOfficerCodes(): OfficerCode[] {
    return this.data.officerCodes.map((entry) => ({ ...entry }));
  }

  findOfficerCode(code: string): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => codesMatch(item.code, code));
    return entry ? { ...entry } : undefined;
  }

  generateOfficerCodes(
    count: number,
    electionType: ElectionType,
    house?: HouseId,
    branch: Branch = DEFAULT_BRANCH,
    runId?: string
  ): OfficerCode[] {
    const newCodes = generateUniqueCodes(count, this.data.officerCodes.map((entry) => entry.code));
    const createdAt = Date.now();
    const entries: OfficerCode[] = newCodes.map((code) => ({ code, officerName: '', everNamed: false, electionType, house, createdAt, branch, runId }));
    this.data.officerCodes.push(...entries);
    this.queuePersist();
    return entries;
  }

  // Used by the "Bulk Allot from List" import (Officer Codes tab) --
  // generates and names many codes for a mix of election types/houses in
  // one shot. Deliberately a single generateUniqueCodes call plus a single
  // push/persist, not a loop of single-code generate+name calls, which
  // would each trigger their own full-document persist (wasteful at the
  // ~100-200 codes this is meant for).
  bulkAllotOfficerCodes(
    allotments: Array<{ officerName: string; electionType: ElectionType; house?: HouseId; branch: Branch; runId?: string }>
  ): OfficerCode[] {
    const newCodes = generateUniqueCodes(allotments.length, this.data.officerCodes.map((entry) => entry.code));
    const createdAt = Date.now();
    const entries: OfficerCode[] = allotments.map((allotment, index) => ({
      code: newCodes[index],
      officerName: allotment.officerName,
      everNamed: true,
      electionType: allotment.electionType,
      house: allotment.house,
      createdAt,
      branch: allotment.branch,
      runId: allotment.runId
    }));
    this.data.officerCodes.push(...entries);
    this.queuePersist();
    return entries;
  }

  // Called by runService.ts startRecording so a booth closed during the
  // PREVIOUS election (see closeOfficerCode) isn't still showing as closed,
  // and therefore unusable, for the new one -- the code and its officer
  // allotment carry forward, only the "this booth is done for the day" flag
  // resets, same as votes reset to zero for a new run.
  reopenOfficerCodesByType(electionType: ElectionType): void {
    this.data.officerCodes = this.data.officerCodes.map((entry) =>
      entry.electionType === electionType ? { ...entry, closedAt: undefined } : entry
    );
    this.queuePersist();
  }

  // Called by runService.ts startRecording once a new run exists, to tag
  // any codes of that type generated ahead of time (as prep work, before
  // this run started) with the run they're now part of.
  stampOfficerCodesRunId(electionType: ElectionType, runId: string): void {
    this.data.officerCodes = this.data.officerCodes.map((entry) =>
      entry.electionType === electionType ? { ...entry, runId } : entry
    );
    this.queuePersist();
  }

  closeOfficerCode(code: string): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => codesMatch(item.code, code));
    if (!entry) {
      return undefined;
    }
    entry.closedAt = Date.now();
    this.queuePersist();
    return { ...entry };
  }

  reopenOfficerCode(code: string): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => codesMatch(item.code, code));
    if (!entry) {
      return undefined;
    }
    entry.closedAt = undefined;
    this.queuePersist();
    return { ...entry };
  }

  updateOfficerCode(code: string, updates: { officerName?: string }): OfficerCode | undefined {
    const entry = this.data.officerCodes.find((item) => codesMatch(item.code, code));
    if (!entry) {
      return undefined;
    }
    if (updates.officerName !== undefined) {
      entry.officerName = updates.officerName;
      if (updates.officerName.trim()) {
        entry.everNamed = true;
      }
    }
    this.queuePersist();
    return { ...entry };
  }

  deleteOfficerCode(code: string): void {
    this.data.officerCodes = this.data.officerCodes.filter((entry) => !codesMatch(entry.code, code));
    this.queuePersist();
  }

  getArchives(): ElectionArchive[] {
    return this.data.archives.map((entry) => ({
      ...entry,
      results: entry.results.map((r) => ({ ...r })),
      officerCodes: entry.officerCodes.map((o) => ({ ...o })),
      totalVotesByBranch: entry.totalVotesByBranch ? { ...entry.totalVotesByBranch } : undefined
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
      officerCodes: entry.officerCodes.map((o) => ({ ...o })),
      totalVotesByBranch: entry.totalVotesByBranch ? { ...entry.totalVotesByBranch } : undefined
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

  // At most one run is ever 'running' at a time -- enforced by runService.ts
  // refusing to start a new one while this returns a result.
  getCurrentRun(): ElectionRun | undefined {
    const running = this.runs.find((run) => run.status === 'running');
    return running ? { ...running } : undefined;
  }

  getRun(id: string): ElectionRun | undefined {
    const run = this.runs.find((entry) => entry.id === id);
    return run ? { ...run } : undefined;
  }

  getRuns(): ElectionRun[] {
    return this.runs.map((run) => ({ ...run })).sort((a, b) => b.startedAt - a.startedAt);
  }

  // Awaits persistence, same reasoning as addVote -- starting/closing a run
  // is exactly the kind of action that must be durable before the admin is
  // told it succeeded.
  async startRun(electionType: ElectionType, name: string, actor: string): Promise<ElectionRun> {
    const run: ElectionRun = {
      id: randomUUID(),
      electionType,
      name: name.trim(),
      status: 'running',
      startedAt: Date.now(),
      startedBy: actor
    };
    this.runs.push(run);
    await this.queueRunPersist(run);
    return { ...run };
  }

  async closeRun(runId: string, actor: string, archiveIds: string[]): Promise<ElectionRun | undefined> {
    const run = this.runs.find((entry) => entry.id === runId);
    if (!run) {
      return undefined;
    }
    run.status = 'closed';
    run.closedAt = Date.now();
    run.closedBy = actor;
    run.archiveIds = archiveIds;
    await this.queueRunPersist(run);
    return { ...run };
  }

  // The only way a LogEntry is ever created -- there is deliberately no
  // corresponding update/delete method (see persistLogEntry above).
  async appendLogEntry(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<LogEntry> {
    const full: LogEntry = { ...entry, id: randomUUID(), timestamp: Date.now() };
    this.logEntries.push(full);
    await this.queueLogPersist(full);
    return full;
  }

  getLogEntries(runId?: string): LogEntry[] {
    const list = runId ? this.logEntries.filter((entry) => entry.runId === runId) : this.logEntries;
    return list
      .map((entry) => ({ ...entry, details: entry.details ? { ...entry.details } : undefined }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // Backs GET /election-runs/log/search -- lets the admin ask questions like
  // "what happened under this code," "what did the superadmin do for AN
  // House Elections," or "activity across every run of School Elections,"
  // without reading a long log book start to finish. All filters are
  // optional and combine with AND; string filters are substring,
  // case-insensitive matches, not exact-match, so a partial code/action
  // still finds results. Sorted newest-first (unlike getLogEntries, which
  // reads chronologically for one run's own story) since a search result is
  // a report on "what happened," not a run's narrative.
  searchLogEntries(filter: LogSearchFilter): LogEntry[] {
    const actorQuery = filter.actor?.trim().toLowerCase();
    const actionQuery = filter.action?.trim().toLowerCase();
    const codeQuery = filter.code?.trim().toLowerCase();

    const matches = this.logEntries.filter((entry) => {
      if (filter.runId && entry.runId !== filter.runId) return false;
      if (filter.electionType && entry.electionType !== filter.electionType) return false;
      if (filter.branch && entry.branch !== filter.branch) return false;
      // Excludes a polling officer's own self-service actions (e.g. closing
      // their own booth) -- see kiosk.ts's `officer:` actor prefix -- so
      // "what did the admin account do" doesn't also pull in officers'
      // routine end-of-day close-booth actions.
      if (filter.adminOnly && entry.actor.startsWith('officer:')) return false;
      if (actorQuery && !entry.actor.toLowerCase().includes(actorQuery)) return false;
      if (actionQuery && !entry.action.toLowerCase().includes(actionQuery)) return false;
      if (codeQuery) {
        // Most code-specific actions carry a single `code` string (name,
        // reopen, delete, close); `officerCode.generate` instead carries a
        // `codes` array (a whole batch generated at once) -- check both, so
        // "what happened under this code" also finds the generation event
        // that first created it.
        const singleCode = typeof entry.details?.code === 'string' ? entry.details.code.toLowerCase() : '';
        const codesArray = Array.isArray(entry.details?.codes)
          ? (entry.details.codes as unknown[]).filter((c): c is string => typeof c === 'string').map((c) => c.toLowerCase())
          : [];
        const matchesSingle = singleCode.includes(codeQuery);
        const matchesArray = codesArray.some((c) => c.includes(codeQuery));
        if (!matchesSingle && !matchesArray) return false;
      }
      return true;
    });

    return matches
      .map((entry) => ({ ...entry, details: entry.details ? { ...entry.details } : undefined }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}

export const dataStore = new DataStore();
