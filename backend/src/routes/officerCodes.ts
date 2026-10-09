import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAction, resolveActor } from '../services/auditLogService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import { isValidHouseId, isValidBranch } from '../config/posts.js';
import type { ElectionType, HouseId, RepollReason } from '../types/election.js';

export const officerCodesRouter = Router();

// WhatsApp numbers are stored digits-only with the country code (the
// frontend normalizes Indian numbers to e.g. "919876543210" -- see
// frontend utils/bulkAllot.ts normalizeIndianPhone). The check here is
// deliberately loose (any 8-15 digits, the international range) so it only
// rejects plain garbage, not a valid number from another country.
const isValidPhone = (value: string): boolean => /^\d{8,15}$/.test(value);

// Returns undefined for "not given", '' for "explicitly cleared", or the
// digits; throws on anything else.
const parsePhone = (value: unknown, who: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BadRequestError(`Invalid WhatsApp number for ${who}`);
  }
  const trimmed = value.trim();
  if (trimmed !== '' && !isValidPhone(trimmed)) {
    throw new BadRequestError(`Invalid WhatsApp number for ${who}`);
  }
  return trimmed;
};

officerCodesRouter.use(requireAdminSession);

officerCodesRouter.get(
  '/',
  asyncHandler((_req, res) => {
    const codes = dataStore.getOfficerCodes();
    // voteCount is the votes that count -- 0 for a re-polled booth, whose
    // set-aside votes are in entry.repoll.cancelledVoteCount instead.
    const codesWithCounts = codes.map((entry) => ({
      ...entry,
      voteCount: dataStore.countCountedVotesByOfficerCode(entry.code)
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
      allotments?: Array<{ officerName?: string; electionType?: string; house?: string; phone?: string }>;
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
    const validated: Array<{
      officerName: string;
      electionType: ElectionType;
      house?: HouseId;
      branch: typeof branch;
      runId?: string;
      phone?: string;
    }> = [];
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
      // A teacher with no valid number still gets a code (the preview step
      // shows "no valid number" and lets the row through) -- so a missing
      // phone is fine here, only a malformed one is rejected.
      const phone = parsePhone(entry.phone, officerName) || undefined;
      validated.push({
        officerName,
        electionType: entry.electionType,
        house,
        branch,
        runId: run?.electionType === entry.electionType ? run.id : undefined,
        phone
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

// "Start Allotting Duties for a Fresh Election" (Officer Codes tab): every
// code of one election type, both branches, goes back to white -- usable,
// not sent, not ready -- so this election's duty colours start clean.
// Refused while that election is running: it would reopen booths closed
// mid-election and wipe the day's check-ins.
officerCodesRouter.post(
  '/fresh-duties',
  asyncHandler(async (req, res) => {
    const { electionType } = req.body as { electionType?: unknown };
    if (electionType !== 'school' && electionType !== 'house') {
      throw new BadRequestError('Choose School or House elections');
    }
    if (dataStore.getCurrentRun()?.electionType === electionType) {
      throw new ConflictError(
        `${electionType === 'house' ? 'House' : 'School'} Elections are running right now. Start fresh duties only before an election, or after End of Voting.`
      );
    }
    const count = dataStore.startFreshDuties(electionType);
    await logAction(req.header('x-admin-client-id'), 'officerCode.freshDuties', { electionType, count });
    res.json({ count });
  })
);

// "Remove All Codes" (Officer Codes tab): deletes every code of one
// election type, Dwarka and AN together (both branches hold their elections
// together this year), so a new election starts from an empty list. Same
// rule as deleting one code: refused only while that election is running.
officerCodesRouter.post(
  '/remove-all',
  asyncHandler(async (req, res) => {
    const { electionType } = req.body as { electionType?: unknown };
    if (electionType !== 'school' && electionType !== 'house') {
      throw new BadRequestError('Choose School or House elections');
    }
    if (dataStore.getCurrentRun()?.electionType === electionType) {
      throw new ConflictError(
        `${electionType === 'house' ? 'House' : 'School'} Elections are running right now. Codes can be removed only before an election, or after End of Voting.`
      );
    }
    const count = dataStore.removeOfficerCodesByType(electionType);
    await logAction(req.header('x-admin-client-id'), 'officerCode.removeAll', { electionType, count });
    res.json({ count });
  })
);

// Send Codes screen -- marks the codes in one WhatsApp message as sent (or,
// with `sent: false`, undoes that). Takes a list because a teacher's School
// and House codes go out together in a single message.
officerCodesRouter.post(
  '/mark-sent',
  asyncHandler(async (req, res) => {
    const { codes, sent } = req.body as { codes?: unknown; sent?: unknown };
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > 20 || !codes.every((code) => typeof code === 'string')) {
      throw new BadRequestError('Give between 1 and 20 codes');
    }
    if (typeof sent !== 'boolean') {
      throw new BadRequestError('Missing sent flag');
    }
    const updated = dataStore.markOfficerCodesSent(codes as string[], sent);
    if (updated.length === 0) {
      throw new BadRequestError('Code not found');
    }
    for (const entry of updated) {
      await logAction(
        req.header('x-admin-client-id'),
        sent ? 'officerCode.markSent' : 'officerCode.unmarkSent',
        { code: entry.code, officerName: entry.officerName },
        entry.branch
      );
    }
    res.json({ codes: updated });
  })
);

officerCodesRouter.put(
  '/:code',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { officerName, phone } = req.body as { officerName?: string; phone?: unknown };
    const parsedPhone = parsePhone(phone, code);
    // A booth that has cast votes or been sealed keeps an officer's name:
    // blanking it would make it "unallotted" (to be deleted, per the End of
    // Voting rule in runService.endOfVotingBlockers) while it can't be
    // deleted -- leaving the election impossible to close. The name can
    // still be corrected, just not erased.
    if (typeof officerName === 'string' && !officerName.trim()) {
      const existing = dataStore.findOfficerCode(code);
      if (existing && (existing.seal || dataStore.countVotesByOfficerCode(existing.code) > 0)) {
        throw new ConflictError(
          `Booth ${existing.code} has already been used${existing.seal ? ' and sealed' : ''}, so its officer's name can be corrected but not removed.`
        );
      }
    }
    // Matching is case-insensitive (see datastore.ts's codesMatch), so no
    // case normalization is needed here.
    const updated = dataStore.updateOfficerCode(code, {
      officerName: typeof officerName === 'string' ? officerName.trim() : undefined,
      phone: parsedPhone
    });
    if (!updated) {
      throw new BadRequestError('Code not found');
    }
    if (typeof officerName === 'string') {
      await logAction(
        req.header('x-admin-client-id'),
        'officerCode.name',
        { code: updated.code, officerName: updated.officerName },
        updated.branch
      );
    }
    if (parsedPhone !== undefined) {
      await logAction(req.header('x-admin-client-id'), 'officerCode.phone', { code: updated.code }, updated.branch);
    }
    res.json({ code: updated });
  })
);

// "Verify & Seal" -- once a booth has closed, the Chief Election
// Commissioner compares the app's vote count for it with the number of
// voters on the printed Paper List. Matching counts seal the booth for good;
// a mismatch is refused (the remedy is Order Re-poll). Only while that
// election is running -- End of Voting itself needs every booth with votes
// sealed (see services/runService.ts closeRecording).
officerCodesRouter.post(
  '/:code/seal',
  asyncHandler(async (req, res) => {
    const entry = dataStore.findOfficerCode(req.params.code);
    if (!entry) {
      throw new BadRequestError('Code not found');
    }
    const { paperListCount } = req.body as { paperListCount?: unknown };
    if (typeof paperListCount !== 'number' || !Number.isInteger(paperListCount) || paperListCount < 0) {
      throw new BadRequestError('Enter the number of voters on the Paper List');
    }
    if (entry.seal) {
      throw new ConflictError(`Booth ${entry.code} is already sealed.`);
    }
    // One path per code (see runService.endOfVotingBlockers): a code never
    // allotted to anyone is deleted, not sealed.
    if (!entry.officerName.trim()) {
      throw new ConflictError(`Code ${entry.code} was never allotted to a polling officer -- delete it instead of sealing it.`);
    }
    if (entry.repoll) {
      throw new ConflictError(`A re-poll was ordered at booth ${entry.code} -- check and seal its new code ${entry.repoll.replacementCode} instead.`);
    }
    if (!entry.closedAt) {
      throw new ConflictError(`Polling at booth ${entry.code} is still open. Close the booth before verifying it.`);
    }
    const run = dataStore.getCurrentRun();
    if (!run || run.electionType !== entry.electionType) {
      throw new ConflictError('A booth can only be verified and sealed while its election is running.');
    }
    const appCount = dataStore.countCountedVotesByOfficerCode(entry.code);
    if (appCount !== paperListCount) {
      throw new ConflictError(
        `The counts don't match: the app counted ${appCount} vote${appCount === 1 ? '' : 's'} at booth ${entry.code}, but the Paper List has ${paperListCount}. Check again, or order a re-poll at this booth.`,
        'SEAL_COUNT_MISMATCH',
        { appCount, paperListCount }
      );
    }
    const clientId = req.header('x-admin-client-id');
    const sealed = dataStore.sealOfficerCode(entry.code, {
      sealedAt: Date.now(),
      sealedBy: resolveActor(clientId),
      paperListCount,
      appCount
    });
    await logAction(
      clientId,
      'officerCode.seal',
      { code: entry.code, officerName: entry.officerName, paperListCount, appCount },
      entry.branch
    );
    res.json({ code: sealed });
  })
);

const REPOLL_REASONS: RepollReason[] = ['irregularity', 'disruption', 'count-mismatch', 'other'];

// Re-polling at one booth -- ordered by the Chief Election Commissioner when
// an irregularity, a disruption or a vote-count mismatch is found there.
// Every vote cast under this code stops counting (kept on record, never
// deleted), the code is dead for good, and a fresh code is issued for the
// same election/house/branch -- to the same teacher or a different one --
// so the booth can vote again. Only while that election is running.
officerCodesRouter.post(
  '/:code/repoll',
  asyncHandler(async (req, res) => {
    const entry = dataStore.findOfficerCode(req.params.code);
    if (!entry) {
      throw new BadRequestError('Code not found');
    }
    const { reason, note, officerName, phone } = req.body as {
      reason?: unknown;
      note?: unknown;
      officerName?: unknown;
      phone?: unknown;
    };
    if (typeof reason !== 'string' || !REPOLL_REASONS.includes(reason as RepollReason)) {
      throw new BadRequestError('Choose a reason for the re-poll');
    }
    const trimmedNote = typeof note === 'string' ? note.trim() : '';
    if (reason === 'other' && !trimmedNote) {
      throw new BadRequestError('Describe the reason for the re-poll');
    }
    if (trimmedNote.length > 500) {
      throw new BadRequestError('Keep the note under 500 characters');
    }
    if (entry.repoll) {
      throw new ConflictError(`A re-poll was already ordered for ${entry.code} -- its new code is ${entry.repoll.replacementCode}.`);
    }
    if (entry.seal) {
      throw new ConflictError(`Booth ${entry.code} was verified and sealed, so a re-poll can no longer be ordered there.`);
    }
    const run = dataStore.getCurrentRun();
    if (!run || run.electionType !== entry.electionType) {
      throw new ConflictError('A re-poll can only be ordered while that election is running.');
    }

    // Same teacher by default (keeping their WhatsApp number); a different
    // teacher if a name is given.
    const newName = typeof officerName === 'string' ? officerName.trim() : '';
    const sameTeacher = !newName || newName.toLowerCase() === entry.officerName.trim().toLowerCase();
    const replacementName = sameTeacher ? entry.officerName.trim() : newName;
    if (!replacementName) {
      throw new BadRequestError('Enter the name of the teacher who will run the re-poll');
    }
    const parsedPhone = parsePhone(phone, replacementName);
    const replacementPhone = parsedPhone || (sameTeacher ? entry.phone : undefined);

    const clientId = req.header('x-admin-client-id');
    const result = dataStore.orderRepoll(
      entry.code,
      { orderedBy: resolveActor(clientId), reason: reason as RepollReason, note: trimmedNote, runId: run.id },
      { officerName: replacementName, phone: replacementPhone }
    );
    if (!result) {
      throw new ConflictError('A re-poll was already ordered for this code.');
    }
    await logAction(
      clientId,
      'officerCode.repoll',
      {
        code: result.original.code,
        officerName: result.original.officerName,
        reason,
        note: trimmedNote,
        cancelledVoteCount: result.original.repoll?.cancelledVoteCount ?? 0,
        replacementCode: result.replacement.code,
        replacementOfficerName: result.replacement.officerName
      },
      result.original.branch
    );
    res.status(201).json({ code: result.original, replacement: result.replacement });
  })
);

officerCodesRouter.post(
  '/:code/reopen',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const existing = dataStore.findOfficerCode(code);
    if (existing?.repoll) {
      throw new ConflictError('A re-poll was ordered at this booth, so this code can never be reopened. Use its new code instead.');
    }
    if (existing?.seal) {
      throw new ConflictError('This booth was verified and sealed, so it can no longer be reopened.');
    }
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
    //
    // All of this protects only the election that is running right now
    // (decided 2026-10-09). Once that election has ended -- or before the
    // next one starts -- every code can be deleted, so each election can
    // start from a clean list: End of Voting has already saved the full
    // record of every booth (votes, seal, re-poll) in the archive. Votes
    // from the last election are left in place until the next Start, on
    // purpose (see runService.ts closeRecording), so without this a used
    // code could never be deleted between elections.
    const run = dataStore.getCurrentRun();
    if (run?.electionType !== entry.electionType) {
      dataStore.deleteOfficerCode(entry.code);
      await logAction(req.header('x-admin-client-id'), 'officerCode.delete', { code: entry.code }, entry.branch);
      res.status(204).send();
      return;
    }
    // Both sides of a re-poll are part of the permanent record of it.
    if (entry.repoll || entry.replacesCode) {
      throw new ConflictError(`Code ${entry.code} is part of a re-poll record and cannot be deleted.`);
    }
    if (entry.seal) {
      throw new ConflictError(`Booth ${entry.code} was verified and sealed and cannot be deleted.`);
    }
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
