import { Router } from 'express';
import { getPollState } from '../services/voteService.js';
import { kioskService, SESSION_TTL_MS } from '../services/kioskService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ForbiddenError, UnauthorizedError, BadRequestError } from '../utils/httpError.js';
import { isValidHouseId } from '../config/posts.js';
import { kioskGuessLimiter } from '../middleware/rateLimit.js';

interface ActivationRequest {
  secret?: string;
  house?: string;
}

export const kioskRouter = Router();

kioskRouter.post(
  '/activate',
  kioskGuessLimiter,
  asyncHandler((req, res) => {
    const { secret, house: requestedHouse } = req.body as ActivationRequest;
    const enteredCode = typeof secret === 'string' ? secret.trim().toUpperCase() : '';
    const officerCode = enteredCode ? dataStore.findOfficerCode(enteredCode) : undefined;
    if (!officerCode) {
      throw new UnauthorizedError('Incorrect officer code. Please check the code with the election administrator and try again.');
    }

    if (officerCode.closedAt) {
      throw new ForbiddenError(
        'This code has been closed by the polling officer and can no longer be used. Ask the election administrator to reopen it if this was a mistake.'
      );
    }

    const pollState = getPollState();
    if (!pollState.settings.isOpen) {
      throw new ForbiddenError('Voting is currently closed. Ask the election administrator to open the poll before activating a ballot.');
    }

    if (!pollState.activeElectionType) {
      throw new ForbiddenError('No election has been set up yet. Please contact the election administrator.');
    }

    let house: string | undefined;
    if (pollState.activeElectionType === 'house') {
      if (officerCode.house) {
        // The code carries its own house identity -- always use it and
        // ignore any house the client may have sent.
        house = officerCode.house;
      } else if (requestedHouse && isValidHouseId(requestedHouse)) {
        // Legacy/unbound code: fall back to the house the officer selected manually.
        house = requestedHouse;
      } else {
        throw new BadRequestError('Please select a house before activating a ballot for house elections.', 'HOUSE_REQUIRED');
      }
    } else if (pollState.activeElectionType === 'school' && officerCode.house) {
      throw new ForbiddenError(
        `This code is bound to the ${officerCode.house} house and can only be used during House elections.`
      );
    }

    const session = kioskService.createSession(officerCode.code, house && isValidHouseId(house) ? house : undefined);
    const stationVoteCount = dataStore.countVotesByOfficerCode(officerCode.code);
    res.status(201).json({
      token: session.token,
      officerName: officerCode.officerName,
      house,
      stationVoteCount,
      expiresAt: session.activatedAt + SESSION_TTL_MS
    });
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

kioskRouter.post(
  '/close-booth',
  kioskGuessLimiter,
  asyncHandler((req, res) => {
    const { secret } = req.body as { secret?: string };
    const enteredCode = typeof secret === 'string' ? secret.trim().toUpperCase() : '';
    const officerCode = enteredCode ? dataStore.findOfficerCode(enteredCode) : undefined;
    if (!officerCode) {
      throw new UnauthorizedError('Incorrect officer code. Please check the code and try again.');
    }

    dataStore.closeOfficerCode(officerCode.code);
    res.status(200).json({ message: 'Polling closed for this booth. This code can no longer be used to activate a ballot.' });
  })
);
