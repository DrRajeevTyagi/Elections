import { dataStore } from '../storage/datastore.js';
import { Candidate, PostId, ElectionType, HouseId } from '../types/election.js';
import { getPollState } from './voteService.js';

export const listCandidates = (electionType?: ElectionType, house?: HouseId): Candidate[] => {
  const allCandidates = dataStore.getCandidates();
  let filtered = allCandidates;

  if (electionType) {
    filtered = filtered.filter((c) => c.electionType === electionType);
  }

  if (house) {
    filtered = filtered.filter((c) => c.house === house);
  }

  return filtered;
};

export const listCandidatesByPost = (post: PostId, electionType?: ElectionType, house?: HouseId): Candidate[] => {
  return listCandidates(electionType, house).filter((candidate) => candidate.post === post);
};

export const listCandidatesForActiveElection = (house?: HouseId): Candidate[] => {
  const pollState = getPollState();
  const activeElectionType = pollState.activeElectionType;
  
  if (!activeElectionType) {
    return []; // No active election
  }

  return listCandidates(activeElectionType, house);
};
