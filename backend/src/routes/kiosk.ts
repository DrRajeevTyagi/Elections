import { Router } from 'express';
import { env } from '../config/env.js';
import { getPollState } from '../services/voteService.js';
import { kioskService } from '../services/kioskService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ForbiddenError, UnauthorizedError, BadRequestError } from '../utils/httpError.js';
import { isValidHouseId } from '../config/posts.js';

interface ActivationRequest {
  secret?: string;
  house?: string;
}

export const kioskRouter = Router();

kioskRouter.post(
  '/activate',
  asyncHandler((req, res) => {
    const { secret, house } = req.body as ActivationRequest;
    if (!secret || secret !== env.kioskSecret) {
      throw new UnauthorizedError('Incorrect activation key. Please check the key with the election administrator and try again.');
    }

    const pollState = getPollState();
    if (!pollState.settings.isOpen) {
      throw new ForbiddenError('Voting is currently closed. Ask the election administrator to open the poll before activating a ballot.');
    }

    if (!pollState.activeElectionType) {
      throw new ForbiddenError('No election has been set up yet. Please contact the election administrator.');
    }

    // For house elections, house is required
    if (pollState.activeElectionType === 'house') {
      if (!house || !isValidHouseId(house)) {
        throw new BadRequestError('Please select a house before activating a ballot for house elections.');
      }
    }

    const session = kioskService.createSession(house && isValidHouseId(house) ? house : undefined);
    res.status(201).json({ token: session.token });
  })
);

kioskRouter.post(
  '/deactivate',
  asyncHandler((req, res) => {
    const { token } = req.body as { token?: string };
    if (typeof token === 'string') {
      kioskService.revokeSession(token);
    }
    res.status(204).send();
  })
);
