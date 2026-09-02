import { Router } from 'express';
import { requireAdminSecret } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/httpError.js';

export const officerCodesRouter = Router();

officerCodesRouter.use(requireAdminSecret);

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
    const { count } = req.body as { count?: number };
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 200) {
      throw new BadRequestError('Enter a number of codes between 1 and 200');
    }
    const codes = dataStore.generateOfficerCodes(parsedCount);
    res.status(201).json({ codes });
  })
);

officerCodesRouter.put(
  '/:code',
  asyncHandler((req, res) => {
    const { code } = req.params;
    const { officerName, label } = req.body as { officerName?: string; label?: string };
    const updated = dataStore.updateOfficerCode(code.toUpperCase(), {
      officerName: typeof officerName === 'string' ? officerName.trim() : undefined,
      label: typeof label === 'string' ? label.trim() : undefined
    });
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
