import { dataStore } from '../storage/datastore.js';
import { PollState, StoredVote, ElectionType, HouseId, Branch } from '../types/election.js';
import { ForbiddenError } from '../utils/httpError.js';

export const getPollState = (): PollState => dataStore.getPollState();

export const ensurePollIsOpen = (): PollState => {
  const pollState = getPollState();
  if (!pollState.settings.isOpen) {
    throw new ForbiddenError('Voting is currently closed. Please contact the election administrator.');
  }
  if (!pollState.activeElectionType) {
    throw new ForbiddenError('No election has been set up yet. Please contact the election administrator.');
  }
  return pollState;
};

export const recordVote = async (
  selections: StoredVote['selections'],
  electionType: ElectionType,
  house?: HouseId,
  officerCode?: string,
  branch?: Branch
): Promise<StoredVote> => {
  ensurePollIsOpen();
  // dataStore.addVote's branch parameter defaults to 'dwarka' when passed
  // undefined (a plain default parameter, not a truthiness check), so it's
  // safe to always forward it here even when the caller didn't have one.
  return dataStore.addVote(selections, electionType, house, officerCode, branch);
};
