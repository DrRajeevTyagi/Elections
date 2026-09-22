import { Router } from 'express';
import { getPollState } from '../services/voteService.js';
import { kioskService, SESSION_TTL_MS } from '../services/kioskService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ForbiddenError, UnauthorizedError } from '../utils/httpError.js';
import { kioskGuessLimiter } from '../middleware/rateLimit.js';

interface ActivationRequest {
  secret?: string;
}

export const kioskRouter = Router();

kioskRouter.post(
  '/activate',
  kioskGuessLimiter,
  asyncHandler((req, res) => {
    const { secret } = req.body as ActivationRequest;
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

    // A code generated for one election must never activate a ballot for
    // the other, even if that other election happens to be the one
    // currently open -- e.g. a School code must be rejected outright while
    // House elections are active, not treated as "no house preference" and
    // let the officer pick any house.
    if (officerCode.electionType !== pollState.activeElectionType) {
      const codeKind = officerCode.electionType === 'house' ? 'House' : 'School';
      const activeKind = pollState.activeElectionType === 'house' ? 'House' : 'School';
      throw new ForbiddenError(
        `This code is for ${codeKind} Elections and cannot be used while ${activeKind} Elections are active. Ask the election administrator for a ${activeKind} Elections code.`
      );
    }

    // For a house-election code, the house always comes from the code
    // itself (set at generation time) -- never from client input.
    const house = officerCode.electionType === 'house' ? officerCode.house : undefined;

    const session = kioskService.createSession(officerCode.code, house, officerCode.branch);
    const stationVoteCount = dataStore.countVotesByOfficerCode(officerCode.code);
    res.status(201).json({
      token: session.token,
      officerName: officerCode.officerName,
      house,
      branch: officerCode.branch,
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
