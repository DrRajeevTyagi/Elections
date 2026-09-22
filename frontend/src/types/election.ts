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

export interface Candidate {
  id: string;
  name: string;
  post: PostId;
  electionType: ElectionType;
  house?: HouseId; // Required for house elections
  imageUrl?: string;
}

export interface PostCandidateGroup {
  post: PostId;
  candidates: Candidate[];
}
