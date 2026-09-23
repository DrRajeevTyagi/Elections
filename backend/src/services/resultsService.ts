import { randomUUID } from 'crypto';
import { SCHOOL_POST_IDS, HOUSE_POST_IDS } from '../config/posts.js';
import { dataStore } from '../storage/datastore.js';
import { Candidate, PostId, StoredVote, ElectionType, HouseId, ElectionArchive, Branch } from '../types/election.js';
import { getPollState } from './voteService.js';

export interface CandidateResult {
  candidate: Candidate;
  total: number;
}

export interface PostResult {
  post: PostId;
  candidates: CandidateResult[];
}

const countVotes = (votes: StoredVote[], electionType: ElectionType, house?: HouseId, branch?: Branch): Map<string, number> => {
  const tally = new Map<string, number>();

  // Filter votes by election type and optionally house/branch
  const filteredVotes = votes.filter((vote) => {
    if (vote.electionType !== electionType) return false;
    if (house && vote.house !== house) return false;
    if (branch && vote.branch !== branch) return false;
    return true;
  });

  for (const vote of filteredVotes) {
    for (const [post, candidateId] of Object.entries(vote.selections)) {
      const key = post + ':' + candidateId;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  return tally;
};

// The one authoritative count of ballots cast for the active election --
// a straight count of vote records, not derived from summing candidate
// tallies. The admin dashboard used to compute "Total Votes" by summing
// every candidate's total across all posts and dividing by the number of
// posts (valid only because every ballot fills exactly one selection per
// post) -- that silently undercounts the moment any candidate who received
// votes is deleted, since a deleted candidate's selections drop out of the
// sum entirely. This is what both the live dashboard and the archived/
// report totals should use instead.
export const getTotalVotes = (branch?: Branch, electionType?: ElectionType): number => {
  const resolvedType = electionType ?? getPollState().activeElectionType;
  if (!resolvedType) {
    return 0;
  }
  return dataStore
    .getVotes()
    .filter((vote) => vote.electionType === resolvedType && (!branch || vote.branch === branch)).length;
};

// electionType defaults to whatever's currently active, but callers that
// need to look at the OTHER election type -- e.g. Manage Candidates/Live
// Results letting an admin check House while School is the one actually
// running -- can pass it explicitly instead of needing to switch the whole
// app's active type just to look.
export const getResults = (house?: HouseId, branch?: Branch, electionType?: ElectionType): PostResult[] => {
  const resolvedType = electionType ?? getPollState().activeElectionType;
  if (!resolvedType) {
    return []; // No active election, and no explicit type asked for
  }

  const votes = dataStore.getVotes();
  const tally = countVotes(votes, resolvedType, house, branch);

  // Filter candidates by election type and optionally house/branch
  let candidates = dataStore.getCandidates().filter((c) => c.electionType === resolvedType);
  if (house) {
    candidates = candidates.filter((c) => c.house === house);
  }
  if (branch) {
    candidates = candidates.filter((c) => c.branch === branch);
  }

  // Get post IDs based on election type
  const postIds = resolvedType === 'school' ? SCHOOL_POST_IDS : HOUSE_POST_IDS;

  return postIds.map((post) => {
    const postCandidates = candidates.filter((candidate) => candidate.post === post);
    const candidatesWithTotals = postCandidates.map((candidate) => ({
      candidate,
      total: tally.get(post + ':' + candidate.id) ?? 0
    }));

    return {
      post,
      candidates: candidatesWithTotals
    };
  });
};

// A full, unfiltered snapshot of the currently active election -- every
// house's candidates together, plus officer/station turnout -- used both for
// the "Download Report" button (live, not persisted) and to archive results
// automatically right before "Reset Poll" (or a Switch Election Type that
// clears an outgoing type's votes) clears the votes. `name` is the admin's
// own label for the archive, e.g. "School Council -- Term 1 2026" -- purely
// cosmetic, shown in Election History. Returns null when there's no active
// election type to snapshot.
export const buildElectionSnapshot = (name?: string): ElectionArchive | null => {
  const pollState = getPollState();
  const electionType = pollState.activeElectionType;
  if (!electionType) {
    return null;
  }

  const votes = dataStore.getVotes();
  const tally = countVotes(votes, electionType);
  const candidates = dataStore.getCandidates().filter((c) => c.electionType === electionType);

  const results = candidates.map((candidate) => ({
    candidateId: candidate.id,
    name: candidate.name,
    post: candidate.post,
    house: candidate.house,
    total: tally.get(candidate.post + ':' + candidate.id) ?? 0,
    branch: candidate.branch
  }));

  // Only this election's own codes -- previously every code (including the
  // other election type's, e.g. all 8 house codes showing up in a School
  // archive) was included, cluttering the archived turnout table with
  // entries that could never have cast a vote here.
  const officerCodes = dataStore
    .getOfficerCodes()
    .filter((entry) => entry.electionType === electionType)
    .map((entry) => ({
      code: entry.code,
      officerName: entry.officerName,
      voteCount: dataStore.countVotesByOfficerCode(entry.code),
      branch: entry.branch
    }));

  const totalVotes = getTotalVotes();

  return {
    id: randomUUID(),
    archivedAt: Date.now(),
    electionType,
    totalVotes,
    results,
    officerCodes,
    name: name?.trim() || undefined
  };
};

// Narrows a full (both-branches) snapshot/archive down to one branch, for
// the "Download Report" / Election History "view" flows -- the stored
// archive always covers both branches together (archiving itself is
// unchanged), this only affects what a given report *read* returns.
// `totalVotes` is recomputed from the filtered results (summing per-post
// totals) rather than re-querying live votes, so this works identically for
// a live snapshot and a long-closed archive whose votes are long gone.
export const filterArchiveByBranch = (archive: ElectionArchive, branch: Branch): ElectionArchive => {
  const results = archive.results.filter((entry) => (entry.branch ?? 'dwarka') === branch);
  const officerCodes = archive.officerCodes.filter((entry) => (entry.branch ?? 'dwarka') === branch);
  return {
    ...archive,
    results,
    officerCodes,
    totalVotes: results.reduce((sum, entry) => sum + entry.total, 0),
    branch
  };
};

// True when the currently active election's live votes are already fully
// captured by its most recent archive -- e.g. it was saved via "Save to
// Election History" (or an earlier Reset/Switch) and nothing has changed
// since. Used to stop Reset Poll and Switch Election Type from silently
// creating a second, near-identical archive for data that's already safely
// recorded.
export const isCurrentElectionAlreadyArchived = (): boolean => {
  const pollState = getPollState();
  const electionType = pollState.activeElectionType;
  if (!electionType) {
    return false;
  }

  const votes = dataStore.getVotes().filter((vote) => vote.electionType === electionType);
  const mostRecent = dataStore
    .getArchives()
    .filter((archive) => archive.electionType === electionType)
    .sort((a, b) => b.archivedAt - a.archivedAt)[0];

  if (!mostRecent || mostRecent.totalVotes !== votes.length) {
    return false;
  }
  // Covered as long as nothing was cast after that archive was taken --
  // if a vote came in since (e.g. the poll was reopened after a checkpoint
  // save), this election needs archiving again to capture it.
  return votes.every((vote) => vote.timestamp <= mostRecent.archivedAt);
};

// Archives the currently active election as a side effect of Reset Poll or
// Switch Election Type clearing its votes -- unless it's already been
// saved and nothing has changed (see isCurrentElectionAlreadyArchived),
// in which case this just relabels that existing archive with `name` (if
// one was given) instead of creating a duplicate.
export const archiveCurrentElection = (name?: string): void => {
  if (isCurrentElectionAlreadyArchived()) {
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return;
    }
    const electionType = getPollState().activeElectionType;
    const mostRecent = dataStore
      .getArchives()
      .filter((archive) => archive.electionType === electionType)
      .sort((a, b) => b.archivedAt - a.archivedAt)[0];
    if (mostRecent) {
      dataStore.renameArchive(mostRecent.id, trimmedName);
    }
    return;
  }

  const snapshot = buildElectionSnapshot(name);
  if (snapshot) {
    dataStore.addArchive(snapshot);
  }
};
