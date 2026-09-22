import { Router } from 'express';
import { adminRouter } from './admin.js';
import { candidatesRouter } from './candidates.js';
import { electionRunsRouter } from './electionRuns.js';
import { healthRouter } from './health.js';
import { kioskRouter } from './kiosk.js';
import { officerCodesRouter } from './officerCodes.js';
import { pollRouter } from './poll.js';
import { postsRouter } from './posts.js';
import { reportRouter } from './report.js';
import { resultsRouter } from './results.js';
import { votesRouter } from './votes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/votes', votesRouter);
apiRouter.use('/results', resultsRouter);
apiRouter.use('/poll', pollRouter);
apiRouter.use('/kiosk', kioskRouter);
apiRouter.use('/candidates', candidatesRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/officer-codes', officerCodesRouter);
apiRouter.use('/report', reportRouter);
apiRouter.use('/election-runs', electionRunsRouter);
