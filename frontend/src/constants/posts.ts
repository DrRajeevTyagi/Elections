import type { PostId } from '../types/election';

export const SCHOOL_POST_IDS: PostId[] = ['HB', 'HG', 'SSC', 'SRC', 'SCC'];

export const POST_NAMES: Record<PostId, string> = {
  HB: 'Head Boy',
  HG: 'Head Girl',
  SSC: 'School Sports Captain',
  SRC: 'School Resources Captain',
  SCC: 'School Cultural Captain',
  HC: 'House Captain',
  HCC: 'House Cultural Captain',
  HSC: 'House Sports Captain'
};
