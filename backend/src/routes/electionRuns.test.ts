import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionArchive, ElectionRun, LogEntry, OfficerCode, PollState, StoredVote } from '../types/election.js';

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
  searchLogEntries: vi.fn(() => []),
  getPollState: vi.fn<[], PollState>(),
  updatePollState: vi.fn((updater: (state: PollState) => PollState) =>
    updater({ activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } })
  ),
  getVotes: vi.fn<[], StoredVote[]>(() => []),
  getCountedVotes: vi.fn<[], StoredVote[]>(() => []),
  countCountedVotesByOfficerCode: vi.fn<[string], number>(() => 0),
  getOfficerCodes: vi.fn<[], OfficerCode[]>(() => []),
  resetVotesByType: vi.fn(),
  reopenOfficerCodesByType: vi.fn(),
  closeOfficerCodesByType: vi.fn(),
  stampOfficerCodesRunId: vi.fn(),
  getArchives: vi.fn<[], ElectionArchive[]>(() => []),
  getArchive: vi.fn<[string], ElectionArchive | undefined>(),
  getLogEntries: vi.fn<[string], LogEntry[]>(() => []),
  startRun: vi.fn(),
  closeRun: vi.fn(),
  appendLogEntry: vi.fn()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

const mockedArchiveCurrentElection = vi.fn();
const mockedBuildElectionSnapshot = vi.fn<[string?], ElectionArchive | null>();
vi.mock('../services/resultsService.js', () => ({
  archiveCurrentElection: mockedArchiveCurrentElection,
  buildElectionSnapshot: mockedBuildElectionSnapshot,
  // Stand-in that only narrows the booths -- enough to see it was applied.
  filterArchiveByBranch: (archive: ElectionArchive, branch: string) => ({
    ...archive,
    branch,
    officerCodes: archive.officerCodes.filter((entry) => (entry.branch ?? 'dwarka') === branch)
  })
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

  it('resets votes and reopens any closed booths for the run\'s type, tags codes with the new run, and logs run.start', async () => {
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
    // Codes (and their officer-name allotments) are prep work now, carried
    // forward across elections -- starting a run must not wipe them out,
    // only reopen any booth left closed from the previous election.
    expect(mockedDataStore.reopenOfficerCodesByType).toHaveBeenCalledWith('school');
    expect(mockedDataStore.startRun).toHaveBeenCalledWith('school', 'School Elections -- Term 1', expect.any(String));
    expect(mockedDataStore.stampOfficerCodesRunId).toHaveBeenCalledWith('school', runningRun.id);
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

  // One rule (2026-10-01): every code of the election, both branches, must
  // be deleted or closed AND sealed -- even a booth with no votes. Also the
  // safety valve against ending the election while booths still poll.
  describe('End of Voting needs every code deleted or closed and sealed', () => {
    const seal = { sealedAt: 1, sealedBy: 'x', paperListCount: 5, appCount: 5 };
    const repoll = { orderedAt: 1, orderedBy: 'x', reason: 'disruption' as const, note: '', cancelledVoteCount: 3, replacementCode: 'new001' };

    afterEach(() => {
      mockedDataStore.getOfficerCodes.mockReturnValue([]);
    });

    it('refuses while any code is unallotted, still polling, or closed but not sealed -- naming each', async () => {
      mockedDataStore.getCurrentRun.mockReturnValue(runningRun);
      mockedDataStore.getOfficerCodes.mockReturnValue([
        { code: 'seal01', officerName: 'A', electionType: 'school', createdAt: 1, closedAt: 2, seal },
        { code: 'spare1', officerName: '', electionType: 'school', createdAt: 1 },
        { code: 'open01', officerName: 'Mrs. Sharma', electionType: 'school', createdAt: 1, branch: 'AN' },
        { code: 'shut01', officerName: 'Absent', electionType: 'school', createdAt: 1, closedAt: 2 },
        { code: 'old001', officerName: 'B', electionType: 'school', createdAt: 1, closedAt: 2, repoll },
        { code: 'house1', officerName: 'C', electionType: 'house', house: 'Anand', createdAt: 1 }
      ]);

      const { createApp } = await import('../app.js');
      const response = await request(createApp()).post('/api/election-runs/close');

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BOOTHS_NOT_READY');
      expect(response.body.details).toEqual({ unallottedCodes: ['spare1'], openCodes: ['open01'], unsealedCodes: ['shut01'] });
      expect(response.body.error).toContain('delete 1 unallotted code (spare1)');
      expect(response.body.error).toContain('close 1 booth that is still polling');
      expect(response.body.error).toContain('open01 (Mrs. Sharma)');
      expect(response.body.error).toContain('Verify & Seal 1 closed booth (shut01 (Absent))');
      expect(mockedArchiveCurrentElection).not.toHaveBeenCalled();
      expect(mockedDataStore.closeRun).not.toHaveBeenCalled();
    });

    it('goes through once every code is sealed (re-polled codes and the other election type ignored)', async () => {
      mockedDataStore.getCurrentRun.mockReturnValue(runningRun);
      mockedDataStore.getOfficerCodes.mockReturnValue([
        { code: 'seal01', officerName: 'A', electionType: 'school', createdAt: 1, closedAt: 2, seal },
        { code: 'old001', officerName: 'B', electionType: 'school', createdAt: 1, closedAt: 2, repoll },
        { code: 'house1', officerName: 'C', electionType: 'house', house: 'Anand', createdAt: 1 }
      ]);
      mockedDataStore.closeRun.mockResolvedValue({ ...runningRun, status: 'closed', archiveIds: [] });

      const { createApp } = await import('../app.js');
      const response = await request(createApp()).post('/api/election-runs/close');

      expect(response.status).toBe(200);
      expect(mockedDataStore.closeRun).toHaveBeenCalled();
    });
  });

  it('refuses to close when no recording is active', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/election-runs/close');

    expect(response.status).toBe(400);
    expect(mockedArchiveCurrentElection).not.toHaveBeenCalled();
  });

  it('archives, closes the poll, and seals the run -- WITHOUT resetting votes', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);
    mockedDataStore.getArchives.mockReturnValue([
      { id: 'archive-1', archivedAt: Date.now(), electionType: 'school', totalVotes: 5, results: [], officerCodes: [] }
    ]);
    mockedDataStore.closeRun.mockResolvedValue({ ...runningRun, status: 'closed', archiveIds: ['archive-1'] });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/election-runs/close');

    expect(response.status).toBe(200);
    expect(mockedArchiveCurrentElection).toHaveBeenCalledWith(runningRun.name);
    // Reversed 2026-09-24, by direct request: the live vote count is left in
    // place at close (Live Results, the Dashboard total, each officer code's
    // turnout all keep showing the final tally) -- it only resets once a new
    // election of that type is deliberately started (see the "start" tests
    // below, where resetVotesByType is very much still asserted).
    expect(mockedDataStore.resetVotesByType).not.toHaveBeenCalled();
    // Officer codes (and their officer-name allotments) are prep work that
    // survives Close Recording, same as candidates -- closing must not wipe
    // them out.
    expect(mockedDataStore.reopenOfficerCodesByType).not.toHaveBeenCalled();
    // ...but every booth's duty is over: red on the Officer Codes tab, and
    // no longer able to activate a ballot.
    expect(mockedDataStore.closeOfficerCodesByType).toHaveBeenCalledWith('school');
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

describe('GET /api/election-runs/log/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an invalid election type', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/log/search?electionType=nonsense');
    expect(response.status).toBe(400);
    expect(mockedDataStore.searchLogEntries).not.toHaveBeenCalled();
  });

  it('rejects an invalid branch', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/log/search?branch=nonsense');
    expect(response.status).toBe(400);
    expect(mockedDataStore.searchLogEntries).not.toHaveBeenCalled();
  });

  it('passes query params through as a filter, coercing adminOnly to a boolean', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get(
      '/api/election-runs/log/search?electionType=house&branch=AN&actor=Rajeev&action=officerCode&code=abc123&adminOnly=true'
    );
    expect(response.status).toBe(200);
    expect(mockedDataStore.searchLogEntries).toHaveBeenCalledWith({
      runId: undefined,
      electionType: 'house',
      branch: 'AN',
      actor: 'Rajeev',
      action: 'officerCode',
      code: 'abc123',
      adminOnly: true
    });
  });

  it('defaults adminOnly to false when omitted', async () => {
    const { createApp } = await import('../app.js');
    await request(createApp()).get('/api/election-runs/log/search');
    expect(mockedDataStore.searchLogEntries).toHaveBeenCalledWith(
      expect.objectContaining({ adminOnly: false })
    );
  });
});

