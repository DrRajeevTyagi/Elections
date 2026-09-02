import { PostId, HousePostId, SchoolPostId, HouseId, Candidate, ElectionType } from '../types/election.js';

// School election posts
export const SCHOOL_POST_IDS: SchoolPostId[] = ['HB', 'HG', 'SSC', 'SRC', 'SCC'];

// House election posts
export const HOUSE_POST_IDS: HousePostId[] = ['HC', 'HCC', 'HSC'];

// All post IDs
export const POST_IDS: PostId[] = [...SCHOOL_POST_IDS, ...HOUSE_POST_IDS];

// House names
export const HOUSE_IDS: HouseId[] = ['Anand', 'Dhiraj', 'Kripa', 'Prem', 'Namrata', 'Nishtha', 'Satya', 'Shanti'];

export const isValidPostId = (value: string): value is PostId => {
  return POST_IDS.includes(value as PostId);
};

export const isValidHouseId = (value: string): value is HouseId => {
  return HOUSE_IDS.includes(value as HouseId);
};

// Default school election candidates
export const DEFAULT_SCHOOL_CANDIDATES: Candidate[] = [
  // Head Boy (HB) - 4 candidates
  { id: 'hb-1', name: 'Alex Johnson', post: 'HB', electionType: 'school' },
  { id: 'hb-2', name: 'Michael Chen', post: 'HB', electionType: 'school' },
  { id: 'hb-3', name: 'David Williams', post: 'HB', electionType: 'school' },
  { id: 'hb-4', name: 'Ryan Patel', post: 'HB', electionType: 'school' },
  
  // Head Girl (HG) - 4 candidates
  { id: 'hg-1', name: 'Sarah Martinez', post: 'HG', electionType: 'school' },
  { id: 'hg-2', name: 'Emily Davis', post: 'HG', electionType: 'school' },
  { id: 'hg-3', name: 'Priya Sharma', post: 'HG', electionType: 'school' },
  { id: 'hg-4', name: 'Jessica Brown', post: 'HG', electionType: 'school' },
  
  // School Sports Captain (SSC) - 5 candidates
  { id: 'ssc-1', name: 'James Wilson', post: 'SSC', electionType: 'school' },
  { id: 'ssc-2', name: 'Chris Anderson', post: 'SSC', electionType: 'school' },
  { id: 'ssc-3', name: 'Marcus Taylor', post: 'SSC', electionType: 'school' },
  { id: 'ssc-4', name: 'Kevin Lee', post: 'SSC', electionType: 'school' },
  { id: 'ssc-5', name: 'Daniel Kim', post: 'SSC', electionType: 'school' },
  
  // School Resources Captain (SRC) - 3 candidates
  { id: 'src-1', name: 'Sophia Garcia', post: 'SRC', electionType: 'school' },
  { id: 'src-2', name: 'Olivia Rodriguez', post: 'SRC', electionType: 'school' },
  { id: 'src-3', name: 'Isabella Thompson', post: 'SRC', electionType: 'school' },
  
  // School Cultural Captain (SCC) - 4 candidates
  { id: 'scc-1', name: 'Emma White', post: 'SCC', electionType: 'school' },
  { id: 'scc-2', name: 'Mia Jackson', post: 'SCC', electionType: 'school' },
  { id: 'scc-3', name: 'Ava Harris', post: 'SCC', electionType: 'school' },
  { id: 'scc-4', name: 'Lily Martin', post: 'SCC', electionType: 'school' }
];

// Default house election candidates (placeholder candidates for each house)
// In practice, these would be added by admin, but we provide placeholders
export const DEFAULT_HOUSE_CANDIDATES: Candidate[] = HOUSE_IDS.flatMap((house) =>
  HOUSE_POST_IDS.map((post, index) => ({
    id: `${house.toLowerCase()}-${post.toLowerCase()}-${index + 1}`,
    name: `${house} ${post === 'HC' ? 'House Captain' : post === 'HCC' ? 'Cultural Captain' : 'Sports Captain'} ${index + 1}`,
    post,
    electionType: 'house' as ElectionType,
    house
  }))
);

// Combined default candidates (for backward compatibility)
export const DEFAULT_CANDIDATES: Candidate[] = [...DEFAULT_SCHOOL_CANDIDATES, ...DEFAULT_HOUSE_CANDIDATES];
