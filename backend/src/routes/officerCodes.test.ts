import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionRun, OfficerCode } from '../types/election.js';

// Regression tests for two integrity rules decided 2026-09-22:
// 1. A code cannot activate a ballot until it has been allotted to a named
//    polling officer (see kiosk.test.ts for that half).
// 2. A code can only be deleted if it has NEVER been named AND has never
//    cast a vote -- once named, it's permanent regardless of vote count
//    (ELECTION-INTEGRITY-AND-TRUST.md item 3's stricter rule).
// Plus (2026-09-23, superseded 2026-09-23 later the same day): generation
// is no longer gated on an active run -- codes are prep work, like
// candidates, generated any time and carried into whichever matching run
// starts next (see runService.ts startRecording).

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
  bulkAllotOfficerCodes: vi.fn<unknown[], OfficerCode[]>(() => []),
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

  it('generates codes with no run tagged when no recording is active', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
    mockedDataStore.generateOfficerCodes.mockReturnValue([{ ...baseCode }]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/generate').send({ count: 5 });

    expect(response.status).toBe(201);
    expect(mockedDataStore.generateOfficerCodes).toHaveBeenCalledWith(5, 'school', undefined, undefined, undefined);
  });

  it('generates House codes with no run tagged while the active recording is for School Elections', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    mockedDataStore.generateOfficerCodes.mockReturnValue([{ ...baseCode, electionType: 'house' }]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/generate').send({ count: 5, house: 'Anand' });

    expect(response.status).toBe(201);
    expect(mockedDataStore.generateOfficerCodes).toHaveBeenCalledWith(5, 'house', 'Anand', undefined, undefined);
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

describe('POST /api/officer-codes/bulk-allot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
  });

  it('rejects an invalid branch', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({ branch: 'nonsense', allotments: [{ officerName: 'A', electionType: 'school' }] });

    expect(response.status).toBe(400);
    expect(mockedDataStore.bulkAllotOfficerCodes).not.toHaveBeenCalled();
  });

  it('rejects an empty allotments list', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({ branch: 'dwarka', allotments: [] });

    expect(response.status).toBe(400);
    expect(mockedDataStore.bulkAllotOfficerCodes).not.toHaveBeenCalled();
  });

  it('rejects an allotment with a blank officer name', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({ branch: 'dwarka', allotments: [{ officerName: '   ', electionType: 'school' }] });

    expect(response.status).toBe(400);
    expect(mockedDataStore.bulkAllotOfficerCodes).not.toHaveBeenCalled();
  });

  it('rejects a house allotment with a missing or invalid house', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({ branch: 'dwarka', allotments: [{ officerName: 'Jane', electionType: 'house' }] });

    expect(response.status).toBe(400);
    expect(mockedDataStore.bulkAllotOfficerCodes).not.toHaveBeenCalled();
  });

  it('allots a mixed batch, tagging each entry with the shared branch and its own type/house', async () => {
    const created: OfficerCode[] = [
      { code: 'aaa111', officerName: 'Jane', everNamed: true, electionType: 'school', createdAt: Date.now(), branch: 'dwarka' },
      { code: 'bbb222', officerName: 'Priya', everNamed: true, electionType: 'house', house: 'Anand', createdAt: Date.now(), branch: 'dwarka' }
    ];
    mockedDataStore.bulkAllotOfficerCodes.mockReturnValue(created);

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({
        branch: 'dwarka',
        allotments: [
          { officerName: 'Jane', electionType: 'school' },
          { officerName: 'Priya', electionType: 'house', house: 'Anand' }
        ]
      });

    expect(response.status).toBe(201);
    expect(mockedDataStore.bulkAllotOfficerCodes).toHaveBeenCalledWith([
      { officerName: 'Jane', electionType: 'school', house: undefined, branch: 'dwarka', runId: undefined },
      { officerName: 'Priya', electionType: 'house', house: 'Anand', branch: 'dwarka', runId: undefined }
    ]);
    expect(response.body.codes).toEqual(created);
  });

  it('logs one bulkAllot summary entry plus one officerCode.name entry per created code', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    const created: OfficerCode[] = [
      { code: 'aaa111', officerName: 'Jane', everNamed: true, electionType: 'school', createdAt: Date.now(), branch: 'dwarka' }
    ];
    mockedDataStore.bulkAllotOfficerCodes.mockReturnValue(created);

    const { createApp } = await import('../app.js');
    await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({ branch: 'dwarka', allotments: [{ officerName: 'Jane', electionType: 'school' }] });

    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'officerCode.bulkAllot', details: expect.objectContaining({ count: 1, codes: ['aaa111'] }) })
    );
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'officerCode.name', details: { code: 'aaa111', officerName: 'Jane' } })
    );
  });
});
