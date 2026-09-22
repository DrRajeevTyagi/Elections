import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/httpError.js';
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
    dataStore.deleteOfficerCode(code.toUpperCase());
    res.status(204).send();
  })
);
