import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, PollState } from '../types/election.js';

// Regression test for a real incident: a ballot activated with an AN
// officer code showed candidates from BOTH Dwarka and AN mixed together for
// the same house/post, because the candidate-listing endpoint (GET /posts)
// was never filtered by branch. Worse than a display bug: nothing stopped
// the submitted vote from referencing a Dwarka candidate id while the vote
// itself was tagged 'AN' (from the session), corrupting both branches'
// results. See routes/votes.ts validateVote -- the fix filters by the
// session's server-derived branch, not just what's shown on screen.

const mockedDataStore = {
  getPollState: vi.fn<[], PollState>(),
  getCandidates: vi.fn<[], Candidate[]>(),
  addVote: vi.fn(),
  countVotesByOfficerCode: vi.fn<[string], number>()
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

describe('POST /api/votes -- branch integrity', () => {
  // Both branches have a full slate for Satya House (HC/HCC/HSC), same as a
  // real multi-branch election would.
  const candidates: Candidate[] = [
    { id: 'dwarka-hc-1', name: 'Dwarka HC', post: 'HC', electionType: 'house', house: 'Satya', branch: 'dwarka' },
    { id: 'dwarka-hcc-1', name: 'Dwarka HCC', post: 'HCC', electionType: 'house', house: 'Satya', branch: 'dwarka' },
    { id: 'dwarka-hsc-1', name: 'Dwarka HSC', post: 'HSC', electionType: 'house', house: 'Satya', branch: 'dwarka' },
    { id: 'an-hc-1', name: 'AN HC', post: 'HC', electionType: 'house', house: 'Satya', branch: 'AN' },
    { id: 'an-hcc-1', name: 'AN HCC', post: 'HCC', electionType: 'house', house: 'Satya', branch: 'AN' },
    { id: 'an-hsc-1', name: 'AN HSC', post: 'HSC', electionType: 'house', house: 'Satya', branch: 'AN' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'house',
      settings: { isOpen: true, allowRevote: false }
    });
    mockedDataStore.getCandidates.mockReturnValue(candidates);
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(0);
    mockedDataStore.addVote.mockResolvedValue({
      id: 'vote-1',
      timestamp: Date.now(),
      electionType: 'house',
      house: 'Satya',
      selections: {},
      branch: 'AN'
    });
    mockedKioskService.markConsumed.mockReturnValue(undefined);
  });

  it('rejects a vote for a candidate that belongs to a different branch than the activating session, even though that candidate genuinely exists for the same post and house', async () => {
    mockedKioskService.getActiveSession.mockReturnValue({
      token: 'tok', activatedAt: Date.now(), house: 'Satya', officerCode: 'AN01', branch: 'AN'
    });

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      // Session is AN, but this selects Dwarka's HC candidate -- must be rejected.
      .send({ selections: { HC: 'dwarka-hc-1', HCC: 'an-hcc-1', HSC: 'an-hsc-1' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid candidate selected');
    expect(mockedDataStore.addVote).not.toHaveBeenCalled();
    // The voter's one-time code must not be burned on a rejected payload.
    expect(mockedKioskService.markConsumed).not.toHaveBeenCalled();
  });

  it('accepts a vote where every candidate matches the activating session\'s branch', async () => {
    mockedKioskService.getActiveSession.mockReturnValue({
      token: 'tok', activatedAt: Date.now(), house: 'Satya', officerCode: 'AN01', branch: 'AN'
    });

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      .send({ selections: { HC: 'an-hc-1', HCC: 'an-hcc-1', HSC: 'an-hsc-1' } });

    expect(response.status).toBe(201);
    expect(mockedDataStore.addVote).toHaveBeenCalledWith(
      expect.objectContaining({ HC: 'an-hc-1', HCC: 'an-hcc-1', HSC: 'an-hsc-1' }),
      'house',
      'Satya',
      'AN01',
      'AN'
    );
  });

  it('the same Dwarka-vs-AN mismatch is also rejected the other direction (Dwarka session, AN candidate)', async () => {
    mockedKioskService.getActiveSession.mockReturnValue({
      token: 'tok', activatedAt: Date.now(), house: 'Satya', officerCode: 'DW01', branch: 'dwarka'
    });

    const { createApp } = await import('../app.js');
    const response = await request(createApp())
      .post('/api/votes')
      .set('x-kiosk-token', 'tok')
      .send({ selections: { HC: 'an-hc-1', HCC: 'dwarka-hcc-1', HSC: 'dwarka-hsc-1' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid candidate selected');
    expect(mockedDataStore.addVote).not.toHaveBeenCalled();
  });
});
