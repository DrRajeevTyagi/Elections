import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAction } from '../services/auditLogService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import { isValidHouseId, isValidBranch } from '../config/posts.js';
import type { ElectionType, HouseId } from '../types/election.js';

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

    // Generation is prep work, same as setting up candidates -- it no
    // longer requires an active recording (decided after feedback that
    // gating this on "Start Recording" made routine prep feel like it was
    // racing a clock). If a recording for this exact election type happens
    // to be running already, the new codes are tagged with it now;
    // otherwise they're tagged when the next matching run starts (see
    // runService.ts startRecording, which carries pre-generated codes
    // forward instead of wiping them).
    const run = dataStore.getCurrentRun();

    // Defaults to 'dwarka' when omitted, same as every other branch-aware
    // write in this codebase -- see datastore.ts's DEFAULT_BRANCH. Until the
    // admin UI sends a branch (see ROADMAP.md Phase 2), every code generated
    // stays 'dwarka', unchanged from today.
    const codes = dataStore.generateOfficerCodes(
      parsedCount,
      electionType,
      house,
      branch,
      run?.electionType === electionType ? run.id : undefined
    );
    await logAction(
      req.header('x-admin-client-id'),
      'officerCode.generate',
      { count: parsedCount, electionType, house, branch: branch ?? 'dwarka', codes: codes.map((entry) => entry.code) },
      branch ?? 'dwarka'
    );
    res.status(201).json({ codes });
  })
);

// "Bulk Allot from List" (Officer Codes tab) -- takes a whole teacher list
// in one request and generates+names a code for each entry. One upload is
// always one branch (matching "one file for each branch" in how the admin
// actually works), so branch is a single top-level field, not per-entry.
// The frontend's preview step is responsible for only ever sending clean
// rows -- this route validates strictly and rejects the whole batch on any
// bad entry, rather than silently skipping rows an admin might not notice.
officerCodesRouter.post(
  '/bulk-allot',
  asyncHandler(async (req, res) => {
    const { branch, allotments } = req.body as {
      branch?: string;
      allotments?: Array<{ officerName?: string; electionType?: string; house?: string }>;
    };
    if (branch === undefined || !isValidBranch(branch)) {
      throw new BadRequestError('Invalid branch');
    }
    if (!Array.isArray(allotments) || allotments.length === 0) {
      throw new BadRequestError('No allotments given');
    }
    if (allotments.length > 500) {
      throw new BadRequestError('Too many allotments at once -- split into smaller batches (max 500)');
    }

    const run = dataStore.getCurrentRun();
    const validated: Array<{ officerName: string; electionType: ElectionType; house?: HouseId; branch: typeof branch; runId?: string }> = [];
    for (const entry of allotments) {
      const officerName = typeof entry.officerName === 'string' ? entry.officerName.trim() : '';
      if (!officerName) {
        throw new BadRequestError('Every allotment needs an officer name');
      }
      if (entry.electionType !== 'school' && entry.electionType !== 'house') {
        throw new BadRequestError(`Invalid election type for ${officerName}`);
      }
      let house: HouseId | undefined;
      if (entry.electionType === 'house') {
        if (entry.house === undefined || !isValidHouseId(entry.house)) {
          throw new BadRequestError(`Invalid or missing house for ${officerName}`);
        }
        house = entry.house;
      }
      validated.push({
        officerName,
        electionType: entry.electionType,
        house,
        branch,
        runId: run?.electionType === entry.electionType ? run.id : undefined
      });
    }

    const created = dataStore.bulkAllotOfficerCodes(validated);

    const clientId = req.header('x-admin-client-id');
    await logAction(clientId, 'officerCode.bulkAllot', { count: created.length, codes: created.map((entry) => entry.code) }, branch);
    for (const entry of created) {
      await logAction(clientId, 'officerCode.name', { code: entry.code, officerName: entry.officerName }, entry.branch);
    }

    res.status(201).json({ codes: created });
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

// The admin-side equivalent of the kiosk's own "Close Polling at This Booth"
// (kiosk.ts /close-booth) -- same effect (dataStore.closeOfficerCode), same
// logged action name so both show up together in the Activity Log, just
// reached without needing to open a kiosk tab and type the code in there to
// close it on the officer's behalf. Logged under the admin's own resolved
// actor, unlike the kiosk route's self-service `officer:${name}` actor, so
// the log itself shows which one happened.
officerCodesRouter.post(
  '/:code/close',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const updated = dataStore.closeOfficerCode(code);
    if (!updated) {
      throw new BadRequestError('Code not found');
    }
    await logAction(req.header('x-admin-client-id'), 'officerCode.close', { code: updated.code }, updated.branch);
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
    // Deletion is only ever blocked by one thing: a vote actually cast under
    // this code (ELECTION-INTEGRITY-AND-TRUST.md item 3, revised 2026-09-25).
    // The original rule was stricter -- a code that had ever been named was
    // permanent regardless of vote count, to close the gap where an admin
    // names a code, decides not to use it, then quietly deletes it before
    // anyone reviews the officer list. That gap mattered when codes were
    // handed out one at a time. It no longer fits how codes are actually
    // allotted: a full staff roster is loaded in at once, a code generated
    // and sent by WhatsApp to every name on it, and it's routine for some
    // teachers not to report for duty -- their codes were always going to be
    // named and unused, not evidence of anything. Every naming and every
    // deletion is still permanently logged either way (see the Activity Log
    // tab), so a named-then-deleted code is never actually untraceable, only
    // no longer cluttering the live list.
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
