import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, ElectionRun, PollState } from '../types/election.js';

// Regression test: the "Election for X Posts" banner (AppLayout.tsx, shared
// by the admin dashboard and the kiosk) is meant to show as soon as an
// election type is picked, even before Open Poll -- so GET /api/poll must
// not clear a freshly-picked activeElectionType just because no run has
// started yet. The one thing it must still correct is a truly stale value
// left over from before activeElectionTypeSetAt existed, which can never
// self-correct on its own -- see routes/poll.ts's healStaleElectionType.

const mockedDataStore = {
  getPollState: vi.fn<[], PollState>(),
  getCurrentRun: vi.fn<[], ElectionRun | undefined>(),
  updatePollState: vi.fn<[(state: PollState) => PollState], PollState>(),
  getCandidates: vi.fn<[], Candidate[]>(() => []),
  appendLogEntry: vi.fn()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

const mockedArchiveCurrentElection = vi.fn();
vi.mock('../services/resultsService.js', () => ({
  archiveCurrentElection: mockedArchiveCurrentElection
}));

const mockedKioskService = { clearSessions: vi.fn() };
vi.mock('../services/kioskService.js', () => ({
  kioskService: mockedKioskService
}));

vi.mock('../middleware/adminAuth.js', () => ({
  requireAdminSession: [(_req: unknown, _res: unknown, next: () => void) => next()],
  requireAdminSecret: [(_req: unknown, _res: unknown, next: () => void) => next()]
}));

const runningRun: ElectionRun = {
  id: 'run-1',
  electionType: 'house',
  name: 'Test Run',
  status: 'running',
  startedAt: Date.now(),
  startedBy: 'actor-1'
};

describe('GET /api/poll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.updatePollState.mockImplementation((updater) =>
      updater(mockedDataStore.getPollState())
    );
  });

  it('self-heals a pre-existing stale activeElectionType (no timestamp, no run active)', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'house', // leftover from before activeElectionTypeSetAt existed
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/poll');

    expect(response.status).toBe(200);
    expect(response.body.poll.activeElectionType).toBe(null);
    expect(mockedDataStore.updatePollState).toHaveBeenCalled();
  });

  it('keeps a freshly-picked activeElectionType even with no run active yet', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'house',
      activeElectionTypeSetAt: Date.now(),
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/poll');

    expect(response.status).toBe(200);
    expect(response.body.poll.activeElectionType).toBe('house');
    expect(response.body.poll.hasActiveRun).toBe(false);
    expect(mockedDataStore.updatePollState).not.toHaveBeenCalled();
  });

  it('reports hasActiveRun: true while a run is genuinely active', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'house',
      activeElectionTypeSetAt: Date.now(),
      settings: { isOpen: true, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/poll');

    expect(response.status).toBe(200);
    expect(response.body.poll.hasActiveRun).toBe(true);
  });
});

const fullSchoolSlate: Candidate[] = (['HB', 'HG', 'SSC', 'SRC', 'SCC'] as const).map((post) => ({
  id: `${post}-1`,
  name: `${post} One`,
  post,
  electionType: 'school',
  branch: 'dwarka'
}));

// The old standalone "Open Poll" button could open voting with no named
// election behind it. Only the Start wizard and "Re-start Polling" open
// voting now, both during an election -- the server must refuse the rest.
describe('POST /api/poll/open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.updatePollState.mockImplementation((updater) =>
      updater(mockedDataStore.getPollState())
    );
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      activeElectionTypeSetAt: Date.now(),
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getCandidates.mockReturnValue(fullSchoolSlate);
  });

  it('is refused when no election has been started', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/poll/open');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Start the Voting Process');
    expect(mockedDataStore.updatePollState).not.toHaveBeenCalled();
  });

  it('opens voting during an election (wizard last step / Re-start Polling)', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue({ ...runningRun, electionType: 'school' });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/poll/open');

    expect(response.status).toBe(200);
    expect(response.body.poll.settings.isOpen).toBe(true);
  });
});

describe('POST /api/poll/reset', () => {
  it('no longer exists', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/poll/reset').send({});
    expect(response.status).toBe(404);
  });
});
