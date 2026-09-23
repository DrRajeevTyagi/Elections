import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { kioskService } from '../services/kioskService.js';
import { getPollState } from '../services/voteService.js';
import { archiveCurrentElection } from '../services/resultsService.js';
import { findMissingCandidateCoverage } from '../services/candidateService.js';
import { logAction } from '../services/auditLogService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, ConflictError, ForbiddenError } from '../utils/httpError.js';
import type { PollState, ElectionType } from '../types/election.js';

// hasActiveRun tells the admin dashboard whether a run is genuinely in
// progress right now (as opposed to just a type having been picked) --
// separate from whether the banner should show, see below.
const sanitizePoll = ({ activeElectionType, settings }: PollState) => ({
  activeElectionType,
  settings,
  hasActiveRun: Boolean(dataStore.getCurrentRun())
});

// The "Election for X Posts" banner (AppLayout.tsx, admin dashboard AND
// kiosk) is meant to show as soon as an election type is picked -- even
// before Open Poll, e.g. right after the wizard's first step -- and only go
// away once that selection is genuinely superseded (closeRecording nulls it
// out; poll/set-type overwrites it with a fresh value). The one case that
// needs correcting is activeElectionType values left over from before this
// field existed, which can never self-correct on their own: they carry no
// activeElectionTypeSetAt timestamp, because nothing ever stamped one. Any
// value stamped through the current set-type/startRecording code path always
// has a timestamp, so this only ever fires once per already-stale record,
// never for a real "just picked, not started yet" selection.
const healStaleElectionType = (): PollState => {
  const state = getPollState();
  if (state.activeElectionType && state.activeElectionTypeSetAt === undefined && !dataStore.getCurrentRun()) {
    return dataStore.updatePollState((s) => ({
      ...s,
      activeElectionType: null,
      activeElectionTypeSetAt: undefined
    }));
  }
  return state;
};

export const pollRouter = Router();

pollRouter.get(
  '/',
  asyncHandler((_req, res) => {
    res.json({ poll: sanitizePoll(healStaleElectionType()) });
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
      activeElectionTypeSetAt: Date.now(),
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
    // Only the Start wizard's last step (straight after /election-runs/start)
    // and "Re-start Polling" (shown only during an election) open voting.
    // The old standalone "Open Poll" button, which could open voting with no
    // named election behind it, is gone -- refuse that case here too, so
    // votes can never be cast outside an election's History entry and
    // Activity Log.
    if (!dataStore.getCurrentRun()) {
      throw new ForbiddenError('No election is in progress. Use "Start the Voting Process" on the Dashboard to open the poll.');
    }

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

// POST /reset ("Reset Poll") was removed along with its dashboard button.
// Votes reset only when Start the Voting Process begins a new election of
// that type (see runService.startRecording).
