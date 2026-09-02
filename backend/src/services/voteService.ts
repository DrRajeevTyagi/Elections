import { dataStore } from '../storage/datastore.js';
import { PollState, StoredVote, ElectionType, HouseId } from '../types/election.js';
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

export const recordVote = (selections: StoredVote['selections'], electionType: ElectionType, house?: HouseId): StoredVote => {
  ensurePollIsOpen();
  return dataStore.addVote(selections, electionType, house);
};
