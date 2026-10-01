import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredVote } from '../types/election.js';

// Real callers always submit a selection for every post (see
// routes/votes.ts's validateVote); these tests only care about one post at a
// time, so this cast stands in for the rest the same way resultsService.test.ts
// casts its own partial vote fixtures.
const sel = (partial: Record<string, string>) => partial as StoredVote['selections'];

// Minimal in-memory fake of the @google-cloud/firestore surface this module
// actually uses (collection/doc/get/set, and batch set/delete/commit) --
// enough to exercise the votes-subcollection migration and read/write/delete
// paths added in ROADMAP.md Phase 0 without needing real Firestore access.
// Multiple DataStore instances can share one `store` Map to simulate the
// same underlying database surviving a restart (used by the migration test).
class FakeDocRef {
  constructor(private store: Map<string, unknown>, public path: string) {}
  async get() {
    const exists = this.store.has(this.path);
    return { exists, data: () => this.store.get(this.path) };
  }
  async set(data: unknown) {
    this.store.set(this.path, data);
  }
  collection(name: string) {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }
}

class FakeCollectionRef {
  constructor(private store: Map<string, unknown>, public path: string) {}
  doc(id: string) {
    return new FakeDocRef(this.store, `${this.path}/${id}`);
  }
  async get() {
    const prefix = this.path + '/';
    const docs = [...this.store.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([key, value]) => ({ id: key.slice(prefix.length), data: () => value }));
    return { docs };
  }
}

class FakeBatch {
  private ops: Array<() => void> = [];
  constructor(private store: Map<string, unknown>) {}
  set(ref: FakeDocRef, data: unknown) {
    this.ops.push(() => this.store.set(ref.path, data));
  }
  delete(ref: FakeDocRef) {
    this.ops.push(() => this.store.delete(ref.path));
  }
  async commit() {
    for (const op of this.ops) op();
  }
}

class FakeFirestore {
  public store = new Map<string, unknown>();
  collection(name: string) {
    return new FakeCollectionRef(this.store, name);
  }
  batch() {
    return new FakeBatch(this.store);
  }
}

let sharedFakeFirestore: FakeFirestore;

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => sharedFakeFirestore)
}));

const importFreshDataStore = async () => {
  vi.resetModules();
  process.env.USE_FIRESTORE = 'true';
  const { DataStore } = await import('./datastore.js');
  return new DataStore();
};