describe('GET /api/election-runs/:id/record', () => {
  const archive: ElectionArchive = {
    id: 'arch-1',
    archivedAt: 5,
    electionType: 'school',
    totalVotes: 3,
    results: [],
    officerCodes: [
      { code: 'aaa111', officerName: 'Jane', voteCount: 2, branch: 'dwarka' },
      { code: 'bbb222', officerName: 'Ravi', voteCount: 1, branch: 'AN' }
    ]
  };
  const log: LogEntry[] = [
    { id: 'l1', timestamp: 1, runId: 'run-1', actor: 'Rajeev', action: 'run.start' },
    { id: 'l2', timestamp: 2, runId: 'run-1', actor: 'Rajeev', action: 'officerCode.seal', branch: 'dwarka' },
    { id: 'l3', timestamp: 3, runId: 'run-1', actor: 'Rajeev', action: 'officerCode.seal', branch: 'AN' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getLogEntries.mockReturnValue(log);
  });

  it('gives an ended election its saved results, as final, with its whole log', async () => {
    mockedDataStore.getRun.mockReturnValue({ ...runningRun, status: 'closed', closedAt: 9, closedBy: 'Rajeev', archiveIds: ['arch-1'] });
    mockedDataStore.getArchive.mockReturnValue(archive);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/run-1/record');

    expect(response.status).toBe(200);
    expect(response.body.final).toBe(true);
    expect(response.body.report.id).toBe('arch-1');
    expect(response.body.log).toHaveLength(3);
    expect(mockedDataStore.getLogEntries).toHaveBeenCalledWith('run-1');
    expect(mockedBuildElectionSnapshot).not.toHaveBeenCalled();
  });

  it('narrows to one branch: its booths, and only log entries about that branch or both', async () => {
    mockedDataStore.getRun.mockReturnValue({ ...runningRun, status: 'closed', archiveIds: ['arch-1'] });
    mockedDataStore.getArchive.mockReturnValue(archive);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/run-1/record?branch=AN');

    expect(response.body.report.officerCodes.map((entry: { code: string }) => entry.code)).toEqual(['bbb222']);
    expect(response.body.log.map((entry: LogEntry) => entry.id)).toEqual(['l1', 'l3']);
  });

  it('gives a running election live results, marked not final', async () => {
    mockedDataStore.getRun.mockReturnValue(runningRun);
    mockedDataStore.getPollState.mockReturnValue({ activeElectionType: 'school', settings: { isOpen: true, allowRevote: false } });
    mockedBuildElectionSnapshot.mockReturnValue({ ...archive, id: 'live' });
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/run-1/record');

    expect(response.body.final).toBe(false);
    expect(response.body.report.id).toBe('live');
  });

  it('still opens when the saved results were deleted from Election History', async () => {
    mockedDataStore.getRun.mockReturnValue({ ...runningRun, status: 'closed', archiveIds: ['gone'] });
    mockedDataStore.getArchive.mockReturnValue(undefined);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/election-runs/run-1/record');

    expect(response.status).toBe(200);
    expect(response.body.report).toBeNull();
    expect(response.body.log).toHaveLength(3);
  });

  it('404s for an unknown election and 400s for an unknown branch', async () => {
    mockedDataStore.getRun.mockReturnValue(undefined);
    const { createApp } = await import('../app.js');
    expect((await request(createApp()).get('/api/election-runs/nope/record')).status).toBe(404);
    expect((await request(createApp()).get('/api/election-runs/run-1/record?branch=xyz')).status).toBe(400);
  });
});
