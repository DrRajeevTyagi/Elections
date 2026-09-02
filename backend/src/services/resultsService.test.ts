import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, StoredVote } from '../types/election.js';

const mockedDataStore = {
  getVotes: vi.fn<[], StoredVote[]>(),
  getCandidates: vi.fn<[], Candidate[]>()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

describe('resultsService', () => {
  const candidates: Candidate[] = [
    { id: 'hb-1', name: 'Head Boy A', post: 'HB' },
    { id: 'hb-2', name: 'Head Boy B', post: 'HB' },
    { id: 'hg-1', name: 'Head Girl A', post: 'HG' }
  ];

  beforeEach(() => {
    mockedDataStore.getCandidates.mockReturnValue(candidates);
    mockedDataStore.getVotes.mockReturnValue([
      { id: 'vote-1', timestamp: 1, selections: { HB: 'hb-1', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } },
      { id: 'vote-2', timestamp: 2, selections: { HB: 'hb-1', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } },
      { id: 'vote-3', timestamp: 3, selections: { HB: 'hb-2', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } }
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
      { id: 'vote-1', timestamp: 1, selections: { HB: 'hb-2', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } }
    ] as StoredVote[]);

    const { getResults } = await import('./resultsService.js');
    const results = getResults();
    const headBoyResults = results.find((group) => group.post === 'HB');
    const hb1 = headBoyResults?.candidates.find((item) => item.candidate.id === 'hb-1');
    expect(hb1?.total).toBe(0);
  });
});
