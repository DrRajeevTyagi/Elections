import { POST_NAMES } from '../constants/posts';
import type { CandidateVoteCount } from '../types/api';
import type { PostId } from '../types/election';

// What a re-polled booth's cancelled votes had given each candidate, one
// line per post: "Head Boy: Asha −6, Ravi −5". Shown in the Order Re-poll
// window (before confirming) and in the election record.
export const CancelledVotesList = ({ breakdown }: { breakdown: CandidateVoteCount[] }): JSX.Element => {
  const posts: PostId[] = [];
  for (const entry of breakdown) {
    if (!posts.includes(entry.post)) {
      posts.push(entry.post);
    }
  }
  return (
    <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.1rem' }}>
      {posts.map((post) => (
        <li key={post} style={{ overflowWrap: 'anywhere' }}>
          <strong>{POST_NAMES[post]}:</strong>{' '}
          {breakdown
            .filter((entry) => entry.post === post)
            .map((entry) => `${entry.name} −${entry.count}`)
            .join(', ')}
        </li>
      ))}
    </ul>
  );
};
