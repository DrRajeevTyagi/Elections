import type { Branch, PostId, SchoolPostId } from '../types/election';

// Every school post that exists in any branch, in ballot order. Mirrors
// backend/src/config/posts.ts -- keep the two in step.
export const SCHOOL_POST_IDS: SchoolPostId[] = ['HB', 'HG', 'SSC', 'SRC', 'SCC', 'IC'];

// The school posts each branch actually elects -- AN also has an Integrity
// Captain, last so the other five keep the same order in both branches.
const SCHOOL_POSTS_BY_BRANCH: Record<Branch, SchoolPostId[]> = {
  dwarka: ['HB', 'HG', 'SSC', 'SRC', 'SCC'],
  AN: ['HB', 'HG', 'SSC', 'SRC', 'SCC', 'IC']
};

// One branch's school posts; every school post when no branch is given.
export const getSchoolPostIds = (branch?: Branch): SchoolPostId[] =>
  branch ? SCHOOL_POSTS_BY_BRANCH[branch] : SCHOOL_POST_IDS;

export const POST_NAMES: Record<PostId, string> = {
  HB: 'Head Boy',
  HG: 'Head Girl',
  SSC: 'School Sports Captain',
  SRC: 'School Resources Captain',
  SCC: 'School Cultural Captain',
  IC: 'Integrity Captain',
  HC: 'House Captain',
  HCC: 'House Cultural Captain',
  HSC: 'House Sports Captain'
};
