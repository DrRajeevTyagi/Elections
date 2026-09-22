import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionArchive, ElectionRun, OfficerCode, PollState, StoredVote } from '../types/election.js';

// Regression tests for "Start Recording" / "Close Recording" (ROADMAP.md
// Phase 3, ELECTION-INTEGRITY-AND-TRUST.md items 5/11): the run boundary
// that turns the action log on, and the vote/code reset that goes with it.

const runningRun: ElectionRun = {
  id: 'run-1',
  electionType: 'school',
  name: 'Test Run',
  status: 'running',
  startedAt: Date.now(),
  startedBy: 'actor-1'
};

const mockedDataStore = {
  getCurrentRun: vi.fn<[], ElectionRun | undefined>(),
  getRuns: vi.fn<[], ElectionRun[]>(() => []),
  getRun: vi.fn<[string], ElectionRun | undefined>(),
  getLogEntries: vi.fn(() => []),
  getPollState: vi.fn<[], PollState>(),
  updatePollState: vi.fn((updater: (state: PollState) => PollState) =>
    updater({ activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } })
  ),
  getVotes: vi.fn<[], StoredVote[]>(() => []),
  getOfficerCodes: vi.fn<[], OfficerCode[]>(() => []),
  resetVotesByType: vi.fn(),
  resetOfficerCodesByType: vi.fn(),
  getArchives: vi.fn<[], ElectionArchive[]>(() => []),
  startRun: vi.fn(),
  closeRun: vi.fn(),
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

describe('POST /api/election-runs/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
    mockedDataStore.getPollState.mockReturnValue({ activeElectionType: null, settings: { isOpen: false, allowRevote: false } });
    mockedDataStore.startRun.mockResolvedValue(runningRun);
  });

  it('rejects a blank name', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/election-runs/start').send({ electionType: 'school', name: '   ' });

    expect(response.status).toBe(400);
    expect(mockedDataStore.startRun).not.toHaveBeenCalled();
  });

  it('refuses to start a second recording while one is already active', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/election-runs/start')
      .send({ electionType: 'school', name: 'Another Run' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('already active');
    expect(mockedDataStore.startRun).not.toHaveBeenCalled();
  });

  it('resets votes/codes for the run\'s type and logs run.start', async () => {
    // First call is startRecording's "is one already active?" check (must
    // be undefined so this test's action proceeds); every call after that
    // is logAction's own "is a run active" check, which should now see the
    // run that startRun just created -- same as the real DataStore would.
    mockedDataStore.getCurrentRun.mockReturnValueOnce(undefined).mockReturnValue(runningRun);

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/election-runs/start')
      .send({ electionType: 'school', name: 'School Elections -- Term 1' });

    expect(response.status).toBe(201);
    expect(mockedDataStore.resetVotesByType).toHaveBeenCalledWith('school');
    expect(mockedDataStore.resetOfficerCodesByType).toHaveBeenCalledWith('school');
    expect(mockedDataStore.startRun).toHaveBeenCalledWith('school', 'School Elections -- Term 1', expect.any(String));
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ runId: runningRun.id, action: 'run.start' })
    );
  });
});

describe('POST /api/election-runs/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getPollState.mockReturnValue({ activeElectionType: 'school', settings: { isOpen: true, allowRevote: false } });
  });

  it('refuses to close when no recording is active', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/election-runs/close');

    expect(response.status).toBe(400);
    expect(mockedArchiveCurrentElection).not.toHaveBeenCalled();
  });

  it('archives, resets, closes the poll, and seals the run', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);
    mockedDataStore.getArchives.mockReturnValue([
      { id: 'archive-1', archivedAt: Date.now(), electionType: 'school', totalVotes: 5, results: [], officerCodes: [] }
    ]);
    mockedDataStore.closeRun.mockResolvedValue({ ...runningRun, status: 'closed', archiveIds: ['archive-1'] });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/election-runs/close');

    expect(response.status).toBe(200);
    expect(mockedArchiveCurrentElection).toHaveBeenCalledWith(runningRun.name);
    expect(mockedDataStore.resetVotesByType).toHaveBeenCalledWith('school');
    expect(mockedDataStore.resetOfficerCodesByType).toHaveBeenCalledWith('school');
    expect(mockedDataStore.closeRun).toHaveBeenCalledWith(runningRun.id, expect.any(String), ['archive-1']);
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ runId: runningRun.id, action: 'run.close' })
    );
    expect(response.body.run.status).toBe('closed');
  });
});

describe('GET /api/election-runs/current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no run is active', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/current');
    expect(response.body.run).toBeNull();
  });

  it('returns the active run', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/current');
    expect(response.body.run.id).toBe(runningRun.id);
  });
});
