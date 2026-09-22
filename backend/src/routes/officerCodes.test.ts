import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionRun, OfficerCode } from '../types/election.js';

// Regression tests for two integrity rules decided 2026-09-22:
// 1. A code cannot activate a ballot until it has been allotted to a named
//    polling officer (see kiosk.test.ts for that half).
// 2. A code can only be deleted if it has NEVER been named AND has never
//    cast a vote -- once named, it's permanent regardless of vote count
//    (ELECTION-INTEGRITY-AND-TRUST.md item 3's stricter rule).
// Plus (2026-09-23): generation is gated on an active run matching the
// code's election type (ROADMAP.md Phase 3).

const baseCode: OfficerCode = {
  code: 'ABC123',
  officerName: '',
  everNamed: false,
  electionType: 'school',
  createdAt: Date.now()
};

const mockedDataStore = {
  findOfficerCode: vi.fn<[string], OfficerCode | undefined>(),
  countVotesByOfficerCode: vi.fn<[string], number>(),
  deleteOfficerCode: vi.fn(),
  updateOfficerCode: vi.fn(),
  reopenOfficerCode: vi.fn(),
  generateOfficerCodes: vi.fn<unknown[], OfficerCode[]>(() => []),
  getOfficerCodes: vi.fn<[], OfficerCode[]>(() => []),
  getCurrentRun: vi.fn<[], ElectionRun | undefined>(() => undefined),
  appendLogEntry: vi.fn()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

vi.mock('../middleware/adminAuth.js', () => ({
  requireAdminSession: [(_req: unknown, _res: unknown, next: () => void) => next()],
  requireAdminSecret: [(_req: unknown, _res: unknown, next: () => void) => next()]
}));

const runningSchoolRun: ElectionRun = {
  id: 'run-1',
  electionType: 'school',
  name: 'Test Run',
  status: 'running',
  startedAt: Date.now(),
  startedBy: 'actor-1'
};

describe('DELETE /api/officer-codes/:code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(0);
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
  });

  it('refuses to delete a code that has already cast votes', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode });
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(3);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('cannot be deleted');
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });

  it('refuses to delete a code that was named but has zero votes', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', everNamed: true });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('allotted to a polling officer');
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });

  it('refuses to delete a code that was named, then cleared back to blank', async () => {
    // everNamed stays true even after officerName is edited back to '' --
    // that distinction is the whole point of the flag.
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: '', everNamed: true });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(409);
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });

  it('allows deleting a never-named code with zero votes', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(204);
    expect(mockedDataStore.deleteOfficerCode).toHaveBeenCalledWith('ABC123');
  });

  it('returns 400 for a code that does not exist', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/NOPE00');

    expect(response.status).toBe(400);
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/officer-codes/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to generate codes when no recording is active', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/generate').send({ count: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Start a recording');
    expect(mockedDataStore.generateOfficerCodes).not.toHaveBeenCalled();
  });

  it('refuses to generate House codes while the active recording is for School Elections', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/generate').send({ count: 5, house: 'Anand' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('not House Elections');
    expect(mockedDataStore.generateOfficerCodes).not.toHaveBeenCalled();
  });

  it('generates codes tagged with the active matching run, and logs the action', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    mockedDataStore.generateOfficerCodes.mockReturnValue([{ ...baseCode, runId: runningSchoolRun.id }]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/generate').send({ count: 1 });

    expect(response.status).toBe(201);
    expect(mockedDataStore.generateOfficerCodes).toHaveBeenCalledWith(1, 'school', undefined, undefined, runningSchoolRun.id);
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ runId: runningSchoolRun.id, action: 'officerCode.generate' })
    );
  });
});
