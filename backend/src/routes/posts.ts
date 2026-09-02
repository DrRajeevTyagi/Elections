import { Router } from 'express';
import { SCHOOL_POST_IDS, HOUSE_POST_IDS, isValidPostId, isValidHouseId } from '../config/posts.js';
import { listCandidatesForActiveElection, listCandidatesByPost } from '../services/candidateService.js';
import { getPollState } from '../services/voteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, ForbiddenError } from '../utils/httpError.js';
import type { HouseId } from '../types/election.js';

export const postsRouter = Router();

postsRouter.get(
  '/',
  asyncHandler((req, res) => {
    const pollState = getPollState();
    if (!pollState.activeElectionType) {
      throw new ForbiddenError('No election type is currently active');
    }

    // Get house from query parameter (for house elections)
    const house = req.query.house as string | undefined;
    if (pollState.activeElectionType === 'house') {
      if (!house || !isValidHouseId(house)) {
        throw new BadRequestError('House parameter is required for house elections');
      }
    }

    // Get post IDs based on election type
    const postIds = pollState.activeElectionType === 'school' ? SCHOOL_POST_IDS : HOUSE_POST_IDS;
    
    const posts = postIds.map((postId) => ({
      post: postId,
      candidates: listCandidatesByPost(postId, pollState.activeElectionType ?? undefined, house as HouseId | undefined)
    }));

    const candidates = listCandidatesForActiveElection(house as HouseId | undefined);

    res.json({
      posts,
      candidates
    });
  })
);

postsRouter.get(
  '/:postId/candidates',
  asyncHandler((req, res) => {
    const { postId } = req.params;
    const pollState = getPollState();

    if (!postId || !isValidPostId(postId)) {
      throw new BadRequestError('Invalid post identifier');
    }

    if (!pollState.activeElectionType) {
      throw new ForbiddenError('No election type is currently active');
    }

    // Get house from query parameter (for house elections)
    const house = req.query.house as string | undefined;
    if (pollState.activeElectionType === 'house') {
      if (!house || !isValidHouseId(house)) {
        throw new BadRequestError('House parameter is required for house elections');
      }
    }

    res.json({
      post: postId,
      candidates: listCandidatesByPost(postId, pollState.activeElectionType, house as HouseId | undefined)
    });
  })
);
