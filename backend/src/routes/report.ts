import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { buildElectionSnapshot } from '../services/resultsService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, NotFoundError } from '../utils/httpError.js';

export const reportRouter = Router();

reportRouter.use(requireAdminSession);

// Live snapshot of the currently active election -- not persisted. Powers
// "Download Report" at any time, independent of Reset Poll.
reportRouter.get(
  '/current',
  asyncHandler((_req, res) => {
    const snapshot = buildElectionSnapshot();
    res.json({ report: snapshot });
  })
);

// Saves a checkpoint of the CURRENT results to Election History without
// touching any votes -- unlike Reset Poll / Switch Election Type (which
// only archive as a side effect of clearing votes), this lets the admin
// file a permanent record the moment they consider an election done, e.g.
// right after Close Poll, without needing to also wipe the live data.
reportRouter.post(
  '/archives',
  asyncHandler((req, res) => {
    const { name } = req.body as { name?: string };
    const snapshot = buildElectionSnapshot(name);
    if (!snapshot) {
      throw new BadRequestError('No election is currently set up, so there is nothing to save yet.');
    }
    dataStore.addArchive(snapshot);
    res.status(201).json({ report: snapshot });
  })
);

// Lightweight list for the "Election History" panel.
reportRouter.get(
  '/archives',
  asyncHandler((_req, res) => {
    const archives = dataStore.getArchives().map(({ id, archivedAt, electionType, totalVotes, name }) => ({
      id,
      archivedAt,
      electionType,
      totalVotes,
      name
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

// Lets the admin add or fix a label after the fact -- e.g. for an archive
// created before naming was added, or a typo.
reportRouter.put(
  '/archives/:id',
  asyncHandler((req, res) => {
    const { name } = req.body as { name?: string };
    if (typeof name !== 'string') {
      throw new BadRequestError('Name is required');
    }
    const updated = dataStore.renameArchive(req.params.id, name);
    if (!updated) {
      throw new NotFoundError('Archived report not found');
    }
    res.json({ report: updated });
  })
);

// Permanently removes one archived snapshot -- e.g. to clear out test/junk
// entries left behind by a teacher testing round before real polling day.
reportRouter.delete(
  '/archives/:id',
  asyncHandler((req, res) => {
    const deleted = dataStore.deleteArchive(req.params.id);
    if (!deleted) {
      throw new NotFoundError('Archived report not found');
    }
    res.status(204).send();
  })
);
