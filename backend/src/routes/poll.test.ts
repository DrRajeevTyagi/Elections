import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionRun, PollState } from '../types/election.js';

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
  resetVotes: vi.fn()
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

// Regression test: Reset Poll used to silently close the poll as a side
// effect with no guard at all -- a voter could be mid-ballot right now if
// the poll is still open, and wiping votes out from under them risks losing
// an in-progress vote with no warning. The admin UI already disabled the
// button while open, but the route itself had no server-side check.
describe('POST /api/poll/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.updatePollState.mockImplementation((updater) =>
      updater(mockedDataStore.getPollState())
    );
    // clearAllMocks() clears call history but not a previously-set
    // mockReturnValue -- pin this explicitly so it doesn't inherit
    // `runningRun` left behind by an earlier describe block's test.
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
  });

  it('is blocked while the poll is open', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      activeElectionTypeSetAt: Date.now(),
      settings: { isOpen: true, allowRevote: false }
    });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/poll/reset').send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Close the poll');
    expect(mockedDataStore.resetVotes).not.toHaveBeenCalled();
    expect(mockedArchiveCurrentElection).not.toHaveBeenCalled();
  });

  it('succeeds while the poll is closed', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      activeElectionTypeSetAt: Date.now(),
      settings: { isOpen: false, allowRevote: false }
    });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/poll/reset').send({});

    expect(response.status).toBe(200);
    expect(mockedDataStore.resetVotes).toHaveBeenCalled();
    expect(mockedArchiveCurrentElection).toHaveBeenCalled();
  });
});
