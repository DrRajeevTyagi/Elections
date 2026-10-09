import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, ElectionRun, OfficerCode, StoredVote } from '../types/election.js';

// Regression tests for two integrity rules decided 2026-09-22:
// 1. A code cannot activate a ballot until it has been allotted to a named
//    polling officer (see kiosk.test.ts for that half).
// 2. A code can only be deleted if it has never cast a vote (revised
//    2026-09-25 -- the original rule also blocked a named-but-unvoted code
//    permanently, ELECTION-INTEGRITY-AND-TRUST.md item 3's stricter rule,
//    which no longer fits how codes are actually allotted: a whole staff
//    roster gets a code each, and it's routine for some not to be used).
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
  removeOfficerCodesByType: vi.fn<[string], number>(() => 0),
  updateOfficerCode: vi.fn<unknown[], OfficerCode | undefined>(),
  markOfficerCodesSent: vi.fn<unknown[], OfficerCode[]>(() => []),
  orderRepoll: vi.fn<unknown[], { original: OfficerCode; replacement: OfficerCode } | undefined>(),
  countCountedVotesByOfficerCode: vi.fn<[string], number>(() => 0),
  startFreshDuties: vi.fn<[string], number>(() => 0),
  sealOfficerCode: vi.fn<unknown[], OfficerCode | undefined>(),
  reopenOfficerCode: vi.fn(),
  closeOfficerCode: vi.fn<[string], OfficerCode | undefined>(),
  generateOfficerCodes: vi.fn<unknown[], OfficerCode[]>(() => []),
  bulkAllotOfficerCodes: vi.fn<unknown[], OfficerCode[]>(() => []),
  getOfficerCodes: vi.fn<[], OfficerCode[]>(() => []),
  getCurrentRun: vi.fn<[], ElectionRun | undefined>(() => undefined),
  appendLogEntry: vi.fn(),
  // Read by resultsService.votesByCandidateForCode (re-poll breakdown).
  getVotes: vi.fn<[], StoredVote[]>(() => []),
  getCandidates: vi.fn<[], Candidate[]>(() => [])
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
  // The vote/seal/re-poll protections apply only while the code's own
  // election is running -- so these tests run with School running.
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(0);
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
  });

  // Decided 2026-10-09: between elections every code can be deleted, so a
  // new election can start from a clean list (End of Voting has already
  // archived the full record of every booth).
  it('allows deleting a used, sealed or re-polled code when its election is not running', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(12);
    const { createApp } = await import('../app.js');
    const sealed = { sealedAt: 1, sealedBy: 'x', paperListCount: 12, appCount: 12 };
    const repoll = { orderedAt: 1, orderedBy: 'x', reason: 'disruption' as const, note: '', cancelledVoteCount: 12, replacementCode: 'new999' };
    for (const entry of [
      { ...baseCode, officerName: 'Jane' },
      { ...baseCode, officerName: 'Jane', seal: sealed },
      { ...baseCode, officerName: 'Jane', repoll },
      { ...baseCode, officerName: 'Jane', replacesCode: 'old111' }
    ]) {
      mockedDataStore.findOfficerCode.mockReturnValueOnce(entry);
      const response = await request(createApp()).delete('/api/officer-codes/ABC123');
      expect(response.status).toBe(204);
    }
    expect(mockedDataStore.deleteOfficerCode).toHaveBeenCalledTimes(4);
  });

  it('allows deleting a used School code while House elections are running', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue({ ...runningSchoolRun, electionType: 'house' });
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane' });
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(5);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');
    expect(response.status).toBe(204);
    expect(mockedDataStore.deleteOfficerCode).toHaveBeenCalledWith('ABC123');
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

  // Revised 2026-09-25: a named-but-unvoted code is now deletable, matching
  // the real workflow -- a whole staff roster gets a code each, sent by
  // WhatsApp, and it's routine for some teachers not to report for duty.
  it('allows deleting a code that was named but has zero votes', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', everNamed: true });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(204);
    expect(mockedDataStore.deleteOfficerCode).toHaveBeenCalledWith('ABC123');
  });

  it('allows deleting a code that was named, then cleared back to blank', async () => {
    // everNamed stays true even after officerName is edited back to '' --
    // no longer relevant to deletion (see above), but the flag itself is
    // still tracked for other purposes, so this exercises it wasn't a
    // silent trigger for a 409 either.
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: '', everNamed: true });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(204);
    expect(mockedDataStore.deleteOfficerCode).toHaveBeenCalledWith('ABC123');
  });

  it('allows deleting a never-named code with zero votes', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(204);
    expect(mockedDataStore.deleteOfficerCode).toHaveBeenCalledWith('ABC123');
  });

  // The one and only remaining condition: a vote was actually cast. Covered
  // above by 'refuses to delete a code that has already cast votes', with a
  // NAMED code too, since that's the realistic case (an unnamed code can't
  // vote at all -- see kiosk.ts activate).
  it('refuses to delete a named code that has already cast votes', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', everNamed: true });
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(1);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('cannot be deleted');
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });

  it('returns 400 for a code that does not exist', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).delete('/api/officer-codes/NOPE00');

    expect(response.status).toBe(400);
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });
});

