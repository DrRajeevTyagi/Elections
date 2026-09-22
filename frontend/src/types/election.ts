// School election posts
export type SchoolPostId = 'HB' | 'HG' | 'SSC' | 'SRC' | 'SCC';
// House election posts
export type HousePostId = 'HC' | 'HCC' | 'HSC';
// All possible post IDs
export type PostId = SchoolPostId | HousePostId;

// House names
export type HouseId = 'Anand' | 'Dhiraj' | 'Kripa' | 'Prem' | 'Namrata' | 'Nishtha' | 'Satya' | 'Shanti';

// Election types
export type ElectionType = 'school' | 'house';

// School branches -- always "AN" in capitals, never spelled out or
// lowercased (see MULTI-BRANCH-EXPANSION-PLAN.md's naming convention).
export type Branch = 'dwarka' | 'AN';

export interface Candidate {
  id: string;
  name: string;
  post: PostId;
  electionType: ElectionType;
  house?: HouseId; // Required for house elections
  imageUrl?: string;
  branch?: Branch;
}

export interface PostCandidateGroup {
  post: PostId;
  candidates: Candidate[];
}
