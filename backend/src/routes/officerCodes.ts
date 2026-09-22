import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAction } from '../services/auditLogService.js';
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
  asyncHandler(async (req, res) => {
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

    // Generation requires an active recording matching this election type
    // (ELECTION-INTEGRITY-AND-TRUST.md item 11: "only after this point
    // allows officer-code generation" -- every code belongs to exactly one
    // run). Deliberately narrower than the Open Poll gate (which stays
    // ungated for now, decided 2026-09-23) -- this only affects the
    // "Generate codes" buttons, not already-open voting.
    const run = dataStore.getCurrentRun();
    if (!run) {
      throw new BadRequestError(
        `Start a recording for ${electionType === 'house' ? 'House' : 'School'} Elections before generating codes.`
      );
    }
    if (run.electionType !== electionType) {
      throw new BadRequestError(
        `The active recording ("${run.name}") is for ${run.electionType === 'house' ? 'House' : 'School'} Elections, not ` +
          `${electionType === 'house' ? 'House' : 'School'} Elections. Close it and start a matching recording first.`
      );
    }

    // Defaults to 'dwarka' when omitted, same as every other branch-aware
    // write in this codebase -- see datastore.ts's DEFAULT_BRANCH. Until the
    // admin UI sends a branch (see ROADMAP.md Phase 2), every code generated
    // stays 'dwarka', unchanged from today.
    const codes = dataStore.generateOfficerCodes(parsedCount, electionType, house, branch, run.id);
    await logAction(
      req.header('x-admin-client-id'),
      'officerCode.generate',
      { count: parsedCount, electionType, house, branch: branch ?? 'dwarka', codes: codes.map((entry) => entry.code) },
      branch ?? 'dwarka'
    );
    res.status(201).json({ codes });
  })
);

officerCodesRouter.put(
  '/:code',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { officerName } = req.body as { officerName?: string };
    // Matching is case-insensitive (see datastore.ts's codesMatch), so no
    // case normalization is needed here.
    const updated = dataStore.updateOfficerCode(code, {
      officerName: typeof officerName === 'string' ? officerName.trim() : undefined
    });
    if (!updated) {
      throw new BadRequestError('Code not found');
    }
    await logAction(
      req.header('x-admin-client-id'),
      'officerCode.name',
      { code: updated.code, officerName: updated.officerName },
      updated.branch
    );
    res.json({ code: updated });
  })
);

officerCodesRouter.post(
  '/:code/reopen',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const updated = dataStore.reopenOfficerCode(code);
    if (!updated) {
      throw new BadRequestError('Code not found');
    }
    await logAction(req.header('x-admin-client-id'), 'officerCode.reopen', { code: updated.code }, updated.branch);
    res.json({ code: updated });
  })
);

officerCodesRouter.delete(
  '/:code',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const entry = dataStore.findOfficerCode(code);
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
        `Code ${entry.code} has been allotted to a polling officer and cannot be deleted, even though it has zero votes. Close the booth instead to stop it from being used further.`
      );
    }
    // Use the resolved entry's own code (not the raw, possibly
    // differently-cased path param) so this always matches the exact string
    // stored on votes -- see kiosk.ts activate, which records votes under
    // officerCode.code, not whatever case the voter/officer typed.
    const voteCount = dataStore.countVotesByOfficerCode(entry.code);
    if (voteCount > 0) {
      throw new ConflictError(
        `Code ${entry.code} has already cast ${voteCount} vote${voteCount === 1 ? '' : 's'} and cannot be deleted. Close the booth instead to stop it from being used further.`
      );
    }
    dataStore.deleteOfficerCode(entry.code);
    await logAction(req.header('x-admin-client-id'), 'officerCode.delete', { code: entry.code }, entry.branch);
    res.status(204).send();
  })
);