// The admin-side equivalent of the kiosk's own self-service "Close Polling
// at This Booth" (kiosk.ts /close-booth) -- same underlying
// dataStore.closeOfficerCode, reachable without opening a kiosk tab.
describe('POST /api/officer-codes/:code/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes a code and logs it under the admin actor', async () => {
    // logAction no-ops with no run active (see its own comment) -- a run
    // must be active for this assertion on appendLogEntry to mean anything.
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    mockedDataStore.closeOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', everNamed: true, closedAt: Date.now() });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/close');

    expect(response.status).toBe(200);
    expect(mockedDataStore.closeOfficerCode).toHaveBeenCalledWith('ABC123');
    expect(response.body.code.closedAt).toBeDefined();
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'officerCode.close', details: { code: 'ABC123' } })
    );
  });

  it('returns 400 for a code that does not exist', async () => {
    mockedDataStore.closeOfficerCode.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/NOPE00/close');

    expect(response.status).toBe(400);
    expect(mockedDataStore.appendLogEntry).not.toHaveBeenCalled();
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

  // Phone numbers are saved with the code so the Send Codes screen can send
  // them later, after the upload window is closed.
  it('saves each allotment\'s WhatsApp number, treating a blank one as no number', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({
        branch: 'dwarka',
        allotments: [
          { officerName: 'Jane', electionType: 'school', phone: '919876543210' },
          { officerName: 'Priya', electionType: 'school', phone: '' }
        ]
      });

    expect(response.status).toBe(201);
    expect(mockedDataStore.bulkAllotOfficerCodes).toHaveBeenCalledWith([
      expect.objectContaining({ officerName: 'Jane', phone: '919876543210' }),
      expect.objectContaining({ officerName: 'Priya', phone: undefined })
    ]);
  });

  it('rejects a malformed WhatsApp number', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/bulk-allot')
      .send({ branch: 'dwarka', allotments: [{ officerName: 'Jane', electionType: 'school', phone: '98765-abc' }] });

    expect(response.status).toBe(400);
    expect(mockedDataStore.bulkAllotOfficerCodes).not.toHaveBeenCalled();
  });
});

