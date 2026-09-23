import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { buildElectionSnapshot, buildCurrentOrLastResultsSnapshot, filterArchiveByBranch } from '../services/resultsService.js';
import { logAction } from '../services/auditLogService.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, NotFoundError } from '../utils/httpError.js';
import { isValidBranch } from '../config/posts.js';
import type { Branch } from '../types/election.js';

export const reportRouter = Router();

reportRouter.use(requireAdminSession);

// Shared by both report-reading routes below -- validates the optional
// `?branch=` query param used to narrow a combined (both-branches) report
// down to just Dwarka or just AN. Download Report and Election History's
// "view" used to always show both branches merged together, with no way
// to print one branch's results on their own.
const parseBranchParam = (req: { query: unknown }): Branch | undefined => {
  const { branch } = req.query as { branch?: string };
  if (branch === undefined) {
    return undefined;
  }
  if (!isValidBranch(branch)) {
    throw new BadRequestError('Invalid branch');
  }
  return branch;
};

// The current status at any time: a live, unpersisted snapshot while an
// election is running, or the most recently archived election once it's
// closed (activeElectionType/live votes are gone by then -- see
// buildCurrentOrLastResultsSnapshot). Powers "Download Report" both during
// and after an election, independent of Reset Poll.
reportRouter.get(
  '/current',
  asyncHandler((req, res) => {
    const branch = parseBranchParam(req);
    const snapshot = buildCurrentOrLastResultsSnapshot();
    const report = snapshot && branch ? filterArchiveByBranch(snapshot, branch) : snapshot;
    res.json({ report });
  })
);

// Saves a checkpoint of the CURRENT results to Election History without
// touching any votes -- unlike Reset Poll / Switch Election Type (which
// only archive as a side effect of clearing votes), this lets the admin
// file a permanent record the moment they consider an election done, e.g.
// right after Close Poll, without needing to also wipe the live data.
reportRouter.post(
  '/archives',
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    const snapshot = buildElectionSnapshot(name);
    if (!snapshot) {
      throw new BadRequestError('No election is currently set up, so there is nothing to save yet.');
    }
    dataStore.addArchive(snapshot);
    await logAction(req.header('x-admin-client-id'), 'archive.create', { archiveId: snapshot.id, name: snapshot.name });
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
    const branch = parseBranchParam(req);
    const archive = dataStore.getArchive(req.params.id);
    if (!archive) {
      throw new NotFoundError('Archived report not found');
    }
    res.json({ report: branch ? filterArchiveByBranch(archive, branch) : archive });
  })
);

// Lets the admin add or fix a label after the fact -- e.g. for an archive
// created before naming was added, or a typo.
reportRouter.put(
  '/archives/:id',
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    if (typeof name !== 'string') {
      throw new BadRequestError('Name is required');
    }
    const updated = dataStore.renameArchive(req.params.id, name);
    if (!updated) {
      throw new NotFoundError('Archived report not found');
    }
    await logAction(req.header('x-admin-client-id'), 'archive.rename', { archiveId: updated.id, name: updated.name });
    res.json({ report: updated });
  })
);

// Permanently removes one archived snapshot -- e.g. to clear out test/junk
// entries left behind by a teacher testing round before real polling day.
reportRouter.delete(
  '/archives/:id',
  asyncHandler(async (req, res) => {
    const deleted = dataStore.deleteArchive(req.params.id);
    if (!deleted) {
      throw new NotFoundError('Archived report not found');
    }
    await logAction(req.header('x-admin-client-id'), 'archive.delete', { archiveId: req.params.id });
    res.status(204).send();
  })
);
