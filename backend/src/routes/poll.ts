import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { kioskService } from '../services/kioskService.js';
import { getPollState } from '../services/voteService.js';
import { archiveCurrentElection } from '../services/resultsService.js';
import { findMissingCandidateCoverage } from '../services/candidateService.js';
import { logAction } from '../services/auditLogService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import type { PollState, ElectionType } from '../types/election.js';

// hasActiveRun lets the public banner (AppLayout.tsx, admin dashboard AND
// kiosk) know whether activeElectionType currently means something real,
// vs. a leftover value from a run that has since closed -- activeElectionType
// itself is never reset to null on every path that ends an election (Reset
// Poll doesn't touch it, and pre-existing stray values from before this
// field existed will never self-correct), so the banner must not trust it
// alone. See ROADMAP.md / this route's callers for the full account.
const sanitizePoll = ({ activeElectionType, settings }: PollState) => ({
  activeElectionType,
  settings,
  hasActiveRun: Boolean(dataStore.getCurrentRun())
});

export const pollRouter = Router();

pollRouter.get(
  '/',
  asyncHandler((_req, res) => {
    res.json({ poll: sanitizePoll(getPollState()) });
  })
);

pollRouter.post(
  '/set-type',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    const { electionType, name } = req.body as { electionType?: string; name?: string };

    if (electionType !== 'school' && electionType !== 'house') {
      throw new BadRequestError('Invalid election type. Must be "school" or "house"');
    }

    // A run ties itself to one election type at start time (see
    // runService.startRecording) -- switching the type out from under an
    // active recording would leave the run's own electionType field and the
    // live poll state disagreeing about what's actually being recorded.
    // Close the recording first (or just don't switch while one is active).
    const activeRun = dataStore.getCurrentRun();
    if (activeRun) {
      throw new ConflictError(
        `A recording is currently active ("${activeRun.name}"). Close it before switching election type.`,
        'RUN_ACTIVE'
      );
    }

    const currentState = getPollState();
    const outgoingType = currentState.activeElectionType;

    // Switching away from a type that still has uncounted votes would
    // otherwise leave them sitting in the store, invisible until the admin
    // switches back -- at which point they'd silently reappear in results.
    // Archive (or relabel an already-saved checkpoint -- see
    // archiveCurrentElection) and clear them now, same as Reset Poll does.
    if (outgoingType && outgoingType !== electionType) {
      const outgoingVotes = dataStore.getVotes().filter((vote) => vote.electionType === outgoingType);
      if (outgoingVotes.length > 0) {
        archiveCurrentElection(name);
        dataStore.resetVotesByType(outgoingType);
      }
    }

    // Clear sessions when switching election types
    kioskService.clearSessions();

    const poll = dataStore.updatePollState((state) => ({
      ...state,
      activeElectionType: electionType as ElectionType,
      settings: {
        ...state.settings,
        isOpen: false // Close poll when switching election types
      }
    }));

    // Not logged: this route only ever succeeds while no run is active (see
    // the RUN_ACTIVE guard above), so it always falls in the free, unlogged
    // setup period by definition -- consistent with "nothing is logged
    // before Start Recording."
    res.json({ poll: sanitizePoll(poll) });
  })
);

pollRouter.post(
  '/open',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    const currentState = getPollState();
    if (!currentState.activeElectionType) {
      throw new BadRequestError('Please set an election type before opening the poll');
    }

    const missingCoverage = findMissingCandidateCoverage(currentState.activeElectionType);
    if (missingCoverage.length > 0) {
      throw new BadRequestError(
        `Cannot open the poll: no candidates yet for ${missingCoverage.join(', ')}. Add at least one candidate for each before opening, or a voter reaching that post will get stuck.`
      );
    }

    const poll = dataStore.updatePollState((state) => ({
      ...state,
      activeElectionType: state.activeElectionType, // Preserve
      settings: {
        ...state.settings,
        isOpen: true
      }
    }));

    // Deliberately NOT gated on a run being active (decided 2026-09-23) --
    // Open Poll keeps working exactly as before regardless of run state.
    // logAction itself still no-ops if no run happens to be active, so this
    // only actually writes an entry when Open Poll is used during a
    // recording.
    await logAction(req.header('x-admin-client-id'), 'poll.open', { electionType: currentState.activeElectionType });
    res.json({ poll: sanitizePoll(poll) });
  })
);

pollRouter.post(
  '/close',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    kioskService.clearSessions();
    const poll = dataStore.updatePollState((state) => ({
      ...state,
      activeElectionType: state.activeElectionType, // Preserve
      settings: {
        ...state.settings,
        isOpen: false
      }
    }));

    await logAction(req.header('x-admin-client-id'), 'poll.close', {});
    res.json({ poll: sanitizePoll(poll) });
  })
);

pollRouter.post(
  '/reset',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    // Snapshot the current election's results before wiping votes, so a
    // record survives the reset -- see GET /api/report/archives. Skips
    // creating a duplicate if this exact data was already saved (e.g. via
    // "Save to Election History" right after Close) -- see
    // archiveCurrentElection.
    archiveCurrentElection(name);

    kioskService.clearSessions();
    dataStore.resetVotes();
    // Deliberately kept as-is (decided 2026-09-23: Close Recording is a new,
    // separate action, not a replacement for Reset Poll -- zero behavior
    // change here). Still logged if a run happens to be active when this is
    // used, since that's exactly the "old button used during a recording,
    // bypassing Close Recording" scenario worth having a record of.
    await logAction(req.header('x-admin-client-id'), 'poll.reset', {});
    const poll = dataStore.updatePollState((state) => ({
      ...state,
      activeElectionType: state.activeElectionType, // Preserve
      settings: {
        ...state.settings,
        isOpen: false
      }
    }));

    res.json({
      poll: sanitizePoll(poll),
      message: 'All votes cleared and poll closed'
    });
  })
);
