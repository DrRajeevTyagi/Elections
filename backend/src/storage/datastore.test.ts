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

  it('resetVotes deletes every vote document, not just the in-memory list', async () => {
    const store = await importFreshDataStore();
    await store.init();
    await store.addVote(sel({ HB: 'hb-1' }), 'school', undefined, 'CODE01');
    await store.addVote(sel({ HB: 'hb-2' }), 'school', undefined, 'CODE02');
    expect(store.getVotes()).toHaveLength(2);

    store.resetVotes();
    // resetVotes's Firestore delete is queued (fire-and-forget, same pattern
    // as every other write here) -- flush it via a second write that awaits
    // the shared queue.
    await store.addVote(sel({ HB: 'hb-3' }), 'school', undefined, 'CODE03');

    const votesInDb = [...sharedFakeFirestore.store.keys()].filter((k) =>
      k.startsWith('school-election/state/votes/')
    );
    expect(votesInDb).toHaveLength(1); // only the post-reset vote remains
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
