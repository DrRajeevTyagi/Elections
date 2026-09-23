import { Router } from 'express';
import { SCHOOL_POST_IDS, HOUSE_POST_IDS, isValidHouseId, isValidBranch } from '../config/posts.js';
import { listCandidatesForActiveElection, listCandidatesByPost } from '../services/candidateService.js';
import { getPollState } from '../services/voteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, ForbiddenError } from '../utils/httpError.js';
import type { Branch, HouseId } from '../types/election.js';

export const postsRouter = Router();

// `branch` here is a display convenience, not a trust boundary -- this
// route has no session binding (unlike POST /votes), so a `branch` query
// param is just client-supplied input. The real enforcement is in
// routes/votes.ts, which derives branch from the kiosk session server-side.
// This just needs to match what the kiosk will actually be allowed to
// submit, so the ballot the voter sees isn't misleading.
const parseBranch = (value: unknown): Branch | undefined =>
  typeof value === 'string' && isValidBranch(value) ? value : undefined;

postsRouter.get(
  '/',
  asyncHandler((req, res) => {
    const pollState = getPollState();
    if (!pollState.activeElectionType) {
      throw new ForbiddenError('No election has been set up yet. Please contact the election administrator.');
    }

    // Get house from query parameter (for house elections)
    const house = req.query.house as string | undefined;
    if (pollState.activeElectionType === 'house') {
      if (!house || !isValidHouseId(house)) {
        throw new BadRequestError('House parameter is required for house elections');
      }
    }
    const branch = parseBranch(req.query.branch);

    // Get post IDs based on election type
    const postIds = pollState.activeElectionType === 'school' ? SCHOOL_POST_IDS : HOUSE_POST_IDS;

    const posts = postIds.map((postId) => ({
      post: postId,
      candidates: listCandidatesByPost(postId, pollState.activeElectionType ?? undefined, house as HouseId | undefined, branch)
    }));

    const candidates = listCandidatesForActiveElection(house as HouseId | undefined, branch);

    res.json({
      posts,
      candidates
    });
  })
);

// GET /:postId/candidates was removed -- the ballot never called it; it loads
// every post at once from GET / above.
