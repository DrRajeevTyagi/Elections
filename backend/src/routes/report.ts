import { Router } from 'express';
import { requireAdminSecret } from '../middleware/adminAuth.js';
import { buildElectionSnapshot } from '../services/resultsService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError } from '../utils/httpError.js';

export const reportRouter = Router();

reportRouter.use(requireAdminSecret);

// Live snapshot of the currently active election -- not persisted. Powers
// "Download Report" at any time, independent of Reset Poll.
reportRouter.get(
  '/current',
  asyncHandler((_req, res) => {
    const snapshot = buildElectionSnapshot();
    res.json({ report: snapshot });
  })
);

// Lightweight list for the "Election History" panel.
reportRouter.get(
  '/archives',
  asyncHandler((_req, res) => {
    const archives = dataStore.getArchives().map(({ id, archivedAt, electionType, totalVotes }) => ({
      id,
      archivedAt,
      electionType,
      totalVotes
    }));
    res.json({ archives });
  })
);

// One full archived snapshot, taken automatically right before a past Reset.
reportRouter.get(
  '/archives/:id',
  asyncHandler((req, res) => {
    const archive = dataStore.getArchive(req.params.id);
    if (!archive) {
      throw new NotFoundError('Archived report not found');
    }
    res.json({ report: archive });
  })
);
