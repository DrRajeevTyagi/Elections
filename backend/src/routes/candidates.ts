import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { getPollState } from '../services/voteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, ForbiddenError } from '../utils/httpError.js';
import type { Candidate, ElectionType, HouseId } from '../types/election.js';
import { isValidPostId, SCHOOL_POST_IDS, HOUSE_POST_IDS, isValidHouseId, isValidBranch } from '../config/posts.js';

export const candidatesRouter = Router();

// Editing candidates while voters are actively casting ballots can change or
// remove a candidate ID an in-flight ballot references -- that vote then
// fails validation after the one-time token is already spent (see votes.ts).
// Candidates are locked for the whole election, not just while polling is
// literally open right now: "Pause Polling" stops new votes but does NOT end
// the election (see the Dashboard's "ELECTION IN PROGRESS" banner, which
// stays up through a pause) -- checking isOpen alone left a window where
// pausing to take a lunch break would silently unlock candidate edits mid
// election, contradicting the wizard's own "Candidates will be locked" step
// and risking exactly the stranded-ballot problem this guard exists to
// prevent, for any post someone had already voted on before the pause. Same
// reasoning as poll.ts's /reset guard.
const ensureNoElectionInProgress = (): void => {
  if (getPollState().settings.isOpen || dataStore.getCurrentRun()) {
    throw new ForbiddenError(
      'Candidates cannot be added, edited, or deleted while an election is in progress (this includes a Pause Polling break) -- changing candidates mid-election can strand an in-progress or already-cast ballot. End the Election Process first.'
    );
  }
};

// Photos are stored inline as compressed base64 data URLs (see datastore.ts
// for why: election state is a single JSON document with a size ceiling).
// This caps each candidate's photo well below that ceiling.
const MAX_IMAGE_DATA_URL_LENGTH = 60_000;

const validateImageUrl = (imageUrl: string): void => {
  if (imageUrl.length === 0) {
    return;
  }
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(imageUrl)) {
    throw new BadRequestError('Candidate photo must be an uploaded image');
  }
  if (imageUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new BadRequestError('Candidate photo is too large');
  }
};

candidatesRouter.put(
  '/:candidateId',
  requireAdminSession,
  asyncHandler((req, res) => {
    ensureNoElectionInProgress();
    const { candidateId } = req.params;
    const { name, imageUrl } = req.body as Partial<Candidate>;

    if (!candidateId) {
      throw new BadRequestError('Candidate ID is required');
    }

    const candidates = dataStore.getCandidates();
    const candidateIndex = candidates.findIndex((c) => c.id === candidateId);

    if (candidateIndex === -1) {
      throw new BadRequestError('Candidate not found');
    }

    const candidate = candidates[candidateIndex];

    // Update only the fields provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new BadRequestError('Name must be a non-empty string');
      }
      candidate.name = name.trim();
    }

    if (imageUrl !== undefined) {
      const trimmedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
      validateImageUrl(trimmedImageUrl);
      candidate.imageUrl = trimmedImageUrl.length > 0 ? trimmedImageUrl : undefined;
    }

    dataStore.setCandidates(candidates);

    res.json({ candidate });
  })
);

candidatesRouter.post(
  '/',
  requireAdminSession,
  asyncHandler((req, res) => {
    ensureNoElectionInProgress();
    const { id, name, post, electionType, house, imageUrl, branch } = req.body as Partial<Candidate>;

    if (!id || !name || !post) {
      throw new BadRequestError('ID, name, and post are required');
    }

    if (!isValidPostId(post)) {
      throw new BadRequestError('Invalid post ID');
    }

    if (branch !== undefined && !isValidBranch(branch)) {
      throw new BadRequestError('Invalid branch');
    }

    // Determine election type from post if not provided
    let determinedElectionType: ElectionType;
    if (electionType) {
      determinedElectionType = electionType;
    } else {
      // Auto-determine from post
      determinedElectionType = SCHOOL_POST_IDS.includes(post as any) ? 'school' : 'house';
    }

    // Validate post matches election type
    if (determinedElectionType === 'school' && !SCHOOL_POST_IDS.includes(post as any)) {
      throw new BadRequestError('School election posts are: HB, HG, SSC, SRC, SCC');
    }
    if (determinedElectionType === 'house' && !HOUSE_POST_IDS.includes(post as any)) {
      throw new BadRequestError('House election posts are: HC, HCC, HSC');
    }

    // House is required for house elections
    if (determinedElectionType === 'house') {
      if (!house || !isValidHouseId(house)) {
        throw new BadRequestError('House is required for house election candidates');
      }
    }

    const candidates = dataStore.getCandidates();

    if (candidates.some((c) => c.id === id)) {
      throw new BadRequestError('Candidate ID already exists');
    }

    const trimmedImageUrl = imageUrl?.trim();
    if (trimmedImageUrl) {
      validateImageUrl(trimmedImageUrl);
    }

    const newCandidate: Candidate = {
      id: id.trim(),
      name: name.trim(),
      post,
      electionType: determinedElectionType,
      house: determinedElectionType === 'house' ? (house as HouseId) : undefined,
      imageUrl: trimmedImageUrl,
      // Defaults to 'dwarka' when omitted -- until the admin UI sends a
      // branch (see ROADMAP.md Phase 2), every candidate added stays
      // 'dwarka', unchanged from today.
      branch: branch ?? 'dwarka'
    };

    candidates.push(newCandidate);
    dataStore.setCandidates(candidates);

    res.status(201).json({ candidate: newCandidate });
  })
);

candidatesRouter.delete(
  '/:candidateId',
  requireAdminSession,
  asyncHandler((req, res) => {
    ensureNoElectionInProgress();
    const { candidateId } = req.params;

    if (!candidateId) {
      throw new BadRequestError('Candidate ID is required');
    }

    const candidates = dataStore.getCandidates();
    const filtered = candidates.filter((c) => c.id !== candidateId);

    if (filtered.length === candidates.length) {
      throw new BadRequestError('Candidate not found');
    }

    dataStore.setCandidates(filtered);

    res.status(204).send();
  })
);






