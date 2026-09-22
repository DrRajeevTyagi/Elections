import { PostId, HousePostId, SchoolPostId, HouseId, Candidate, Branch } from '../types/election.js';

// School election posts
export const SCHOOL_POST_IDS: SchoolPostId[] = ['HB', 'HG', 'SSC', 'SRC', 'SCC'];

// House election posts
export const HOUSE_POST_IDS: HousePostId[] = ['HC', 'HCC', 'HSC'];

// All post IDs
export const POST_IDS: PostId[] = [...SCHOOL_POST_IDS, ...HOUSE_POST_IDS];

// House names
export const HOUSE_IDS: HouseId[] = ['Anand', 'Dhiraj', 'Kripa', 'Prem', 'Namrata', 'Nishtha', 'Satya', 'Shanti'];

// School branches -- capital "AN" always, see MULTI-BRANCH-EXPANSION-PLAN.md's
// naming convention.
export const BRANCH_IDS: Branch[] = ['dwarka', 'AN'];

export const isValidPostId = (value: string): value is PostId => {
  return POST_IDS.includes(value as PostId);
};

export const isValidHouseId = (value: string): value is HouseId => {
  return HOUSE_IDS.includes(value as HouseId);
};

export const isValidBranch = (value: string): value is Branch => {
  return BRANCH_IDS.includes(value as Branch);
};

// No demo/placeholder candidates are seeded for a fresh election -- a
// previous version pre-populated fake names (e.g. "Alex Johnson", "Anand
// House Captain 1") here, which risked real students voting for a candidate
// nobody actually entered if an admin didn't notice and delete them first.
// A brand-new election now starts with zero candidates everywhere, and
// candidateService.findMissingCandidateCoverage blocks Open Poll until the
// admin has added a real candidate for every post (and every house/post
// combination, for house elections).
export const DEFAULT_SCHOOL_CANDIDATES: Candidate[] = [];
export const DEFAULT_HOUSE_CANDIDATES: Candidate[] = [];
export const DEFAULT_CANDIDATES: Candidate[] = [];
