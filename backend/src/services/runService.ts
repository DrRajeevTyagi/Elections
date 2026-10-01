import { dataStore } from '../storage/datastore.js';
import { getPollState } from './voteService.js';
import { archiveCurrentElection } from './resultsService.js';
import { kioskService } from './kioskService.js';
import { logAction, resolveActor } from './auditLogService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import type { ElectionRun, ElectionType, OfficerCode } from '../types/election.js';

// "Start the Voting Process" (ELECTION-INTEGRITY-AND-TRUST.md item 11):
// one action, atomically --
//   1. brings Poll Controls' election type into step with the run (reusing
//      the same outgoing-type archive/clear safety net routes/poll.ts's own
//      /set-type already applies, for the edge case of stray unarchived
//      votes sitting in the *other* type when this run starts),
//   2. resets votes to zero for this run's type, across both branches --
//      this is now the ONLY place votes reset (reversed 2026-09-24, see
//      closeRecording below), so it doubles as the safety net that
//      guarantees a genuinely fresh start regardless of how the previous
//      election of this type ended: a proper End of Voting (which leaves the
//      final tally in place, on purpose) or the ad-hoc Reset Poll button,
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
// results under the run's own name, closes the poll, and seals the run +
// its action log.
//
// Deliberately does NOT reset votes any more (reversed 2026-09-24, by direct
// request -- a school's House/School election runs once a year; there is no
// reason the live vote count needs to go blank the moment voting ends, and
// every reason it shouldn't: the final tally is genuinely useful to leave on
// screen -- Live Results, the Dashboard's own total, each officer code's
// turnout -- for as long as nobody has started a new election of that type.
// It only needs to reset once a *new* election of that type is genuinely
// under way, which startRecording's own reset already guarantees on its own
// (see above) -- so removing the reset here costs nothing and matches how
// candidates and officer codes already work: nothing about this election's
// data is cleared just because the election ended, only when a fresh one is
// deliberately started. Also does NOT wipe officer codes (reversed
// 2026-09-23, same day as the original "wipe at close" decision -- it turned
// out to erase a real election's worth of code-to-teacher allotments the
// moment it closed, contradicting "codes are prep work, same as
// candidates": a candidate isn't deleted just because the election closed,
// and a code's allotment shouldn't be either). See startRecording's
// reopenOfficerCodesByType call for how a booth closed in the previous
// election becomes usable again for the next one, without needing to
// regenerate or re-allot anything.
export interface EndOfVotingBlockers {
  unallotted: OfficerCode[]; // never named -- must be deleted
  open: OfficerCode[]; // named, still polling -- must be closed, then sealed
  unsealed: OfficerCode[]; // closed, not yet verified against the Paper List
}

// What still stands between this election and End of Voting. A re-polled
// code doesn't count: it is already dead for good, and its fresh code is
// held to the same rule as every other.
export const endOfVotingBlockers = (electionType: ElectionType): EndOfVotingBlockers => {
  const codes = dataStore.getOfficerCodes().filter((entry) => entry.electionType === electionType && !entry.repoll);
  return {
    unallotted: codes.filter((entry) => !entry.officerName.trim()),
    open: codes.filter((entry) => entry.officerName.trim() && !entry.closedAt),
    unsealed: codes.filter((entry) => entry.officerName.trim() && entry.closedAt && !entry.seal)
  };
};

const listCodes = (codes: OfficerCode[]): string => {
  const shown = codes
    .slice(0, 10)
    .map((entry) => `${entry.code}${entry.officerName.trim() ? ` (${entry.officerName.trim()})` : ''}`)
    .join(', ');
  return codes.length > 10 ? `${shown} and ${codes.length - 10} more` : shown;
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

export const describeEndOfVotingBlockers = ({ unallotted, open, unsealed }: EndOfVotingBlockers): string => {
  const steps: string[] = [];
  if (unallotted.length > 0) {
    steps.push(`delete ${plural(unallotted.length, 'unallotted code')} (${listCodes(unallotted)})`);
  }
  if (open.length > 0) {
    steps.push(`close ${plural(open.length, 'booth')} that ${open.length === 1 ? 'is' : 'are'} still polling, then Verify & Seal ${open.length === 1 ? 'it' : 'them'} (${listCodes(open)})`);
  }
  if (unsealed.length > 0) {
    steps.push(`Verify & Seal ${plural(unsealed.length, 'closed booth')} (${listCodes(unsealed)})`);
  }
  return (
    `The election can't be closed yet. Every code must be either deleted, or closed and verified & sealed. Still to do: ${steps.join('; ')}. ` +
    'All of this is on the Polling Officer Codes tab (Dwarka and AN).'
  );
};

export const closeRecording = async (clientId: string | undefined): Promise<ElectionRun> => {
  const run = dataStore.getCurrentRun();
  if (!run) {
    throw new BadRequestError('No recording is currently active.');
  }

  // One rule, decided 2026-10-01 so it is easy to remember and explain:
  // every code of this election (both branches) must either no longer
  // exist, or be closed AND verified against its Paper List and sealed --
  // including a booth that cast no votes (sealed with a Paper List of 0).
  // This also means End of Voting can't be pressed by mistake while any
  // booth is still polling, which matters because a closed election can't
  // be reopened. See endOfVotingBlockers.
  const blockers = endOfVotingBlockers(run.electionType);
  if (blockers.unallotted.length + blockers.open.length + blockers.unsealed.length > 0) {
    throw new ConflictError(describeEndOfVotingBlockers(blockers), 'BOOTHS_NOT_READY', {
      unallottedCodes: blockers.unallotted.map((entry) => entry.code),
      openCodes: blockers.open.map((entry) => entry.code),
      unsealedCodes: blockers.unsealed.map((entry) => entry.code)
    });
  }

  const totalVotes = dataStore.getCountedVotes().filter((vote) => vote.electionType === run.electionType).length;

  archiveCurrentElection(run.name);
  const archive = dataStore
    .getArchives()
    .filter((entry) => entry.electionType === run.electionType)
    .sort((a, b) => b.archivedAt - a.archivedAt)[0];

  kioskService.clearSessions();
  // Every booth of this election is now "duty over" (red on the Officer
  // Codes tab) and can't activate a ballot, until "Start Allotting Duties
  // for a Fresh Election" or the next Start of this type reopens it.
  dataStore.closeOfficerCodesByType(run.electionType);
  // Clears activeElectionType back to null -- without this it stays set to
  // whatever type just closed, indefinitely, so the admin/kiosk "Election
  // for X Posts" banner (AppLayout.tsx) would keep announcing a type that's
  // no longer selected until the next election is started. This alone is
  // enough to make Download Report and buildElectionSnapshot correctly
  // treat this as "no live election" and fall back to the archive just
  // saved above -- it does NOT depend on the votes themselves being wiped
  // (they aren't, see this function's own comment above).
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