describe('DataStore (Firestore mode) -- votes subcollection', () => {
  beforeEach(() => {
    sharedFakeFirestore = new FakeFirestore();
  });

  it('starts with zero votes against a brand-new (empty) database', async () => {
    const store = await importFreshDataStore();
    await store.init();
    expect(store.getVotes()).toEqual([]);
  });

  it('writes a new vote to its own subcollection document, not the main document', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const vote = await store.addVote(sel({ HB: 'hb-1' }), 'school', undefined, 'CODE01');

    expect(vote.branch).toBe('dwarka');
    expect(store.getVotes()).toHaveLength(1);

    const mainDoc = sharedFakeFirestore.store.get('school-election/state') as { votes?: unknown[] };
    expect(mainDoc.votes).toEqual([]); // never inline on the main document
    const voteDoc = sharedFakeFirestore.store.get(`school-election/state/votes/${vote.id}`);
    expect(voteDoc).toBeDefined();
  });

  it('respects an explicit branch instead of defaulting', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const vote = await store.addVote(sel({ HB: 'hb-1' }), 'school', undefined, 'CODE01', 'AN');
    expect(vote.branch).toBe('AN');
  });

  it('resetVotesByType only deletes that election type\'s votes', async () => {
    const store = await importFreshDataStore();
    await store.init();
    await store.addVote(sel({ HB: 'hb-1' }), 'school', undefined, 'CODE01');
    await store.addVote(sel({ HC: 'hc-1' }), 'house', 'Anand', 'CODE02');

    store.resetVotesByType('school');
    await store.addVote(sel({ HC: 'hc-2' }), 'house', 'Anand', 'CODE03'); // flush

    expect(store.getVotes().filter((v) => v.electionType === 'school')).toHaveLength(0);
    expect(store.getVotes().filter((v) => v.electionType === 'house')).toHaveLength(2);
  });

  it('migrates legacy inline votes on the main document into the subcollection, then clears them, on first load', async () => {
    // Simulate a pre-Phase-0 database: votes still embedded in the main
    // document, no branch field (predates the multi-branch plan).
    sharedFakeFirestore.store.set('school-election/state', {
      candidates: [],
      votes: [
        { id: 'legacy-1', timestamp: 1, electionType: 'school', selections: { HB: 'hb-1' } },
        { id: 'legacy-2', timestamp: 2, electionType: 'house', house: 'Anand', selections: { HC: 'hc-1' } }
      ],
      pollState: { activeElectionType: null, settings: { isOpen: false, allowRevote: false } },
      officerCodes: [],
      archives: []
    });

    const store = await importFreshDataStore();
    await store.init();

    const votes = store.getVotes();
    expect(votes).toHaveLength(2);
    expect(votes.every((v) => v.branch === 'dwarka')).toBe(true); // defaulted, since legacy data predates branch

    const mainDoc = sharedFakeFirestore.store.get('school-election/state') as { votes?: unknown[] };
    expect(mainDoc.votes).toEqual([]); // cleared off the main document after migration

    expect(sharedFakeFirestore.store.get('school-election/state/votes/legacy-1')).toBeDefined();
    expect(sharedFakeFirestore.store.get('school-election/state/votes/legacy-2')).toBeDefined();
  });

  it('refuses to start if any legacy vote record fails validation, instead of silently discarding it', async () => {
    sharedFakeFirestore.store.set('school-election/state', {
      candidates: [],
      votes: [
        { id: 'legacy-1', timestamp: 1, electionType: 'school', selections: { HB: 'hb-1' } },
        { id: 'legacy-bad', timestamp: 2 /* missing electionType/selections -- malformed */ }
      ],
      pollState: { activeElectionType: null, settings: { isOpen: false, allowRevote: false } },
      officerCodes: [],
      archives: []
    });

    const store = await importFreshDataStore();
    await expect(store.init()).rejects.toThrow(/Refusing to start/);
  });

  it('a second instance loading the same database sees votes written by an earlier instance (restart survives)', async () => {
    const first = await importFreshDataStore();
    await first.init();
    await first.addVote(sel({ HB: 'hb-1' }), 'school', undefined, 'CODE01');

    const second = await importFreshDataStore();
    await second.init();
    expect(second.getVotes()).toHaveLength(1);
  });
});

describe('DataStore -- officer code case-insensitive matching (2026-09-22)', () => {
  beforeEach(() => {
    sharedFakeFirestore = new FakeFirestore();
  });

  it('generates codes from the lowercase, ambiguous-character-free alphabet', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const codes = store.generateOfficerCodes(20, 'school');
    for (const { code } of codes) {
      expect(code).toMatch(/^[a-z2-9]{6}$/);
      expect(code).not.toMatch(/[ilo01]/); // excluded as easily confused
    }
  });

  it('finds a freshly generated code when looked up in a different case', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const [{ code }] = store.generateOfficerCodes(1, 'school');
    expect(store.findOfficerCode(code.toUpperCase())).toBeDefined();
  });

  it('finds a legacy uppercase-stored code (predating the lowercase alphabet) when looked up in lowercase', async () => {
    sharedFakeFirestore.store.set('school-election/state', {
      candidates: [],
      votes: [],
      pollState: { activeElectionType: null, settings: { isOpen: false, allowRevote: false } },
      officerCodes: [
        { code: 'ABC234', officerName: 'Jane', everNamed: true, electionType: 'school', createdAt: Date.now() }
      ],
      archives: []
    });

    const store = await importFreshDataStore();
    await store.init();
    expect(store.findOfficerCode('abc234')).toBeDefined();
  });

  it('deletes a never-named code regardless of the case used to look it up', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const [{ code }] = store.generateOfficerCodes(1, 'school');
    store.deleteOfficerCode(code.toUpperCase());
    expect(store.findOfficerCode(code)).toBeUndefined();
  });
});

