import { Router } from 'express';
import { requireAdminSecret } from '../middleware/adminAuth.js';
import { kioskService } from '../services/kioskService.js';
import { getPollState } from '../services/voteService.js';
import { buildElectionSnapshot } from '../services/resultsService.js';
import { findMissingCandidateCoverage } from '../services/candidateService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/httpError.js';
import type { PollState, ElectionType } from '../types/election.js';

const sanitizePoll = ({ activeElectionType, settings }: PollState) => ({ activeElectionType, settings });

export const pollRouter = Router();

pollRouter.get(
  '/',
  asyncHandler((_req, res) => {
    res.json({ poll: sanitizePoll(getPollState()) });
  })
);

pollRouter.post(
  '/set-type',
  requireAdminSecret,
  asyncHandler((req, res) => {
    const { electionType } = req.body as { electionType?: string };
    
    if (electionType !== 'school' && electionType !== 'house') {
      throw new BadRequestError('Invalid election type. Must be "school" or "house"');
    }

    const currentState = getPollState();
    const outgoingType = currentState.activeElectionType;

    // Switching away from a type that still has uncounted votes would
    // otherwise leave them sitting in the store, invisible until the admin
    // switches back -- at which point they'd silently reappear in results.
    // Archive and clear them now, same as Reset Poll does.
    if (outgoingType && outgoingType !== electionType) {
      const outgoingVotes = dataStore.getVotes().filter((vote) => vote.electionType === outgoingType);
      if (outgoingVotes.length > 0) {
        const snapshot = buildElectionSnapshot();
        if (snapshot) {
          dataStore.addArchive(snapshot);
        }
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

    res.json({ poll: sanitizePoll(poll) });
  })
);

pollRouter.post(
  '/open',
  requireAdminSecret,
  asyncHandler((_req, res) => {
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

    res.json({ poll: sanitizePoll(poll) });
  })
);

pollRouter.post(
  '/close',
  requireAdminSecret,
  asyncHandler((_req, res) => {
    kioskService.clearSessions();
    const poll = dataStore.updatePollState((state) => ({
      ...state,
      activeElectionType: state.activeElectionType, // Preserve
      settings: {
        ...state.settings,
        isOpen: false
      }
    }));

    res.json({ poll: sanitizePoll(poll) });
  })
);

pollRouter.post(
  '/reset',
  requireAdminSecret,
  asyncHandler((_req, res) => {
    // Snapshot the current election's results before wiping votes, so a
    // record survives the reset -- see GET /api/report/archives.
    const snapshot = buildElectionSnapshot();
    if (snapshot) {
      dataStore.addArchive(snapshot);
    }

    kioskService.clearSessions();
    dataStore.resetVotes();
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
