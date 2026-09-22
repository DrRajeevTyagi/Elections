import { randomUUID } from 'crypto';
import { SCHOOL_POST_IDS, HOUSE_POST_IDS } from '../config/posts.js';
import { dataStore } from '../storage/datastore.js';
import { Candidate, PostId, StoredVote, ElectionType, HouseId, ElectionArchive } from '../types/election.js';
import { getPollState } from './voteService.js';

export interface CandidateResult {
  candidate: Candidate;
  total: number;
}

export interface PostResult {
  post: PostId;
  candidates: CandidateResult[];
}

const countVotes = (votes: StoredVote[], electionType: ElectionType, house?: HouseId): Map<string, number> => {
  const tally = new Map<string, number>();
  
  // Filter votes by election type and optionally house
  const filteredVotes = votes.filter((vote) => {
    if (vote.electionType !== electionType) return false;
    if (house && vote.house !== house) return false;
    return true;
  });

  for (const vote of filteredVotes) {
    for (const [post, candidateId] of Object.entries(vote.selections)) {
      const key = post + ':' + candidateId;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  return tally;
};

// The one authoritative count of ballots cast for the active election --
// a straight count of vote records, not derived from summing candidate
// tallies. The admin dashboard used to compute "Total Votes" by summing
// every candidate's total across all posts and dividing by the number of
// posts (valid only because every ballot fills exactly one selection per
// post) -- that silently undercounts the moment any candidate who received
// votes is deleted, since a deleted candidate's selections drop out of the
// sum entirely. This is what both the live dashboard and the archived/
// report totals should use instead.
export const getTotalVotes = (): number => {
  const pollState = getPollState();
  if (!pollState.activeElectionType) {
    return 0;
  }
  return dataStore.getVotes().filter((vote) => vote.electionType === pollState.activeElectionType).length;
};

export const getResults = (house?: HouseId): PostResult[] => {
  const pollState = getPollState();
  if (!pollState.activeElectionType) {
    return []; // No active election
  }

  const votes = dataStore.getVotes();
  const tally = countVotes(votes, pollState.activeElectionType, house);
  
  // Filter candidates by election type and optionally house
  let candidates = dataStore.getCandidates().filter((c) => c.electionType === pollState.activeElectionType);
  if (house) {
    candidates = candidates.filter((c) => c.house === house);
  }

  // Get post IDs based on election type
  const postIds = pollState.activeElectionType === 'school' ? SCHOOL_POST_IDS : HOUSE_POST_IDS;

  return postIds.map((post) => {
    const postCandidates = candidates.filter((candidate) => candidate.post === post);
    const candidatesWithTotals = postCandidates.map((candidate) => ({
      candidate,
      total: tally.get(post + ':' + candidate.id) ?? 0
    }));

    return {
      post,
      candidates: candidatesWithTotals
    };
  });
};

// A full, unfiltered snapshot of the currently active election -- every
// house's candidates together, plus officer/station turnout -- used both for
// the "Download Report" button (live, not persisted) and to archive results
// automatically right before "Reset Poll" (or a Switch Election Type that
// clears an outgoing type's votes) clears the votes. `name` is the admin's
// own label for the archive, e.g. "School Council -- Term 1 2026" -- purely
// cosmetic, shown in Election History. Returns null when there's no active
// election type to snapshot.
export const buildElectionSnapshot = (name?: string): ElectionArchive | null => {
  const pollState = getPollState();
  const electionType = pollState.activeElectionType;
  if (!electionType) {
    return null;
  }

  const votes = dataStore.getVotes();
  const tally = countVotes(votes, electionType);
  const candidates = dataStore.getCandidates().filter((c) => c.electionType === electionType);

  const results = candidates.map((candidate) => ({
    candidateId: candidate.id,
    name: candidate.name,
    post: candidate.post,
    house: candidate.house,
    total: tally.get(candidate.post + ':' + candidate.id) ?? 0
  }));

  // Only this election's own codes -- previously every code (including the
  // other election type's, e.g. all 8 house codes showing up in a School
  // archive) was included, cluttering the archived turnout table with
  // entries that could never have cast a vote here.
  const officerCodes = dataStore
    .getOfficerCodes()
    .filter((entry) => entry.electionType === electionType)
    .map((entry) => ({
      code: entry.code,
      officerName: entry.officerName,
      voteCount: dataStore.countVotesByOfficerCode(entry.code)
    }));

  const totalVotes = getTotalVotes();

  return {
    id: randomUUID(),
    archivedAt: Date.now(),
    electionType,
    totalVotes,
    results,
    officerCodes,
    name: name?.trim() || undefined
  };
};
