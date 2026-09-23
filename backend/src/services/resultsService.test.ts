import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, ElectionArchive, OfficerCode, PollState, StoredVote } from '../types/election.js';

const mockedDataStore = {
  getVotes: vi.fn<[], StoredVote[]>(),
  getCandidates: vi.fn<[], Candidate[]>(),
  getPollState: vi.fn<[], PollState>(),
  getArchives: vi.fn<[], ElectionArchive[]>(),
  getOfficerCodes: vi.fn<[], OfficerCode[]>(),
  countVotesByOfficerCode: vi.fn<[string], number>(),
  addArchive: vi.fn(),
  renameArchive: vi.fn()
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
    vi.clearAllMocks();
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
    mockedDataStore.getArchives.mockReturnValue([]);
    mockedDataStore.getOfficerCodes.mockReturnValue([]);
    mockedDataStore.countVotesByOfficerCode.mockReturnValue(0);
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

  describe('archiveCurrentElection', () => {
    // Regression: Reset Poll and Switch Election Type both used to archive
    // unconditionally, so an admin who used the new "Save to Election
    // History" checkpoint (e.g. right after Close Poll) and then Reset
    // without any new votes in between ended up with two archive entries
    // for the exact same election.

    it('creates a new archive when nothing has been saved yet', async () => {
      const { archiveCurrentElection } = await import('./resultsService.js');
      archiveCurrentElection('My Election');
      expect(mockedDataStore.addArchive).toHaveBeenCalledTimes(1);
      expect(mockedDataStore.addArchive).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Election', totalVotes: 3, electionType: 'school' })
      );
      expect(mockedDataStore.renameArchive).not.toHaveBeenCalled();
    });

    it('skips creating a duplicate when the live votes already match the most recent archive', async () => {
      mockedDataStore.getArchives.mockReturnValue([
        { id: 'archive-1', archivedAt: 100, electionType: 'school', totalVotes: 3, results: [], officerCodes: [] }
      ] as ElectionArchive[]);

      const { archiveCurrentElection } = await import('./resultsService.js');
      archiveCurrentElection();
      expect(mockedDataStore.addArchive).not.toHaveBeenCalled();
      expect(mockedDataStore.renameArchive).not.toHaveBeenCalled();
    });

    it('relabels the existing archive with a new name instead of duplicating it', async () => {
      mockedDataStore.getArchives.mockReturnValue([
        { id: 'archive-1', archivedAt: 100, electionType: 'school', totalVotes: 3, results: [], officerCodes: [] }
      ] as ElectionArchive[]);

      const { archiveCurrentElection } = await import('./resultsService.js');
      archiveCurrentElection('Renamed Election');
      expect(mockedDataStore.addArchive).not.toHaveBeenCalled();
      expect(mockedDataStore.renameArchive).toHaveBeenCalledWith('archive-1', 'Renamed Election');
    });

    it('archives again if a new vote came in after the last checkpoint (e.g. poll reopened)', async () => {
      // The most recent archive only covers 2 votes as of t=50, but a 3rd
      // vote (t=3, i.e. before t=50) is already included in that count --
      // to simulate "reopened and got one more vote after the checkpoint",
      // give the archive a totalVotes that matches pre-reopen state and an
      // archivedAt older than the newest live vote.
      mockedDataStore.getArchives.mockReturnValue([
        { id: 'archive-1', archivedAt: 2, electionType: 'school', totalVotes: 3, results: [], officerCodes: [] }
      ] as ElectionArchive[]);

      const { archiveCurrentElection } = await import('./resultsService.js');
      archiveCurrentElection('Second Save');
      // vote-3 (timestamp 3) is newer than the archive's archivedAt (2), so
      // this must archive again rather than skip or just relabel.
      expect(mockedDataStore.addArchive).toHaveBeenCalledTimes(1);
      expect(mockedDataStore.renameArchive).not.toHaveBeenCalled();
    });
  });

  describe('filterArchiveByBranch', () => {
    const archive: ElectionArchive = {
      id: 'archive-1',
      archivedAt: 100,
      electionType: 'school',
      totalVotes: 5,
      results: [
        { candidateId: 'hb-1', name: 'Head Boy A', post: 'HB', total: 3, branch: 'dwarka' },
        { candidateId: 'hb-2', name: 'Head Boy B', post: 'HB', total: 2, branch: 'AN' },
        { candidateId: 'hg-1', name: 'Head Girl A', post: 'HG', total: 0 } // no branch -- defaults to dwarka
      ],
      officerCodes: [
        { code: 'abc123', officerName: 'Jane', voteCount: 3, branch: 'dwarka' },
        { code: 'xyz789', officerName: 'Priya', voteCount: 2, branch: 'AN' }
      ]
    };

    it('keeps only the given branch\'s results and officer codes, and recomputes totalVotes', async () => {
      const { filterArchiveByBranch } = await import('./resultsService.js');
      const filtered = filterArchiveByBranch(archive, 'AN');
      expect(filtered.results).toEqual([{ candidateId: 'hb-2', name: 'Head Boy B', post: 'HB', total: 2, branch: 'AN' }]);
      expect(filtered.officerCodes).toEqual([{ code: 'xyz789', officerName: 'Priya', voteCount: 2, branch: 'AN' }]);
      expect(filtered.totalVotes).toBe(2);
      expect(filtered.branch).toBe('AN');
    });

    it('treats a result with no branch set as dwarka', async () => {
      const { filterArchiveByBranch } = await import('./resultsService.js');
      const filtered = filterArchiveByBranch(archive, 'dwarka');
      expect(filtered.results.map((r) => r.candidateId)).toEqual(['hb-1', 'hg-1']);
      expect(filtered.totalVotes).toBe(3);
    });
  });
});
