import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, ElectionRun, OfficerCode, PollState, StoredVote } from '../types/election.js';

// School posts differ by branch: AN also elects an Integrity Captain (IC),
// Dwarka doesn't. The ballot, vote checking, adding candidates and results
// must each use the branch's own list -- see config/posts.ts getPostIds.

const mockedDataStore = {
  getPollState: vi.fn<[], PollState>(),
  getCandidates: vi.fn<[], Candidate[]>(),
  setCandidates: vi.fn(),
  getCurrentRun: vi.fn<[], ElectionRun | undefined>(() => undefined),
  getCountedVotes: vi.fn<[], StoredVote[]>(() => []),
  addVote: vi.fn(),
  countVotesByOfficerCode: vi.fn<[string], number>(() => 0),
  findOfficerCode: vi.fn<[string], OfficerCode | undefined>(() => undefined)
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

const mockedKioskService = {
  getActiveSession: vi.fn(),
  markConsumed: vi.fn()
};

vi.mock('../services/kioskService.js', () => ({
  kioskService: mockedKioskService,
  SESSION_TTL_MS: 5 * 60 * 1000
}));

vi.mock('../middleware/adminAuth.js', () => ({
  requireAdminSession: [(_req: unknown, _res: unknown, next: () => void) => next()],
  requireAdminSecret: [(_req: unknown, _res: unknown, next: () => void) => next()]
}));

const FIVE = ['HB', 'HG', 'SSC', 'SRC', 'SCC'] as const;

const slate = (branch: 'dwarka' | 'AN', posts: readonly string[]): Candidate[] =>
  posts.map((post) => ({
    id: `${branch}-${post}`,
    name: `${branch} ${post}`,
    post: post as Candidate['post'],
    electionType: 'school',
    branch
  }));

const candidates: Candidate[] = [...slate('dwarka', FIVE), ...slate('AN', [...FIVE, 'IC'])];

const selectionsFor = (branch: 'dwarka' | 'AN', posts: readonly string[]): Record<string, string> =>
  Object.fromEntries(posts.map((post) => [post, `${branch}-${post}`]));

const sessionFor = (branch: 'dwarka' | 'AN') => ({
  token: 'tok',
  activatedAt: Date.now(),
  officerCode: branch === 'AN' ? 'AN01' : 'DW01',
  branch
});

describe('school posts per branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      settings: { isOpen: true, allowRevote: false }
    });
    // A fresh copy each time -- adding a candidate pushes onto this list.
    mockedDataStore.getCandidates.mockImplementation(() => [...candidates]);
    mockedDataStore.addVote.mockResolvedValue({
      id: 'vote-1',
      timestamp: Date.now(),
      electionType: 'school',
      selections: {}
    });
  });

  it('shows AN 6 posts on the ballot, Integrity Captain last', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/posts?branch=AN');

    expect(response.status).toBe(200);
    expect(response.body.posts.map((p: { post: string }) => p.post)).toEqual([...FIVE, 'IC']);
  });

  it('shows Dwarka the same 5 posts as before, with no Integrity Captain', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/posts?branch=dwarka');

    expect(response.status).toBe(200);
    expect(response.body.posts.map((p: { post: string }) => p.post)).toEqual([...FIVE]);
  });

  it('accepts a Dwarka vote for its 5 posts', async () => {
    mockedKioskService.getActiveSession.mockReturnValue(sessionFor('dwarka'));
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      .send({ selections: selectionsFor('dwarka', FIVE) });

    expect(response.status).toBe(201);
    expect(mockedDataStore.addVote).toHaveBeenCalledWith(selectionsFor('dwarka', FIVE), 'school', undefined, 'DW01', 'dwarka');
  });

  it('accepts an AN vote including Integrity Captain', async () => {
    mockedKioskService.getActiveSession.mockReturnValue(sessionFor('AN'));
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      .send({ selections: selectionsFor('AN', [...FIVE, 'IC']) });

    expect(response.status).toBe(201);
    expect(mockedDataStore.addVote).toHaveBeenCalledWith(
      selectionsFor('AN', [...FIVE, 'IC']),
      'school',
      undefined,
      'AN01',
      'AN'
    );
  });

  it('rejects an AN vote with no Integrity Captain choice, without using up the voter\'s turn', async () => {
    mockedKioskService.getActiveSession.mockReturnValue(sessionFor('AN'));
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      .send({ selections: selectionsFor('AN', FIVE) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('IC');
    expect(mockedDataStore.addVote).not.toHaveBeenCalled();
    expect(mockedKioskService.markConsumed).not.toHaveBeenCalled();
  });

  it('never stores an Integrity Captain choice sent from a Dwarka ballot', async () => {
    mockedKioskService.getActiveSession.mockReturnValue(sessionFor('dwarka'));
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      .send({ selections: { ...selectionsFor('dwarka', FIVE), IC: 'AN-IC' } });

    expect(response.status).toBe(201);
    expect(mockedDataStore.addVote).toHaveBeenCalledWith(selectionsFor('dwarka', FIVE), 'school', undefined, 'DW01', 'dwarka');
  });

  it('lets an Integrity Captain candidate be added to AN but not to Dwarka', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      settings: { isOpen: false, allowRevote: false }
    });
    const { createApp } = await import('../app.js');
    const app = createApp();

    const toAN = await request(app)
      .post('/api/candidates')
      .send({ id: 'ic-new', name: 'New IC', post: 'IC', electionType: 'school', branch: 'AN' });
    expect(toAN.status).toBe(201);

    const toDwarka = await request(app)
      .post('/api/candidates')
      .send({ id: 'ic-new-2', name: 'Wrong IC', post: 'IC', electionType: 'school', branch: 'dwarka' });
    expect(toDwarka.status).toBe(400);
    expect(toDwarka.body.error).toContain('Dwarka does not elect');
  });

  it('counts Integrity Captain votes in AN results only', async () => {
    mockedDataStore.getCountedVotes.mockReturnValue([
      { id: 'v1', timestamp: 1, electionType: 'school', selections: selectionsFor('AN', [...FIVE, 'IC']) as StoredVote['selections'], branch: 'AN' },
      { id: 'v2', timestamp: 2, electionType: 'school', selections: selectionsFor('dwarka', FIVE) as StoredVote['selections'], branch: 'dwarka' }
    ]);
    const { getResults } = await import('../services/resultsService.js');

    const an = getResults(undefined, 'AN', 'school');
    expect(an.map((r) => r.post)).toEqual([...FIVE, 'IC']);
    expect(an.find((r) => r.post === 'IC')?.candidates).toEqual([
      expect.objectContaining({ candidate: expect.objectContaining({ id: 'AN-IC' }), total: 1 })
    ]);

    const dwarka = getResults(undefined, 'dwarka', 'school');
    expect(dwarka.map((r) => r.post)).toEqual([...FIVE]);
  });
});