describe('PUT /api/officer-codes/:code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
  });

  it('saves a WhatsApp number without touching or logging the officer name', async () => {
    mockedDataStore.updateOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', phone: '919876543210' });

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).put('/api/officer-codes/ABC123').send({ phone: '919876543210' });

    expect(response.status).toBe(200);
    expect(mockedDataStore.updateOfficerCode).toHaveBeenCalledWith('ABC123', { officerName: undefined, phone: '919876543210' });
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(expect.objectContaining({ action: 'officerCode.phone' }));
    expect(mockedDataStore.appendLogEntry).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'officerCode.name' }));
  });

  // Otherwise a used booth would count as "unallotted -- delete it" for End
  // of Voting while being undeletable, so the election could never close.
  it('refuses to erase the officer name of a booth that has votes or is sealed, but allows correcting it', async () => {
    const { createApp } = await import('../app.js');
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', everNamed: true });
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(4);
    const erased = await request(createApp()).put('/api/officer-codes/ABC123').send({ officerName: '  ' });

    mockedDataStore.countVotesByOfficerCode.mockReturnValue(0);
    mockedDataStore.findOfficerCode.mockReturnValue({
      ...baseCode,
      officerName: 'Jane',
      closedAt: 1,
      seal: { sealedAt: 1, sealedBy: 'x', paperListCount: 0, appCount: 0 }
    });
    const erasedSealed = await request(createApp()).put('/api/officer-codes/ABC123').send({ officerName: '' });

    mockedDataStore.updateOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane Smith' });
    const corrected = await request(createApp()).put('/api/officer-codes/ABC123').send({ officerName: 'Jane Smith' });

    expect(erased.status).toBe(409);
    expect(erasedSealed.status).toBe(409);
    expect(corrected.status).toBe(200);
    expect(mockedDataStore.updateOfficerCode).toHaveBeenCalledTimes(1);
  });

  it('still allows clearing the name of an unused code', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...baseCode, officerName: 'Jane', everNamed: true });
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(0);
    mockedDataStore.updateOfficerCode.mockReturnValue({ ...baseCode, officerName: '' });
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).put('/api/officer-codes/ABC123').send({ officerName: '' });
    expect(response.status).toBe(200);
  });

  it('rejects a malformed WhatsApp number', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).put('/api/officer-codes/ABC123').send({ phone: '12' });

    expect(response.status).toBe(400);
    expect(mockedDataStore.updateOfficerCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/officer-codes/:code/repoll', () => {
  const usedCode: OfficerCode = { ...baseCode, officerName: 'Jane', everNamed: true, phone: '919876543210', branch: 'dwarka' };
  const repollResult = (replacementName = 'Jane') => ({
    original: {
      ...usedCode,
      closedAt: Date.now(),
      repoll: { orderedAt: Date.now(), orderedBy: 'actor-1', reason: 'count-mismatch' as const, note: '', cancelledVoteCount: 12, replacementCode: 'new999', runId: 'run-1' }
    },
    replacement: { ...usedCode, code: 'new999', officerName: replacementName, replacesCode: 'ABC123' }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    mockedDataStore.findOfficerCode.mockReturnValue({ ...usedCode });
    mockedDataStore.orderRepoll.mockReturnValue(repollResult());
  });

  it('orders a re-poll for the same teacher, keeping their number, and logs it', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/ABC123/repoll')
      .set('x-admin-client-id', 'admin-tab-1')
      .send({ reason: 'count-mismatch', note: ' Register shows 10, app shows 12 ' });

    expect(response.status).toBe(201);
    expect(response.body.replacement.code).toBe('new999');
    expect(mockedDataStore.orderRepoll).toHaveBeenCalledWith(
      'ABC123',
      { orderedBy: 'admin-tab-1', reason: 'count-mismatch', note: 'Register shows 10, app shows 12', runId: 'run-1', cancelledByCandidate: [] },
      { officerName: 'Jane', phone: '919876543210' }
    );
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'officerCode.repoll',
        details: expect.objectContaining({ code: 'ABC123', cancelledVoteCount: 12, replacementCode: 'new999' })
      })
    );
  });

  it('gives the new code to a different teacher, without the old teacher\'s number', async () => {
    mockedDataStore.orderRepoll.mockReturnValue(repollResult('Priya'));
    const { createApp } = await import('../app.js');
    await request(createApp())
      .post('/api/officer-codes/ABC123/repoll')
      .send({ reason: 'irregularity', officerName: 'Priya' })
      .expect(201);

    expect(mockedDataStore.orderRepoll).toHaveBeenCalledWith('ABC123', expect.anything(), { officerName: 'Priya', phone: undefined });
  });

  it('freezes what the cancelled votes gave each candidate into the re-poll, and shows it beforehand', async () => {
    mockedDataStore.getCandidates.mockReturnValue([
      { id: 'hb-1', name: 'Asha', post: 'HB', electionType: 'school' },
      { id: 'hb-2', name: 'Ravi', post: 'HB', electionType: 'school' }
    ]);
    mockedDataStore.getVotes.mockReturnValue([
      { id: 'v1', timestamp: 1, electionType: 'school', officerCode: 'ABC123', selections: { HB: 'hb-1' } },
      { id: 'v2', timestamp: 2, electionType: 'school', officerCode: 'ABC123', selections: { HB: 'hb-1' } },
      { id: 'v3', timestamp: 3, electionType: 'school', officerCode: 'ABC123', selections: { HB: 'hb-2' } },
      { id: 'v4', timestamp: 4, electionType: 'school', officerCode: 'other1', selections: { HB: 'hb-2' } }
    ] as StoredVote[]);
    const expected = [
      { post: 'HB', candidateId: 'hb-1', name: 'Asha', count: 2 },
      { post: 'HB', candidateId: 'hb-2', name: 'Ravi', count: 1 }
    ];
    const { createApp } = await import('../app.js');

    const preview = await request(createApp()).get('/api/officer-codes/ABC123/vote-breakdown');
    expect(preview.status).toBe(200);
    expect(preview.body.breakdown).toEqual(expected);

    await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({ reason: 'disruption' }).expect(201);
    expect(mockedDataStore.orderRepoll).toHaveBeenCalledWith(
      'ABC123',
      expect.objectContaining({ cancelledByCandidate: expected }),
      expect.anything()
    );
  });

  it('refuses when that election is not running (e.g. after it was closed)', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({ reason: 'disruption' });

    expect(response.status).toBe(409);
    expect(mockedDataStore.orderRepoll).not.toHaveBeenCalled();
  });

  it('refuses a code from the other election type', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...usedCode, electionType: 'house', house: 'Anand' });
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({ reason: 'disruption' });

    expect(response.status).toBe(409);
  });

  it('refuses a second re-poll of the same code', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue(repollResult().original);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({ reason: 'disruption' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('new999');
  });

  it('needs a reason, and a note when the reason is "other"', async () => {
    const { createApp } = await import('../app.js');
    const noReason = await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({});
    const otherNoNote = await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({ reason: 'other', note: '  ' });

    expect(noReason.status).toBe(400);
    expect(otherNoNote.status).toBe(400);
    expect(mockedDataStore.orderRepoll).not.toHaveBeenCalled();
  });

  it('a re-polled code can never be reopened, nor deleted while its election runs', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue(repollResult().original);
    const { createApp } = await import('../app.js');
    const reopen = await request(createApp()).post('/api/officer-codes/ABC123/reopen');
    const remove = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect(reopen.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(mockedDataStore.reopenOfficerCode).not.toHaveBeenCalled();
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/officer-codes/:code/seal', () => {
  const closedBooth: OfficerCode = { ...baseCode, officerName: 'Jane', everNamed: true, closedAt: Date.now(), branch: 'dwarka' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    mockedDataStore.findOfficerCode.mockReturnValue({ ...closedBooth });
    mockedDataStore.countCountedVotesByOfficerCode.mockReturnValue(38);
    mockedDataStore.sealOfficerCode.mockImplementation((_code, seal) => ({ ...closedBooth, seal: seal as OfficerCode['seal'] }));
  });

  it('seals a closed booth when the Paper List matches the app, and logs both numbers', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/ABC123/seal')
      .set('x-admin-client-id', 'admin-tab-1')
      .send({ paperListCount: 38 });

    expect(response.status).toBe(200);
    expect(mockedDataStore.sealOfficerCode).toHaveBeenCalledWith(
      'ABC123',
      expect.objectContaining({ paperListCount: 38, appCount: 38, sealedBy: 'admin-tab-1' })
    );
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'officerCode.seal', details: expect.objectContaining({ paperListCount: 38, appCount: 38 }) })
    );
  });

  it('refuses when the counts do not match, giving both numbers', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 36 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SEAL_COUNT_MISMATCH');
    expect(response.body.details).toEqual({ appCount: 38, paperListCount: 36 });
    expect(mockedDataStore.sealOfficerCode).not.toHaveBeenCalled();
  });

  it('refuses a booth that is still open, already sealed, or re-polled', async () => {
    const { createApp } = await import('../app.js');
    mockedDataStore.findOfficerCode.mockReturnValueOnce({ ...closedBooth, closedAt: undefined });
    const open = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 38 });
    mockedDataStore.findOfficerCode.mockReturnValueOnce({ ...closedBooth, seal: { sealedAt: 1, sealedBy: 'x', paperListCount: 38, appCount: 38 } });
    const sealed = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 38 });
    mockedDataStore.findOfficerCode.mockReturnValueOnce({
      ...closedBooth,
      repoll: { orderedAt: 1, orderedBy: 'x', reason: 'disruption', note: '', cancelledVoteCount: 38, replacementCode: 'new999' }
    });
    const repolled = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 38 });

    expect(open.status).toBe(409);
    expect(sealed.status).toBe(409);
    expect(repolled.status).toBe(409);
    expect(repolled.body.error).toContain('new999');
    expect(mockedDataStore.sealOfficerCode).not.toHaveBeenCalled();
  });

  it('refuses to seal a code never allotted to anyone -- it should be deleted instead', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...closedBooth, officerName: '' });
    mockedDataStore.countCountedVotesByOfficerCode.mockReturnValue(0);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 0 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('delete it instead');
    expect(mockedDataStore.sealOfficerCode).not.toHaveBeenCalled();
  });

  it('seals a booth that cast no votes with a Paper List of 0', async () => {
    mockedDataStore.countCountedVotesByOfficerCode.mockReturnValue(0);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 0 });

    expect(response.status).toBe(200);
    expect(mockedDataStore.sealOfficerCode).toHaveBeenCalledWith('ABC123', expect.objectContaining({ paperListCount: 0, appCount: 0 }));
  });

  it('needs a whole number from the Paper List', async () => {
    const { createApp } = await import('../app.js');
    const missing = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({});
    const fraction = await request(createApp()).post('/api/officer-codes/ABC123/seal').send({ paperListCount: 3.5 });
    expect(missing.status).toBe(400);
    expect(fraction.status).toBe(400);
  });

  it('a sealed booth can no longer be reopened, re-polled, or deleted while its election runs', async () => {
    mockedDataStore.findOfficerCode.mockReturnValue({ ...closedBooth, seal: { sealedAt: 1, sealedBy: 'x', paperListCount: 38, appCount: 38 } });
    const { createApp } = await import('../app.js');
    const reopen = await request(createApp()).post('/api/officer-codes/ABC123/reopen');
    const repoll = await request(createApp()).post('/api/officer-codes/ABC123/repoll').send({ reason: 'disruption' });
    const remove = await request(createApp()).delete('/api/officer-codes/ABC123');

    expect([reopen.status, repoll.status, remove.status]).toEqual([409, 409, 409]);
    expect(mockedDataStore.reopenOfficerCode).not.toHaveBeenCalled();
    expect(mockedDataStore.orderRepoll).not.toHaveBeenCalled();
    expect(mockedDataStore.deleteOfficerCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/officer-codes/fresh-duties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
  });

  it('turns every code of that election back to white and reports how many', async () => {
    mockedDataStore.startFreshDuties.mockReturnValue(175);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/fresh-duties').send({ electionType: 'house' });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(175);
    expect(mockedDataStore.startFreshDuties).toHaveBeenCalledWith('house');
  });

  it('is refused while that same election is running', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/fresh-duties').send({ electionType: 'school' });

    expect(response.status).toBe(409);
    expect(mockedDataStore.startFreshDuties).not.toHaveBeenCalled();
  });

  it('is allowed for House while School is running', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    const { createApp } = await import('../app.js');
    await request(createApp()).post('/api/officer-codes/fresh-duties').send({ electionType: 'house' }).expect(200);
  });

  it('needs an election type', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/fresh-duties').send({});
    expect(response.status).toBe(400);
  });
});

