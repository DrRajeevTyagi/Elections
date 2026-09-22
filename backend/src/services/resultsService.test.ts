import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, PollState, StoredVote } from '../types/election.js';

const mockedDataStore = {
  getVotes: vi.fn<[], StoredVote[]>(),
  getCandidates: vi.fn<[], Candidate[]>(),
  getPollState: vi.fn<[], PollState>()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

describe('resultsService', () => {
  const candidates: Candidate[] = [
    { id: 'hb-1', name: 'Head Boy A', post: 'HB', electionType: 'school' },
    { id: 'hb-2', name: 'Head Boy B', post: 'HB', electionType: 'school' },
    { id: 'hg-1', name: 'Head Girl A', post: 'HG', electionType: 'school' }
  ];

  beforeEach(() => {
    mockedDataStore.getCandidates.mockReturnValue(candidates);
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      settings: { isOpen: true, allowRevote: false }
    });
    mockedDataStore.getVotes.mockReturnValue([
      { id: 'vote-1', timestamp: 1, electionType: 'school', selections: { HB: 'hb-1', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } },
      { id: 'vote-2', timestamp: 2, electionType: 'school', selections: { HB: 'hb-1', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } },
      { id: 'vote-3', timestamp: 3, electionType: 'school', selections: { HB: 'hb-2', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } }
    ] as StoredVote[]);
  });

  it('aggregates totals per candidate', async () => {
    const { getResults } = await import('./resultsService.js');
    const results = getResults();
    const headBoyResults = results.find((group) => group.post === 'HB');
    expect(headBoyResults).toBeDefined();
    expect(headBoyResults?.candidates[0].candidate.id).toBe('hb-1');
    expect(headBoyResults?.candidates[0].total).toBe(2);
    expect(headBoyResults?.candidates[1].candidate.id).toBe('hb-2');
    expect(headBoyResults?.candidates[1].total).toBe(1);
  });

  it('includes zero totals for candidates without votes', async () => {
    mockedDataStore.getVotes.mockReturnValueOnce([
      { id: 'vote-1', timestamp: 1, electionType: 'school', selections: { HB: 'hb-2', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } }
    ] as StoredVote[]);

    const { getResults } = await import('./resultsService.js');
    const results = getResults();
    const headBoyResults = results.find((group) => group.post === 'HB');
    const hb1 = headBoyResults?.candidates.find((item) => item.candidate.id === 'hb-1');
    expect(hb1?.total).toBe(0);
  });

  describe('getTotalVotes', () => {
    it('counts every ballot for the active election type, regardless of candidates', async () => {
      const { getTotalVotes } = await import('./resultsService.js');
      expect(getTotalVotes()).toBe(3);
    });

    it('stays correct even after a candidate who received votes is deleted', async () => {
      // Regression: the admin dashboard used to derive "Total Votes" by
      // summing every candidate's total and dividing by the post count --
      // once a candidate who'd received votes was deleted, their
      // selections dropped out of that sum and the total silently shrank.
      // getTotalVotes counts vote records directly, so it must be immune.
      mockedDataStore.getCandidates.mockReturnValue(
        candidates.filter((c) => c.id !== 'hb-1') // hb-1 (2 votes) removed
      );
      const { getTotalVotes } = await import('./resultsService.js');
      expect(getTotalVotes()).toBe(3);
    });

    it('returns 0 when no election type is active', async () => {
      mockedDataStore.getPollState.mockReturnValue({
        activeElectionType: null,
        settings: { isOpen: false, allowRevote: false }
      });
      const { getTotalVotes } = await import('./resultsService.js');
      expect(getTotalVotes()).toBe(0);
    });
  });
});
