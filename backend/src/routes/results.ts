import { Router } from 'express';
import { getResults, getTotalVotes } from '../services/resultsService.js';
import { isValidHouseId, isValidBranch } from '../config/posts.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { HouseId, Branch } from '../types/election.js';

export const resultsRouter = Router();

resultsRouter.get(
  '/',
  asyncHandler((req, res) => {
    // Optional house/branch parameters for filtering results -- omitted
    // (every caller today) returns everything, unchanged from before these
    // existed. See ROADMAP.md Phase 2 for when the frontend starts sending a
    // branch.
    const house = req.query.house as string | undefined;
    const houseId = house && isValidHouseId(house) ? house : undefined;
    const branchParam = req.query.branch as string | undefined;
    const branch = branchParam && isValidBranch(branchParam) ? branchParam : undefined;
    // Optional override of which election type to look at -- lets Manage
    // Candidates/Live Results check the OTHER type without switching the
    // app's actual active election. Omitted, this defaults to whatever's
    // currently active, same as before this parameter existed.
    const electionTypeParam = req.query.electionType as string | undefined;
    const electionType =
      electionTypeParam === 'school' || electionTypeParam === 'house' ? electionTypeParam : undefined;

    const results = getResults(houseId as HouseId | undefined, branch as Branch | undefined, electionType);
    // The authoritative ballot count for the whole active election,
    // regardless of the `house`/`branch` filters above -- see getTotalVotes.
    res.json({ results, totalVotes: getTotalVotes(branch as Branch | undefined, electionType) });
  })
);