describe('DataStore -- election runs and the append-only action log (ROADMAP.md Phase 3)', () => {
  beforeEach(() => {
    sharedFakeFirestore = new FakeFirestore();
  });

  it('starts with no active run', async () => {
    const store = await importFreshDataStore();
    await store.init();
    expect(store.getCurrentRun()).toBeUndefined();
  });

  it('startRun creates a running run, retrievable as the current run', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const run = await store.startRun('school', '  School Elections -- Term 1  ', 'Rajeev -- laptop');

    expect(run.status).toBe('running');
    expect(run.name).toBe('School Elections -- Term 1'); // trimmed
    expect(store.getCurrentRun()?.id).toBe(run.id);

    const doc = sharedFakeFirestore.store.get(`school-election/state/electionRuns/${run.id}`) as { status?: string };
    expect(doc.status).toBe('running'); // actually durable, not just in memory
  });

  it('closeRun marks the run closed and clears getCurrentRun', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const run = await store.startRun('school', 'Test Run', 'actor-1');

    const closed = await store.closeRun(run.id, 'actor-1', ['archive-1']);
    expect(closed?.status).toBe('closed');
    expect(closed?.archiveIds).toEqual(['archive-1']);
    expect(store.getCurrentRun()).toBeUndefined();
  });

  it('appendLogEntry persists an entry that survives a restart, with no update/delete method available to alter it', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const run = await store.startRun('school', 'Test Run', 'actor-1');
    await store.appendLogEntry({ runId: run.id, actor: 'actor-1', action: 'poll.open' });

    expect(store.getLogEntries(run.id)).toHaveLength(1);
    // Nothing in this class's public API can edit or remove that entry --
    // this is the actual enforcement of append-only, not a Firestore rule.
    expect((store as unknown as Record<string, unknown>).updateLogEntry).toBeUndefined();
    expect((store as unknown as Record<string, unknown>).deleteLogEntry).toBeUndefined();

    const second = await importFreshDataStore();
    await second.init();
    expect(second.getLogEntries(run.id)).toHaveLength(1);
  });

  it('getLogEntries filters by run and returns entries in chronological order', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const runA = await store.startRun('school', 'Run A', 'actor-1');
    await store.appendLogEntry({ runId: runA.id, actor: 'actor-1', action: 'poll.open' });
    await store.closeRun(runA.id, 'actor-1', []);

    const runB = await store.startRun('school', 'Run B', 'actor-1');
    await store.appendLogEntry({ runId: runB.id, actor: 'actor-1', action: 'officerCode.generate', details: { count: 3 } });

    expect(store.getLogEntries(runA.id)).toHaveLength(1);
    expect(store.getLogEntries(runB.id)).toHaveLength(1);
    expect(store.getLogEntries()).toHaveLength(2); // no filter -- everything
  });

  it('searchLogEntries filters by electionType, branch, code, and adminOnly, newest first', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const run = await store.startRun('house', 'Search Test', 'Rajeev -- laptop');
    await store.appendLogEntry({
      runId: run.id,
      actor: 'Rajeev -- laptop',
      action: 'officerCode.generate',
      details: { codes: ['abc123'] },
      electionType: 'house',
      branch: 'AN'
    });
    await store.appendLogEntry({
      runId: run.id,
      actor: 'Rajeev -- laptop',
      action: 'officerCode.name',
      details: { code: 'abc123', officerName: 'Mrs. Sharma' },
      electionType: 'house',
      branch: 'AN'
    });
    await store.appendLogEntry({
      runId: run.id,
      actor: 'officer:Mrs. Sharma',
      action: 'officerCode.close',
      details: { code: 'abc123' },
      electionType: 'house',
      branch: 'AN'
    });
    await store.appendLogEntry({
      runId: run.id,
      actor: 'Rajeev -- laptop',
      action: 'officerCode.generate',
      details: { codes: ['xyz999'] },
      electionType: 'house',
      branch: 'dwarka'
    });

    // Branch filter: "activity for AN branch".
    expect(store.searchLogEntries({ branch: 'AN' })).toHaveLength(3);
    // Code filter, substring/case-insensitive: "what happened under code ABC123".
    expect(store.searchLogEntries({ code: 'ABC123' })).toHaveLength(3);
    // adminOnly excludes the polling officer's own self-service action.
    const adminOnly = store.searchLogEntries({ branch: 'AN', adminOnly: true });
    expect(adminOnly).toHaveLength(2);
    expect(adminOnly.every((entry) => !entry.actor.startsWith('officer:'))).toBe(true);
    // "Who were the polling officers" -- action filter finds the naming entries.
    const naming = store.searchLogEntries({ action: 'officerCode.name' });
    expect(naming).toHaveLength(1);
    expect(naming[0].details?.officerName).toBe('Mrs. Sharma');
    // Every entry is still findable with no filter at all.
    expect(store.searchLogEntries({})).toHaveLength(4);
  });

  it('searchLogEntries sorts newest first', async () => {
    vi.useFakeTimers();
    try {
      const store = await importFreshDataStore();
      await store.init();
      const run = await store.startRun('school', 'Order Test', 'actor-1');
      vi.setSystemTime(1000);
      await store.appendLogEntry({ runId: run.id, actor: 'actor-1', action: 'first', electionType: 'school' });
      vi.setSystemTime(2000);
      await store.appendLogEntry({ runId: run.id, actor: 'actor-1', action: 'second', electionType: 'school' });

      const results = store.searchLogEntries({});
      expect(results.map((entry) => entry.action)).toEqual(['second', 'first']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reopenOfficerCodesByType clears closedAt for one type without touching the other or officerName', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const [schoolCode] = store.generateOfficerCodes(1, 'school');
    const [houseCode] = store.generateOfficerCodes(1, 'house', 'Anand');
    store.updateOfficerCode(schoolCode.code, { officerName: 'Mrs. Iyer' });
    store.closeOfficerCode(schoolCode.code);
    store.closeOfficerCode(houseCode.code);

    store.reopenOfficerCodesByType('school');

    const reopenedSchool = store.getOfficerCodes().find((c) => c.code === schoolCode.code)!;
    const stillClosedHouse = store.getOfficerCodes().find((c) => c.code === houseCode.code)!;
    expect(reopenedSchool.closedAt).toBeUndefined();
    expect(reopenedSchool.officerName).toBe('Mrs. Iyer');
    expect(stillClosedHouse.closedAt).toBeDefined();
  });

  it('generateOfficerCodes tags codes with the given runId', async () => {
    const store = await importFreshDataStore();
    await store.init();
    const run = await store.startRun('school', 'Test Run', 'actor-1');
    const [code] = store.generateOfficerCodes(1, 'school', undefined, 'dwarka', run.id);
    expect(code.runId).toBe(run.id);
  });

  it('stampOfficerCodesRunId tags existing codes of one type with a run, without touching the other type', async () => {
    const store = await importFreshDataStore();
    await store.init();
    store.generateOfficerCodes(1, 'school'); // prep work, generated before any run exists
    store.generateOfficerCodes(1, 'house', 'Anand');

    store.stampOfficerCodesRunId('school', 'run-123');

    const [schoolCode] = store.getOfficerCodes().filter((c) => c.electionType === 'school');
    const [houseCode] = store.getOfficerCodes().filter((c) => c.electionType === 'house');
    expect(schoolCode.runId).toBe('run-123');
    expect(houseCode.runId).toBeUndefined();
  });

  describe('bulkAllotOfficerCodes', () => {
    it('generates and names one code per allotment, tagged with each entry\'s own type/house/branch', async () => {
      const store = await importFreshDataStore();
      await store.init();

      const created = store.bulkAllotOfficerCodes([
        { officerName: 'Mrs. Sharma', electionType: 'school', branch: 'dwarka' },
        { officerName: 'Mr. Rao', electionType: 'house', house: 'Anand', branch: 'AN' }
      ]);

      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({ officerName: 'Mrs. Sharma', electionType: 'school', branch: 'dwarka', everNamed: true, house: undefined });
      expect(created[1]).toMatchObject({ officerName: 'Mr. Rao', electionType: 'house', house: 'Anand', branch: 'AN', everNamed: true });
      // Codes are unique and persisted into the live list, same as generateOfficerCodes.
      expect(created[0].code).not.toBe(created[1].code);
      expect(store.getOfficerCodes()).toHaveLength(2);
    });

    it('never produces a duplicate code, even generating a large batch in one call', async () => {
      const store = await importFreshDataStore();
      await store.init();
      const allotments = Array.from({ length: 50 }, (_, i) => ({
        officerName: `Teacher ${i}`,
        electionType: 'school' as const,
        branch: 'dwarka' as const
      }));

      const created = store.bulkAllotOfficerCodes(allotments);

      expect(new Set(created.map((entry) => entry.code)).size).toBe(50);
    });
  });

  // Send Codes screen: phone numbers and "sent" ticks are saved with the
  // code, so sending can resume after a refresh or the next morning.
  describe('phone numbers and sent marks', () => {
    it('keeps the phone from bulk allot, and lets it be changed or cleared later', async () => {
      const store = await importFreshDataStore();
      await store.init();
      const [created] = store.bulkAllotOfficerCodes([
        { officerName: 'Mrs. Sharma', electionType: 'school', branch: 'dwarka', phone: '919876543210' }
      ]);
      expect(created.phone).toBe('919876543210');

      expect(store.updateOfficerCode(created.code, { phone: '919999999999' })?.phone).toBe('919999999999');
      expect(store.updateOfficerCode(created.code, { phone: '' })?.phone).toBeUndefined();
      expect(store.findOfficerCode(created.code)?.officerName).toBe('Mrs. Sharma');
    });

    it('marks several codes as sent in one go, matching case-insensitively, and can undo it', async () => {
      const store = await importFreshDataStore();
      await store.init();
      const created = store.bulkAllotOfficerCodes([
        { officerName: 'Mrs. Sharma', electionType: 'school', branch: 'dwarka' },
        { officerName: 'Mrs. Sharma', electionType: 'house', house: 'Anand', branch: 'dwarka' },
        { officerName: 'Mr. Rao', electionType: 'school', branch: 'dwarka' }
      ]);

      const marked = store.markOfficerCodesSent([created[0].code.toUpperCase(), created[1].code, 'nope00'], true);
      expect(marked.map((entry) => entry.code)).toEqual([created[0].code, created[1].code]);
      expect(store.findOfficerCode(created[0].code)?.sentAt).toEqual(expect.any(Number));
      expect(store.findOfficerCode(created[2].code)?.sentAt).toBeUndefined();

      store.markOfficerCodesSent([created[0].code], false);
      expect(store.findOfficerCode(created[0].code)?.sentAt).toBeUndefined();
      expect(store.findOfficerCode(created[1].code)?.sentAt).toEqual(expect.any(Number));
    });
  });

  // Duty colours: white (fresh) -> yellow (sent) -> green (ready) -> red
  // (duty over, closed).
  describe('duty colours', () => {
    const allot = (store: Awaited<ReturnType<typeof importFreshDataStore>>) =>
      store.bulkAllotOfficerCodes([
        { officerName: 'A', electionType: 'school', branch: 'dwarka' },
        { officerName: 'B', electionType: 'school', branch: 'AN' },
        { officerName: 'C', electionType: 'house', house: 'Anand', branch: 'dwarka' }
      ]);

    it('marks a code ready once, keeping the first check-in time', async () => {
      vi.useFakeTimers();
      try {
        const store = await importFreshDataStore();
        await store.init();
        const [a] = allot(store);
        vi.setSystemTime(1000);
        store.markOfficerCodeReady(a.code.toUpperCase());
        vi.setSystemTime(5000);
        store.markOfficerCodeReady(a.code);
        expect(store.findOfficerCode(a.code)?.readyAt).toBe(1000);
      } finally {
        vi.useRealTimers();
      }
    });

    it('End of Voting closes every code of that election only', async () => {
      const store = await importFreshDataStore();
      await store.init();
      const [a, b, c] = allot(store);
      store.closeOfficerCodesByType('school');
      expect(store.findOfficerCode(a.code)?.closedAt).toEqual(expect.any(Number));
      expect(store.findOfficerCode(b.code)?.closedAt).toEqual(expect.any(Number));
      expect(store.findOfficerCode(c.code)?.closedAt).toBeUndefined();
    });

    it('fresh duties turn every code of that election, both branches, back to white -- except re-polled ones', async () => {
      const store = await importFreshDataStore();
      await store.init();
      const [a, b, c] = allot(store);
      store.markOfficerCodesSent([a.code, b.code, c.code], true);
      store.markOfficerCodeReady(a.code);
      store.closeOfficerCodesByType('school');
      store.orderRepoll(b.code, { orderedBy: 'x', reason: 'disruption', note: '' }, { officerName: 'B' });

      const count = store.startFreshDuties('school');

      // a, plus b's replacement code; b itself stays dead.
      expect(count).toBe(2);
      expect(store.findOfficerCode(a.code)).toMatchObject({ closedAt: undefined, sentAt: undefined, readyAt: undefined });
      expect(store.findOfficerCode(b.code)?.closedAt).toEqual(expect.any(Number));
      expect(store.findOfficerCode(c.code)?.sentAt).toEqual(expect.any(Number));
    });

    it('starting an election turns leftover red codes white, but keeps this morning\'s check-ins', async () => {
      const store = await importFreshDataStore();
      await store.init();
      const [a, b] = allot(store);
      store.markOfficerCodesSent([a.code, b.code], true);
      store.markOfficerCodeReady(a.code);
      store.closeOfficerCode(b.code); // left over from the last election

      store.reopenOfficerCodesByType('school');

      expect(store.findOfficerCode(a.code)?.closedAt).toBeUndefined();
      expect(store.findOfficerCode(a.code)).toMatchObject({ sentAt: expect.any(Number), readyAt: expect.any(Number) });
      expect(store.findOfficerCode(b.code)).toMatchObject({ closedAt: undefined, sentAt: undefined, readyAt: undefined });
    });

    it('on first start after the update, every existing code becomes red -- except those of a running election -- and only once', async () => {
      sharedFakeFirestore.store.set('school-election/state', {
        officerCodes: [
          { code: 'old111', officerName: 'A', electionType: 'school', createdAt: 1 },
          { code: 'old222', officerName: 'B', electionType: 'house', house: 'Anand', createdAt: 1 }
        ]
      });
      sharedFakeFirestore.store.set('school-election/state/electionRuns/run-1', {
        id: 'run-1', electionType: 'house', name: 'House', status: 'running', startedAt: 1, startedBy: 'x'
      });

      const store = await importFreshDataStore();
      await store.init();
      expect(store.findOfficerCode('old111')?.closedAt).toEqual(expect.any(Number));
      expect(store.findOfficerCode('old222')?.closedAt).toBeUndefined();

      // Once only: after fresh duties, a restart must not turn them red again.
      store.startFreshDuties('school');
      const restarted = await importFreshDataStore();
      await restarted.init();
      expect(restarted.findOfficerCode('old111')?.closedAt).toBeUndefined();
    });
  });

  // Re-polling at a booth: its votes stop counting but are never deleted,
  // and a fresh code is issued for the same election/house/branch.
  describe('orderRepoll', () => {
    const setUp = async () => {
      const store = await importFreshDataStore();
      await store.init();
      const [booth, other] = store.bulkAllotOfficerCodes([
        { officerName: 'Mrs. Sharma', electionType: 'house', house: 'Anand', branch: 'AN', runId: 'run-1', phone: '919876543210' },
        { officerName: 'Mr. Rao', electionType: 'house', house: 'Anand', branch: 'AN', runId: 'run-1' }
      ]);
      await store.addVote(sel({ HC: 'c1' }), 'house', 'Anand', booth.code, 'AN');
      await store.addVote(sel({ HC: 'c1' }), 'house', 'Anand', booth.code, 'AN');
      await store.addVote(sel({ HC: 'c2' }), 'house', 'Anand', other.code, 'AN');
      return { store, booth, other };
    };

    it('sets the booth\'s votes aside without deleting them', async () => {
      const { store, booth, other } = await setUp();

      const result = store.orderRepoll(booth.code, { orderedBy: 'Admin', reason: 'count-mismatch', note: '2 extra', runId: 'run-1' }, { officerName: 'Mrs. Sharma', phone: '919876543210' });

      expect(result?.original.repoll).toMatchObject({ reason: 'count-mismatch', cancelledVoteCount: 2, replacementCode: result?.replacement.code });
      expect(store.getVotes()).toHaveLength(3);
      expect(store.getCountedVotes().map((vote) => vote.officerCode)).toEqual([other.code]);
      expect(store.countVotesByOfficerCode(booth.code)).toBe(2);
      expect(store.countCountedVotesByOfficerCode(booth.code)).toBe(0);
      expect(store.countCountedVotesByOfficerCode(other.code)).toBe(1);
    });

    it('issues a fresh code for the same election, house, branch and run, and closes the old one', async () => {
      const { store, booth } = await setUp();

      const result = store.orderRepoll(booth.code, { orderedBy: 'Admin', reason: 'disruption', note: '' }, { officerName: 'Ms. Iyer' });

      expect(result?.replacement).toMatchObject({
        officerName: 'Ms. Iyer',
        everNamed: true,
        electionType: 'house',
        house: 'Anand',
        branch: 'AN',
        runId: 'run-1',
        replacesCode: booth.code
      });
      expect(result?.replacement.code).not.toBe(booth.code);
      expect(store.findOfficerCode(booth.code)?.closedAt).toEqual(expect.any(Number));
    });

    it('can only be ordered once per code', async () => {
      const { store, booth } = await setUp();
      store.orderRepoll(booth.code, { orderedBy: 'Admin', reason: 'irregularity', note: '' }, { officerName: 'Mrs. Sharma' });
      expect(store.orderRepoll(booth.code, { orderedBy: 'Admin', reason: 'irregularity', note: '' }, { officerName: 'Mrs. Sharma' })).toBeUndefined();
    });

    it('keeps a re-polled code closed, even when a new election reopens every booth', async () => {
      const { store, booth, other } = await setUp();
      store.closeOfficerCode(other.code);
      store.orderRepoll(booth.code, { orderedBy: 'Admin', reason: 'irregularity', note: '' }, { officerName: 'Mrs. Sharma' });

      store.reopenOfficerCode(booth.code);
      store.reopenOfficerCodesByType('house');

      expect(store.findOfficerCode(booth.code)?.closedAt).toEqual(expect.any(Number));
      expect(store.findOfficerCode(other.code)?.closedAt).toBeUndefined();
    });
  });
});
