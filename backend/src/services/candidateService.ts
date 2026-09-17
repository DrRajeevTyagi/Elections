import { dataStore } from '../storage/datastore.js';
import { Candidate, PostId, ElectionType, HouseId } from '../types/election.js';
import { getPollState } from './voteService.js';
import { HOUSE_IDS, HOUSE_POST_IDS, SCHOOL_POST_IDS } from '../config/posts.js';

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

// Every post (school) or every house/post combination (house) that
// currently has zero candidates -- opening the poll with a gap here strands
// any voter who reaches that post, since the ballot has nothing to select
// and "Next" never enables. Returns human-readable labels for the error
// message, e.g. "Namrata House / HSC".
export const findMissingCandidateCoverage = (electionType: ElectionType): string[] => {
  const candidates = dataStore.getCandidates().filter((c) => c.electionType === electionType);

  if (electionType === 'school') {
    return SCHOOL_POST_IDS.filter((post) => !candidates.some((c) => c.post === post));
  }

  const missing: string[] = [];
  for (const house of HOUSE_IDS) {
    for (const post of HOUSE_POST_IDS) {
      if (!candidates.some((c) => c.house === house && c.post === post)) {
        missing.push(`${house} House / ${post}`);
      }
    }
  }
  return missing;
};

export const listCandidatesForActiveElection = (house?: HouseId): Candidate[] => {
  const pollState = getPollState();
  const activeElectionType = pollState.activeElectionType;
  
  if (!activeElectionType) {
    return []; // No active election
  }

  return listCandidates(activeElectionType, house);
};