describe('POST /api/officer-codes/remove-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);
  });

  it('removes every code of that election, both branches, and reports how many', async () => {
    mockedDataStore.removeOfficerCodesByType.mockReturnValue(160);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/remove-all').send({ electionType: 'house' });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(160);
    expect(mockedDataStore.removeOfficerCodesByType).toHaveBeenCalledWith('house');
  });

  it('is refused while that same election is running', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/remove-all').send({ electionType: 'school' });

    expect(response.status).toBe(409);
    expect(mockedDataStore.removeOfficerCodesByType).not.toHaveBeenCalled();
  });

  it('is allowed for House while School is running', async () => {
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
    const { createApp } = await import('../app.js');
    await request(createApp()).post('/api/officer-codes/remove-all').send({ electionType: 'house' }).expect(200);
  });

  it('needs an election type', async () => {
    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/remove-all').send({});
    expect(response.status).toBe(400);
    expect(mockedDataStore.removeOfficerCodesByType).not.toHaveBeenCalled();
  });
});

describe('POST /api/officer-codes/mark-sent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(runningSchoolRun);
  });

  it('marks every code in one message as sent and logs each', async () => {
    mockedDataStore.markOfficerCodesSent.mockReturnValue([
      { ...baseCode, code: 'aaa111', officerName: 'Jane', sentAt: Date.now() },
      { ...baseCode, code: 'bbb222', officerName: 'Jane', electionType: 'house', house: 'Anand', sentAt: Date.now() }
    ]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/officer-codes/mark-sent')
      .send({ codes: ['aaa111', 'bbb222'], sent: true });

    expect(response.status).toBe(200);
    expect(mockedDataStore.markOfficerCodesSent).toHaveBeenCalledWith(['aaa111', 'bbb222'], true);
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledTimes(2);
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'officerCode.markSent', details: { code: 'aaa111', officerName: 'Jane' } })
    );
  });

  it('undoes a sent mark', async () => {
    mockedDataStore.markOfficerCodesSent.mockReturnValue([{ ...baseCode, officerName: 'Jane' }]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/mark-sent').send({ codes: ['ABC123'], sent: false });

    expect(response.status).toBe(200);
    expect(mockedDataStore.markOfficerCodesSent).toHaveBeenCalledWith(['ABC123'], false);
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(expect.objectContaining({ action: 'officerCode.unmarkSent' }));
  });

  it('rejects a missing sent flag or an empty code list', async () => {
    const { createApp } = await import('../app.js');
    const noFlag = await request(createApp()).post('/api/officer-codes/mark-sent').send({ codes: ['ABC123'] });
    const noCodes = await request(createApp()).post('/api/officer-codes/mark-sent').send({ codes: [], sent: true });

    expect(noFlag.status).toBe(400);
    expect(noCodes.status).toBe(400);
    expect(mockedDataStore.markOfficerCodesSent).not.toHaveBeenCalled();
  });

  it('returns 400 when none of the codes exist', async () => {
    mockedDataStore.markOfficerCodesSent.mockReturnValue([]);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).post('/api/officer-codes/mark-sent').send({ codes: ['NOPE00'], sent: true });

    expect(response.status).toBe(400);
  });
});
