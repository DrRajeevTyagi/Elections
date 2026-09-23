import { dataStore } from '../storage/datastore.js';
import { getPollState } from './voteService.js';
import { archiveCurrentElection } from './resultsService.js';
import { kioskService } from './kioskService.js';
import { logAction, resolveActor } from './auditLogService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import type { ElectionRun, ElectionType } from '../types/election.js';

// "Start the Voting Process" (ELECTION-INTEGRITY-AND-TRUST.md item 11):
// one action, atomically --
//   1. brings Poll Controls' election type into step with the run (reusing
//      the same outgoing-type archive/clear safety net routes/poll.ts's own
//      /set-type already applies, for the edge case of stray unarchived
//      votes sitting in the *other* type when this run starts),
//   2. resets votes to zero for this run's type, across both branches (a
//      safety net -- guarantees a genuinely fresh start even if the
//      previous run of this type was ended via the older Reset Poll button
//      instead of Close Recording, which also resets),
//   3. carries forward any officer codes already generated for this type
//      as prep work (they are NOT wiped here or at Close -- see
//      officerCodes.ts, code generation no longer requires an active run),
//      tagging them with the new run and reopening any booth left closed
//      from the previous election of this type,
//   4. creates the run record and begins the action log window.
// Deliberately NOT branch-scoped -- one run always covers both branches
// together, matching the already-locked decision that Open Poll itself is
// shared. Only one run may be 'running' at a time.
export const startRecording = async (
  electionType: ElectionType,
  name: string,
  clientId: string | undefined
): Promise<ElectionRun> => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new BadRequestError('Enter a name for this election run, e.g. "School Elections -- Term 1 2026"');
  }

  const current = dataStore.getCurrentRun();
  if (current) {
    throw new ConflictError(
      `A recording is already active: "${current.name}" (started ${new Date(current.startedAt).toLocaleString()}). Close it before starting a new one.`,
      'RUN_ALREADY_ACTIVE'
    );
  }

  const pollState = getPollState();
  if (pollState.activeElectionType && pollState.activeElectionType !== electionType) {
    const outgoingVotes = dataStore.getVotes().filter((vote) => vote.electionType === pollState.activeElectionType);
    if (outgoingVotes.length > 0) {
      archiveCurrentElection();
      dataStore.resetVotesByType(pollState.activeElectionType);
    }
  }
  kioskService.clearSessions();
  dataStore.updatePollState((state) => ({
    ...state,
    activeElectionType: electionType,
    activeElectionTypeSetAt: Date.now(),
    settings: { ...state.settings, isOpen: false }
  }));

  const votesCleared = dataStore.getVotes().filter((vote) => vote.electionType === electionType).length;
  dataStore.resetVotesByType(electionType);
  // Officer codes (and their officer-name allotments) are prep work that
  // carries forward from election to election, same as candidates -- never
  // wiped here or at Close. The only thing reset is "this booth is closed,"
  // so a code left closed at the end of the previous election of this type
  // isn't still unusable for this new one.
  const codesCarriedOver = dataStore.getOfficerCodes().filter((entry) => entry.electionType === electionType).length;
  dataStore.reopenOfficerCodesByType(electionType);

  const actor = resolveActor(clientId);
  const run = await dataStore.startRun(electionType, trimmedName, actor);
  dataStore.stampOfficerCodesRunId(electionType, run.id);
  // Logged after startRun so this entry (and everything after it) is
  // correctly tagged with the run that was just created -- logAction reads
  // whatever dataStore.getCurrentRun() returns at the moment it's called.
  await logAction(clientId, 'run.start', { electionType, name: trimmedName, votesCleared, codesCarriedOver });
  return run;
};

// "Close Recording" -- a new, separate action from the older Reset Poll
// button (decided 2026-09-23: Reset Poll stays exactly as-is, zero behavior
// change, for ad-hoc corrections with no run active). Archives the final
// results under the run's own name, resets votes for this run's type back to
// zero, closes the poll, and seals the run + its action log. Deliberately
// does NOT wipe officer codes any more (reversed 2026-09-23, same day as the
// original "wipe at close" decision -- it turned out to erase a real
// election's worth of code-to-teacher allotments the moment it closed,
// contradicting "codes are prep work, same as candidates": a candidate
// isn't deleted just because the election closed, and a code's allotment
// shouldn't be either). See startRecording's reopenOfficerCodesByType call
// for how a booth closed in the previous election becomes usable again for
// the next one, without needing to regenerate or re-allot anything.
export const closeRecording = async (clientId: string | undefined): Promise<ElectionRun> => {
  const run = dataStore.getCurrentRun();
  if (!run) {
    throw new BadRequestError('No recording is currently active.');
  }

  const totalVotes = dataStore.getVotes().filter((vote) => vote.electionType === run.electionType).length;

  archiveCurrentElection(run.name);
  const archive = dataStore
    .getArchives()
    .filter((entry) => entry.electionType === run.electionType)
    .sort((a, b) => b.archivedAt - a.archivedAt)[0];

  kioskService.clearSessions();
  dataStore.resetVotesByType(run.electionType);
  // Also clears activeElectionType back to null -- without this it stays
  // set to whatever type just closed, indefinitely, so the admin/kiosk
  // "Election for X Posts" banner (AppLayout.tsx) would keep announcing a
  // type that's no longer selected until the next election is started.
  dataStore.updatePollState((state) => ({
    ...state,
    activeElectionType: null,
    activeElectionTypeSetAt: undefined,
    settings: { ...state.settings, isOpen: false }
  }));

  const actor = resolveActor(clientId);
  // Logged before closeRun below -- logAction's "is a run active" check
  // must still see this run as running, or the closing entry itself would
  // never get written.
  await logAction(clientId, 'run.close', { archiveId: archive?.id, totalVotes });
  const closed = await dataStore.closeRun(run.id, actor, archive ? [archive.id] : []);
  return closed!;
};
