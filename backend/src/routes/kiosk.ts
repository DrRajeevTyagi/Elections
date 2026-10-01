import { Router } from 'express';
import { getPollState } from '../services/voteService.js';
import { kioskService, SESSION_TTL_MS } from '../services/kioskService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAction } from '../services/auditLogService.js';
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
    // Matching is case-insensitive (see datastore.ts's codesMatch), so no
    // case normalization is needed here beyond trimming whitespace.
    const enteredCode = typeof secret === 'string' ? secret.trim() : '';
    const officerCode = enteredCode ? dataStore.findOfficerCode(enteredCode) : undefined;
    if (!officerCode) {
      throw new UnauthorizedError('Incorrect officer code. Please check the code with the election administrator and try again.');
    }

    // Checked before closedAt (a re-polled code is closed too) so the
    // officer is told why and what to do.
    if (officerCode.repoll) {
      throw new ForbiddenError(
        'The Election Commission ordered a re-poll at this booth, so this code no longer works. A new code has been issued for the re-poll -- ask the election administrator for it.'
      );
    }

    if (officerCode.closedAt) {
      // Doesn't say WHO closed it -- could be the officer's own "Close
      // Polling at This Booth," or an admin closing it directly from the
      // Officer Codes tab (added 2026-09-25) -- the instruction is the same
      // either way.
      // Also how a code from a finished election reads (End of Voting
      // closes every booth -- "duty over", red on the Officer Codes tab).
      throw new ForbiddenError(
        'This code is closed -- polling duty for it is over. Ask the election administrator to reopen it if this was a mistake.'
      );
    }

    // A code must be allotted to a named polling officer before it can
    // activate a ballot -- a freshly generated, still-unnamed code (see
    // datastore.ts generateOfficerCodes: officerName starts as '') has not
    // yet been handed to anyone and must not be usable to vote.
    if (!officerCode.officerName.trim()) {
      throw new ForbiddenError(
        'This code has not yet been allotted to a polling officer. Ask the election administrator to assign a name to this code before using it.'
      );
    }

    // A correct, allotted, usable code: the teacher has received it and is
    // at a kiosk -- marked ready (green on the Officer Codes tab) even if
    // voting hasn't opened yet, which is exactly when teachers check in.
    dataStore.markOfficerCodeReady(officerCode.code);

    const pollState = getPollState();
    if (!pollState.settings.isOpen || !pollState.activeElectionType) {
      throw new ForbiddenError(
        '✓ Your code is correct and you are marked as ready. Voting has not started yet -- please try again once the election administrator opens the poll.',
        'READY_POLL_NOT_OPEN'
      );
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
  asyncHandler(async (req, res) => {
    const { secret } = req.body as { secret?: string };
    const enteredCode = typeof secret === 'string' ? secret.trim() : '';
    const officerCode = enteredCode ? dataStore.findOfficerCode(enteredCode) : undefined;
    if (!officerCode) {
      throw new UnauthorizedError('Incorrect officer code. Please check the code and try again.');
    }

    dataStore.closeOfficerCode(officerCode.code);
    // This is the polling officer's own self-service action, not an admin
    // one -- there's no admin session/client id here to resolve a human
    // label from (see auditLogService.resolveActor), so the officer's own
    // name on the code stands in as the actor instead.
    await logAction(
      `officer:${officerCode.officerName || officerCode.code}`,
      'officerCode.close',
      { code: officerCode.code },
      officerCode.branch
    );
    res.status(200).json({ message: 'Polling closed for this booth. This code can no longer be used to activate a ballot.' });
  })
);
