import { Router } from 'express';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import type { LogSearchFilter } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/httpError.js';
import { startRecording, closeRecording } from '../services/runService.js';
import { isValidBranch } from '../config/posts.js';

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

// The "Ask your data" search: filters the permanent action log across any
// run (or a specific one), by election type, branch, actor, action, or a
// code -- e.g. "who were the polling officers for AN House Elections" (all
// officerCode.name entries, branch=AN, electionType=house), "what happened
// under code abc123" (code=abc123), "what did the admin account do for this
// run" (runId=..., adminOnly=true). See datastore.ts's searchLogEntries for
// the exact filter semantics. Also serves the Activity Log tab's "click an
// election's name" view (filtered by runId) -- the separate GET /:id/log
// route that did the same was never called by the app and was removed.
electionRunsRouter.get(
  '/log/search',
  asyncHandler((req, res) => {
    const { runId, electionType, branch, actor, action, code, adminOnly } = req.query as Record<string, string | undefined>;

    if (electionType !== undefined && electionType !== 'school' && electionType !== 'house') {
      throw new BadRequestError('Invalid election type. Must be "school" or "house"');
    }
    if (branch !== undefined && !isValidBranch(branch)) {
      throw new BadRequestError('Invalid branch');
    }

    const filter: LogSearchFilter = {
      runId: runId || undefined,
      electionType: electionType === 'school' || electionType === 'house' ? electionType : undefined,
      branch: branch && isValidBranch(branch) ? branch : undefined,
      actor: actor || undefined,
      action: action || undefined,
      code: code || undefined,
      adminOnly: adminOnly === 'true'
    };

    res.json({ entries: dataStore.searchLogEntries(filter) });
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
