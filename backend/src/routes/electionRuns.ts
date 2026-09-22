import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError, NotFoundError } from '../utils/httpError.js';
import { startRecording, closeRecording } from '../services/runService.js';

export const electionRunsRouter = Router();

electionRunsRouter.use(requireAdminSession);

// The currently active run, if any -- drives the "Recording" banner and
// gates officer-code generation on the frontend.
electionRunsRouter.get(
  '/current',
  asyncHandler((_req, res) => {
    res.json({ run: dataStore.getCurrentRun() ?? null });
  })
);

// Every run, most recent first -- powers a future "Past Runs" list; for now
// just backs the Activity Log tab's run picker.
electionRunsRouter.get(
  '/',
  asyncHandler((_req, res) => {
    res.json({ runs: dataStore.getRuns() });
  })
);

electionRunsRouter.get(
  '/:id/log',
  asyncHandler((req, res) => {
    const run = dataStore.getRun(req.params.id);
    if (!run) {
      throw new NotFoundError('Election run not found');
    }
    res.json({ run, entries: dataStore.getLogEntries(run.id) });
  })
);

electionRunsRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const { electionType, name } = req.body as { electionType?: string; name?: string };
    if (electionType !== 'school' && electionType !== 'house') {
      throw new BadRequestError('Invalid election type. Must be "school" or "house"');
    }
    if (typeof name !== 'string') {
      throw new BadRequestError('Enter a name for this election run');
    }
    const clientId = req.header('x-admin-client-id');
    const run = await startRecording(electionType, name, clientId);
    res.status(201).json({ run });
  })
);

electionRunsRouter.post(
  '/close',
  asyncHandler(async (req, res) => {
    const clientId = req.header('x-admin-client-id');
    const run = await closeRecording(clientId);
    res.json({ run });
  })
);
