import { Router } from 'express';
import { SCHOOL_POST_IDS, HOUSE_POST_IDS } from '../config/posts.js';
import { listCandidatesByPost } from '../services/candidateService.js';
import { recordVote, getPollState } from '../services/voteService.js';
import { dataStore } from '../storage/datastore.js';
import type { HouseId, VoteSubmission } from '../types/election.js';
import { requireKioskSession } from '../middleware/kioskSession.js';
import { kioskService } from '../services/kioskService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/httpError.js';

const validateVote = (body: unknown, electionType: 'school' | 'house', house?: HouseId): VoteSubmission => {
  if (!body || typeof body !== 'object') {
    throw new BadRequestError('Vote payload must be an object');
  }

  const submission = body as Partial<VoteSubmission>;
  if (!submission.selections || typeof submission.selections !== 'object') {
    throw new BadRequestError('Selections are required');
  }

  // Determine which posts to validate based on election type
  const postIds = electionType === 'school' ? SCHOOL_POST_IDS : HOUSE_POST_IDS;
  const selections: Record<string, unknown> = submission.selections as Record<string, unknown>;
  const normalized: Record<string, string> = {};

  for (const postId of postIds) {
    const selected = selections[postId];
    if (typeof selected !== 'string') {
      throw new BadRequestError('Missing candidate selection for ' + postId);
    }

    const candidates = listCandidatesByPost(postId, electionType, house);
    if (!candidates.some((candidate) => candidate.id === selected)) {
      throw new BadRequestError('Invalid candidate selected for ' + postId);
    }

    normalized[postId] = selected;
  }

  return { selections: normalized as VoteSubmission['selections'], house: house as VoteSubmission['house'] };
};

export const votesRouter = Router();

votesRouter.post(
  '/',
  requireKioskSession,
  asyncHandler(async (req, res) => {
    const pollState = getPollState();
    if (!pollState.activeElectionType) {
      throw new BadRequestError('No election has been set up yet. Please contact the election administrator.');
    }

    // Get house from kiosk session (for house elections)
    const kioskSession = res.locals.kioskSession;
    const house = kioskSession?.house;
    const officerCode = kioskSession?.officerCode;

    if (pollState.activeElectionType === 'house' && !house) {
      throw new BadRequestError('Please select a house before submitting a vote for house elections.');
    }

    // Validated before the one-time token is marked used, so a rejected
    // payload (or a candidate that was edited/removed mid-vote) never burns
    // the voter's code without a vote having been recorded -- see
    // kioskService.getActiveSession/markConsumed.
    const submission = validateVote(req.body, pollState.activeElectionType, house);
    kioskService.markConsumed(res.locals.kioskToken!);

    const vote = await recordVote(submission.selections, pollState.activeElectionType, house, officerCode);
    const stationVoteCount = officerCode ? dataStore.countVotesByOfficerCode(officerCode) : undefined;

    res.status(201).json({
      voteId: vote.id,
      timestamp: vote.timestamp,
      stationVoteCount
    });
  })
);
