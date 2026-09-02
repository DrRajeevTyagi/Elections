import { SCHOOL_POST_IDS, HOUSE_POST_IDS } from '../config/posts.js';
import { dataStore } from '../storage/datastore.js';
import { Candidate, PostId, StoredVote, ElectionType, HouseId } from '../types/election.js';
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

    candidatesWithTotals.sort((a, b) => b.total - a.total);

    return {
      post,
      candidates: candidatesWithTotals
    };
  });
};
