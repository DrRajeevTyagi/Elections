import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import { isValidHouseId, isValidBranch } from '../config/posts.js';

export const officerCodesRouter = Router();

officerCodesRouter.use(requireAdminSession);

officerCodesRouter.get(
  '/',
  asyncHandler((_req, res) => {
    const codes = dataStore.getOfficerCodes();
    const codesWithCounts = codes.map((entry) => ({
      ...entry,
      voteCount: dataStore.countVotesByOfficerCode(entry.code)
    }));
    res.json({ codes: codesWithCounts });
  })
);

officerCodesRouter.post(
  '/generate',
  asyncHandler((req, res) => {
    const { count, house, branch } = req.body as { count?: number; house?: string; branch?: string };
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 200) {
      throw new BadRequestError('Enter a number of codes between 1 and 200');
    }
    if (house !== undefined && !isValidHouseId(house)) {
      throw new BadRequestError('Invalid house');
    }
    if (branch !== undefined && !isValidBranch(branch)) {
      throw new BadRequestError('Invalid branch');
    }
    // A house is only ever passed by the "Generate for House Elections"
    // controls -- its presence is what distinguishes a House code from a
    // School code (see kiosk.ts activate, which rejects a code outright if
    // its electionType doesn't match whichever election is currently
    // active).
    const electionType = house !== undefined ? 'house' : 'school';
    // Defaults to 'dwarka' when omitted, same as every other branch-aware
    // write in this codebase -- see datastore.ts's DEFAULT_BRANCH. Until the
    // admin UI sends a branch (see ROADMAP.md Phase 2), every code generated
    // stays 'dwarka', unchanged from today.
    const codes = dataStore.generateOfficerCodes(parsedCount, electionType, house, branch);
    res.status(201).json({ codes });
  })
);

officerCodesRouter.put(
  '/:code',
  asyncHandler((req, res) => {
    const { code } = req.params;
    const { officerName } = req.body as { officerName?: string };
    const updated = dataStore.updateOfficerCode(code.toUpperCase(), {
      officerName: typeof officerName === 'string' ? officerName.trim() : undefined
    });
    if (!updated) {
      throw new BadRequestError('Code not found');
    }
    res.json({ code: updated });
  })
);

officerCodesRouter.post(
  '/:code/reopen',
  asyncHandler((req, res) => {
    const { code } = req.params;
    const updated = dataStore.reopenOfficerCode(code.toUpperCase());
    if (!updated) {
      throw new BadRequestError('Code not found');
    }
    res.json({ code: updated });
  })
);

officerCodesRouter.delete(
  '/:code',
  asyncHandler((req, res) => {
    const { code } = req.params;
    const normalizedCode = code.toUpperCase();
    const entry = dataStore.findOfficerCode(normalizedCode);
    if (!entry) {
      throw new BadRequestError('Code not found');
    }
    // Deletion is only allowed for a code that has never been allotted to a
    // named officer AND has never cast a vote (ELECTION-INTEGRITY-AND-TRUST.md
    // item 3). Once a code has been named it's permanent regardless of
    // whether it was used -- this is deliberately stricter than checking the
    // vote count alone, closing the gap where an admin names a code, decides
    // not to use it, then quietly deletes it before anyone reviews the
    // officer list. Closing the code (see /reopen) is the correct way to
    // retire a code that's no longer needed.
    if (entry.everNamed) {
      throw new ConflictError(
        `Code ${normalizedCode} has been allotted to a polling officer and cannot be deleted, even though it has zero votes. Close the booth instead to stop it from being used further.`
      );
    }
    const voteCount = dataStore.countVotesByOfficerCode(normalizedCode);
    if (voteCount > 0) {
      throw new ConflictError(
        `Code ${normalizedCode} has already cast ${voteCount} vote${voteCount === 1 ? '' : 's'} and cannot be deleted. Close the booth instead to stop it from being used further.`
      );
    }
    dataStore.deleteOfficerCode(normalizedCode);
    res.status(204).send();
  })
);
