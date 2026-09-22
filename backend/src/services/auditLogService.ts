import { dataStore } from '../storage/datastore.js';
import { adminSessionService } from './adminSessionService.js';
import type { Branch } from '../types/election.js';

// Resolves the human-readable identity for a logged action -- the
// human-entered label captured at login/takeover (adminSessionService), or
// the raw client id if none was given, or 'unknown' if there's no client id
// at all (e.g. a polling officer's own self-service action, which has no
// admin session). See ELECTION-INTEGRITY-AND-TRUST.md items 1/7 for why this
// can't yet be a verified individual identity.
export const resolveActor = (clientId: string | undefined): string => {
  if (!clientId) {
    return 'unknown';
  }
  return adminSessionService.getLabel(clientId) ?? clientId;
};

// Logs one action under the currently active election run -- a no-op if no
// run is active, which is the entire point (ELECTION-INTEGRITY-AND-TRUST.md
// item 11): nothing is logged before "Start Recording." Every admin route
// that performs a listed action (see item 5's list) calls this after the
// action succeeds, passing whatever client id it has and a small
// JSON-serializable details payload.
//
// `electionType` is stamped automatically from the active run (a run always
// has exactly one) -- callers never need to pass it. `branch` is optional
// and only meaningful for actions actually scoped to one branch (officer
// code actions); pass it when the caller has one, e.g. from the OfficerCode
// record being acted on. This is what makes the log searchable/filterable
// (routes/electionRuns.ts GET /election-runs/log/search) without needing to
// know which actions happen to carry which detail keys.
export const logAction = async (
  clientId: string | undefined,
  action: string,
  details?: Record<string, unknown>,
  branch?: Branch
): Promise<void> => {
  const run = dataStore.getCurrentRun();
  if (!run) {
    return;
  }
  await dataStore.appendLogEntry({
    runId: run.id,
    actor: resolveActor(clientId),
    action,
    details,
    electionType: run.electionType,
    branch
  });
};
