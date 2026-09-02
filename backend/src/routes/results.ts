import { Router } from 'express';
import { getResults } from '../services/resultsService.js';
import { isValidHouseId } from '../config/posts.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { HouseId } from '../types/election.js';

export const resultsRouter = Router();

resultsRouter.get(
  '/',
  asyncHandler((req, res) => {
    // Optional house parameter for filtering house election results
    const house = req.query.house as string | undefined;
    const houseId = house && isValidHouseId(house) ? house : undefined;
    
    const results = getResults(houseId as HouseId | undefined);
    res.json({ results });
  })
);
