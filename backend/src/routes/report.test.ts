import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, ElectionArchive, OfficerCode, PollState, StoredVote } from '../types/election.js';

// Regression tests for the "Download Report" / Election History "view"
// per-branch split: both used to always return Dwarka + AN merged together
// with no way to print one branch's results alone.

const mockedDataStore = {
  getVotes: vi.fn<[], StoredVote[]>(),
  getCandidates: vi.fn<[], Candidate[]>(),
  getPollState: vi.fn<[], PollState>(),
  getArchives: vi.fn<[], ElectionArchive[]>(() => []),
  getArchive: vi.fn<[string], ElectionArchive | undefined>(),
  getOfficerCodes: vi.fn<[], OfficerCode[]>(),
  countVotesByOfficerCode: vi.fn<[string], number>(() => 0),
  addArchive: vi.fn(),
  renameArchive: vi.fn()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

vi.mock('../middleware/adminAuth.js', () => ({
  requireAdminSession: [(_req: unknown, _res: unknown, next: () => void) => next()],
  requireAdminSecret: [(_req: unknown, _res: unknown, next: () => void) => next()]
}));

const candidates: Candidate[] = [
  { id: 'hb-1', name: 'Dwarka Head Boy', post: 'HB', electionType: 'school', branch: 'dwarka' },
  { id: 'hb-2', name: 'AN Head Boy', post: 'HB', electionType: 'school', branch: 'AN' }
];

// A ballot fills one selection per post, so a report covering several posts
// is where "sum the candidate totals" and "count the ballots" diverge -- the
// single-post fixture above can't tell them apart.
const multiPostCandidates: Candidate[] = [
  { id: 'd-HB', name: 'Dwarka HB', post: 'HB', electionType: 'school', branch: 'dwarka' },
  { id: 'd-HG', name: 'Dwarka HG', post: 'HG', electionType: 'school', branch: 'dwarka' },
  { id: 'd-SSC', name: 'Dwarka SSC', post: 'SSC', electionType: 'school', branch: 'dwarka' },
  { id: 'a-HB', name: 'AN HB', post: 'HB', electionType: 'school', branch: 'AN' },
  { id: 'a-HG', name: 'AN HG', post: 'HG', electionType: 'school', branch: 'AN' },
  { id: 'a-SSC', name: 'AN SSC', post: 'SSC', electionType: 'school', branch: 'AN' }
];

const multiPostVote = (id: string, branch: 'dwarka' | 'AN'): StoredVote =>
  ({
    id,
    timestamp: 1,
    electionType: 'school',
    branch,
    selections:
      branch === 'dwarka'
        ? { HB: 'd-HB', HG: 'd-HG', SSC: 'd-SSC' }
        : { HB: 'a-HB', HG: 'a-HG', SSC: 'a-SSC' }
  }) as StoredVote;

describe('GET /api/report/current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCandidates.mockReturnValue(candidates);
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      settings: { isOpen: true, allowRevote: false }
    });
    mockedDataStore.getVotes.mockReturnValue([
      { id: 'v1', timestamp: 1, electionType: 'school', selections: { HB: 'hb-1' }, branch: 'dwarka' },
      { id: 'v2', timestamp: 2, electionType: 'school', selections: { HB: 'hb-2' }, branch: 'AN' },
      { id: 'v3', timestamp: 3, electionType: 'school', selections: { HB: 'hb-2' }, branch: 'AN' }
    ] as StoredVote[]);
    mockedDataStore.getOfficerCodes.mockReturnValue([]);
  });

  it('returns both branches combined when no branch is given', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/current');

    expect(response.status).toBe(200);
    expect(response.body.report.results).toHaveLength(2);
    expect(response.body.report.totalVotes).toBe(3);
  });

  it('narrows to just the AN branch when ?branch=AN is given', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/current?branch=AN');

    expect(response.status).toBe(200);
    expect(response.body.report.results).toEqual([
      expect.objectContaining({ candidateId: 'hb-2', total: 2, branch: 'AN' })
    ]);
    expect(response.body.report.totalVotes).toBe(2);
    expect(response.body.report.branch).toBe('AN');
  });

  it('rejects an invalid branch', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/current?branch=nonsense');
    expect(response.status).toBe(400);
  });

  // "Download Report" is meant to keep working once an election closes --
  // activeElectionType goes back to null and live votes are reset to zero
  // at that point, so without this fallback there would be nothing left to
  // show even though the final result is sitting right there in Election
  // History.
  it('falls back to the most recently archived election once none is active', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: null,
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getArchives.mockReturnValue([
      {
        id: 'older',
        archivedAt: 100,
        electionType: 'house',
        totalVotes: 1,
        results: [{ candidateId: 'x', name: 'Old', post: 'HC', total: 1, branch: 'dwarka' }],
        officerCodes: []
      },
      {
        id: 'newest',
        archivedAt: 200,
        electionType: 'school',
        totalVotes: 5,
        results: [{ candidateId: 'hb-1', name: 'Dwarka Head Boy', post: 'HB', total: 5, branch: 'dwarka' }],
        officerCodes: []
      }
    ]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/current');

    expect(response.status).toBe(200);
    expect(response.body.report.id).toBe('newest');
    expect(response.body.report.totalVotes).toBe(5);
  });

  // Regression: narrowing a report to one branch used to recompute
  // totalVotes by summing the filtered candidate totals, which counts every
  // ballot once per post -- a 3-ballot Dwarka school election reported 15.
  // The dashboard's own "Total Votes" (a straight ballot count) disagreed
  // with the report downloaded from the button right next to it.
  it('counts ballots, not per-post selections, when narrowing to a branch', async () => {
    mockedDataStore.getCandidates.mockReturnValue(multiPostCandidates);
    mockedDataStore.getVotes.mockReturnValue([
      multiPostVote('v1', 'dwarka'),
      multiPostVote('v2', 'dwarka'),
      multiPostVote('v3', 'dwarka'),
      multiPostVote('v4', 'AN')
    ]);

    const { createApp } = await import('../app.js');
    const app = createApp();

    const dwarka = await request(app).get('/api/report/current?branch=dwarka');
    expect(dwarka.status).toBe(200);
    expect(dwarka.body.report.totalVotes).toBe(3);

    const an = await request(app).get('/api/report/current?branch=AN');
    expect(an.body.report.totalVotes).toBe(1);

    const combined = await request(app).get('/api/report/current');
    expect(combined.body.report.totalVotes).toBe(4);
  });

  // Archives written before totalVotesByBranch existed have to fall back to
  // deriving the figure from the stored per-candidate totals -- still per
  // post, never summed across posts.
  it('estimates a branch total per post for an archive saved before the field existed', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: null,
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getArchives.mockReturnValue([
      {
        id: 'legacy',
        archivedAt: 100,
        electionType: 'school',
        totalVotes: 4,
        results: [
          { candidateId: 'd-HB', name: 'Dwarka HB', post: 'HB', total: 3, branch: 'dwarka' },
          { candidateId: 'd-HG', name: 'Dwarka HG', post: 'HG', total: 3, branch: 'dwarka' },
          { candidateId: 'd-SSC', name: 'Dwarka SSC', post: 'SSC', total: 3, branch: 'dwarka' },
          { candidateId: 'a-HB', name: 'AN HB', post: 'HB', total: 1, branch: 'AN' }
        ],
        officerCodes: []
      }
    ]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/current?branch=dwarka');

    expect(response.status).toBe(200);
    expect(response.body.report.totalVotes).toBe(3);
  });

  it('returns null when no election has ever been set up', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: null,
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getArchives.mockReturnValue([]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/current');

    expect(response.status).toBe(200);
    expect(response.body.report).toBeNull();
  });
});

