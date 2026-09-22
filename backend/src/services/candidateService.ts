import { dataStore } from '../storage/datastore.js';
import { Candidate, PostId, ElectionType, HouseId, Branch } from '../types/election.js';
import { getPollState } from './voteService.js';
import { HOUSE_IDS, HOUSE_POST_IDS, SCHOOL_POST_IDS } from '../config/posts.js';

// `branch` is optional and additive -- omitting it (every call site today)
// returns candidates across all branches, unchanged from before this
// parameter existed. See ROADMAP.md Phase 2 for when callers start passing
// it.
export const listCandidates = (electionType?: ElectionType, house?: HouseId, branch?: Branch): Candidate[] => {
  const allCandidates = dataStore.getCandidates();
  let filtered = allCandidates;

  if (electionType) {
    filtered = filtered.filter((c) => c.electionType === electionType);
  }

  if (house) {
    filtered = filtered.filter((c) => c.house === house);
  }

  if (branch) {
    filtered = filtered.filter((c) => c.branch === branch);
  }

  return filtered;
};

export const listCandidatesByPost = (post: PostId, electionType?: ElectionType, house?: HouseId, branch?: Branch): Candidate[] => {
  return listCandidates(electionType, house, branch).filter((candidate) => candidate.post === post);
};

// Every post (school) or every house/post combination (house) that
// currently has zero candidates -- opening the poll with a gap here strands
// any voter who reaches that post, since the ballot has nothing to select
// and "Next" never enables. Returns human-readable labels for the error
// message, e.g. "Namrata House / HSC".
//
// `branch` is optional and, deliberately, NOT yet passed by its one caller
// (routes/poll.ts's Open Poll gate) -- MULTI-BRANCH-EXPANSION-PLAN.md calls
// for this to check both branches once Open Poll is shared across them, but
// turning that on before AN actually has any candidates entered would block
// Dwarka's real, current election from opening at all. Wire the caller once
// AN's candidates exist (see ROADMAP.md Phase 2), not before.
export const findMissingCandidateCoverage = (electionType: ElectionType, branch?: Branch): string[] => {
  let candidates = dataStore.getCandidates().filter((c) => c.electionType === electionType);
  if (branch) {
    candidates = candidates.filter((c) => c.branch === branch);
  }

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

export const listCandidatesForActiveElection = (house?: HouseId, branch?: Branch): Candidate[] => {
  const pollState = getPollState();
  const activeElectionType = pollState.activeElectionType;

  if (!activeElectionType) {
    return []; // No active election
  }

  return listCandidates(activeElectionType, house, branch);
};