describe('GET /api/report/archives/:id', () => {
  const archive: ElectionArchive = {
    id: 'archive-1',
    archivedAt: 100,
    electionType: 'school',
    totalVotes: 3,
    results: [
      { candidateId: 'hb-1', name: 'Dwarka Head Boy', post: 'HB', total: 1, branch: 'dwarka' },
      { candidateId: 'hb-2', name: 'AN Head Boy', post: 'HB', total: 2, branch: 'AN' }
    ],
    officerCodes: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getArchive.mockReturnValue(archive);
  });

  it('returns the archive combined when no branch is given', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/archives/archive-1');

    expect(response.status).toBe(200);
    expect(response.body.report.results).toHaveLength(2);
    expect(response.body.report.totalVotes).toBe(3);
  });

  it('narrows an archive to just the Dwarka branch', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/archives/archive-1?branch=dwarka');

    expect(response.status).toBe(200);
    expect(response.body.report.results).toEqual([
      expect.objectContaining({ candidateId: 'hb-1', total: 1, branch: 'dwarka' })
    ]);
    expect(response.body.report.totalVotes).toBe(1);
  });

  it('returns 404 for an archive that does not exist, even with a branch filter', async () => {
    mockedDataStore.getArchive.mockReturnValue(undefined);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/archives/nope?branch=AN');
    expect(response.status).toBe(404);
  });

  it('rejects an invalid branch', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/report/archives/archive-1?branch=nonsense');
    expect(response.status).toBe(400);
  });
});
