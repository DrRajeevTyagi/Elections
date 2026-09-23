import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  closePoll,
  getPollStatus,
  getResults,
  openPoll,
  resetPoll,
  updateCandidate,
  deleteCandidate,
  addCandidate,
  verifyAdminSecret,
  getOfficerCodes,
  generateOfficerCodes,
  updateOfficerCode,
  deleteOfficerCode,
  reopenOfficerCode,
  getArchivesList,
  getStorageHealth,
  renameArchive,
  deleteArchive,
  logoutAdmin,
  setAdminSessionLostHandler,
  saveElectionToHistory,
  getCurrentRun,
  getRuns,
  searchRunLog,
  closeRecording
} from '../services/api';
import type {
  PollStatus,
  PostResult,
  CandidateResult,
  OfficerCode,
  ArchiveSummary,
  StorageHealth,
  ElectionRun,
  LogEntry
} from '../types/api';
import type { PostId, ElectionType, HouseId, SchoolPostId, Branch } from '../types/election';
import { AddCandidateForm } from '../components/AddCandidateForm';
import { CandidateEditor } from '../components/CandidateEditor';
import { StartElectionWizard } from '../components/StartElectionWizard';
import { BulkAllotCodesModal } from '../components/BulkAllotCodesModal';
import { HOUSE_IDS, HOUSE_POST_IDS } from '../constants/houses';
import { POST_NAMES } from '../constants/posts';
import { POST_COLORS } from '../constants/postColors';
import { HOUSE_COLORS } from '../constants/houseColors';
import { groupOfficerCodesByHouse } from '../utils/officerCodeGroups';
import './Page.css';
import './admin.css';

// en-GB gives dd/mm/yyyy (and a 24-hour clock) instead of the US
// month/day/year ordering the browser's default locale would otherwise use.
const formatTimestamp = (timestamp: number): string => new Date(timestamp).toLocaleString('en-GB');

// Helper to group results by house for house elections
interface HouseGroupedResult {
  house: HouseId;
  posts: PostResult[];
}

const groupResultsByHouse = (results: PostResult[]): HouseGroupedResult[] => {
  const houseMap = new Map<HouseId, PostResult[]>();
  
  // Initialize all houses
  HOUSE_IDS.forEach(house => {
    houseMap.set(house, []);
  });
  
  // Group results by house
  results.forEach(postResult => {
    postResult.candidates.forEach(candidateResult => {
      const house = candidateResult.candidate.house;
      if (house) {
        if (!houseMap.has(house)) {
          houseMap.set(house, []);
        }
        const housePosts = houseMap.get(house)!;
        
        // Find or create post entry for this house
        let postEntry = housePosts.find(p => p.post === postResult.post);
        if (!postEntry) {
          postEntry = { post: postResult.post, candidates: [] };
          housePosts.push(postEntry);
        }
        
        // Add candidate to the post entry
        postEntry.candidates.push(candidateResult);
      }
    });
  });
  
  // Sort posts within each house (HC, HCC, HSC)
  houseMap.forEach(posts => {
    posts.sort((a, b) => {
      const aIndex = HOUSE_POST_IDS.indexOf(a.post);
      const bIndex = HOUSE_POST_IDS.indexOf(b.post);
      return aIndex - bIndex;
    });
  });
  
  // Convert to array and sort by house order
  return HOUSE_IDS.map(house => ({
    house,
    posts: houseMap.get(house) || []
  }));
};

export const AdminLandingPage = (): JSX.Element => {
  const [adminSecret, setAdminSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionConflict, setSessionConflict] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [results, setResults] = useState<PostResult[]>([]);
  // The server's authoritative ballot count for the active election -- see
  // getTotalVotes on the backend. Deliberately NOT derived from `results`
  // (summing candidate totals) here, since that silently undercounts once
  // any candidate who received votes is deleted.
  const [totalVotes, setTotalVotes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [officerCodes, setOfficerCodes] = useState<OfficerCode[]>([]);
  const [houseCodeCount, setHouseCodeCount] = useState('1');
  const [schoolCodeCount, setSchoolCodeCount] = useState('1');
  const [generateHouse, setGenerateHouse] = useState<HouseId | ''>('');
  const [officerCodesLoading, setOfficerCodesLoading] = useState(false);
  const [showBulkAllot, setShowBulkAllot] = useState(false);
  const [officerNameDrafts, setOfficerNameDrafts] = useState<Record<string, string>>({});
  const [archives, setArchives] = useState<ArchiveSummary[]>([]);
  const [archiveNameDrafts, setArchiveNameDrafts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'dashboard' | 'candidates' | 'results' | 'codes' | 'history' | 'log'>('dashboard');
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  // "Start the Election Process" / "End the Election Process" -- the
  // currently active election run, if any. The Dashboard tab shows a
  // prominent banner while one is active; officer-code generation is no
  // longer tied to it (codes are prep work, like candidates).
  const [currentRun, setCurrentRun] = useState<ElectionRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  // Activity Log tab ("Ask your data") -- a filter, not a fixed picker: Run
  // defaults to the current run if one is active, otherwise "All Runs".
  // Every other field narrows the search further (see LogSearchFilter).
  const [pastRuns, setPastRuns] = useState<ElectionRun[]>([]);
  const emptyLogFilters = {
    runId: '',
    electionType: '' as ElectionType | '',
    branch: '' as Branch | '',
    actor: '',
    action: '',
    code: '',
    adminOnly: false
  };
  const [logFilters, setLogFilters] = useState(emptyLogFilters);
  const [logResults, setLogResults] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logSearched, setLogSearched] = useState(false);
  // Which branch Manage Candidates (and, as a result, Live Results too,
  // since they share the same `results` fetch) is currently scoped to.
  // Year 1 is manual entry only for both branches -- see
  // CANDIDATE-COLLECTION-PLAN.md and ROADMAP.md Phase 2 -- so this is
  // deliberately a simple shared toggle, not per-tab independent state.
  const [selectedBranch, setSelectedBranch] = useState<Branch>('dwarka');
  // Which election type Manage Candidates/Live Results are scoped to --
  // independent of pollStatus.activeElectionType, so an admin can check or
  // edit School candidates while House is the one actually running (or vice
  // versa) without needing to run the Start Election wizard just to look.
  // Starts in sync with whatever's actually active; once the admin
  // explicitly starts a different election, the effect below re-syncs it
  // (see the useEffect keyed on pollStatus?.activeElectionType).
  const [selectedElectionType, setSelectedElectionType] = useState<ElectionType>('school');
  const liveResultsRef = useRef<HTMLDivElement | null>(null);

  // A message/error left over from an action on a different tab (e.g.
  // "Candidate added successfully" from Manage Candidates on the Dashboard
  // tab) has no business following the admin to Live Results or anywhere
  // else -- clear both whenever the tab changes.
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMessage(null);
    setError(null);
  };

  // Belt-and-braces for the same issue: even on the SAME tab, a success
  // message shouldn't linger forever -- auto-dismiss it after a few seconds.
  useEffect(() => {
    if (!message) {
      return;
    }
    const timeoutId = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [message]);

  // Only one terminal may hold the admin console at a time (see
  // adminSessionService on the backend), and that hold never expires from
  // inactivity -- the only way to lose it is another device logging in and
  // taking over. If that happens, the very next admin request from this
  // tab comes back rejected, and the api layer calls this handler so the
  // dashboard drops back to the login screen instead of silently failing
  // every subsequent action.
  useEffect(() => {
    setAdminSessionLostHandler(() => {
      sessionStorage.removeItem('adminSecret');
      setAdminSecret('');
      setAuthenticated(false);
      setPollStatus(null);
      setResults([]);
      setAuthError(
        'This terminal was signed out -- the admin console was taken over from another device. Please log in again.'
      );
    });
    return () => setAdminSessionLostHandler(null);
  }, []);

  // Keeps the Manage Candidates/Live Results election-type toggle in sync
  // with reality whenever the actually-active election type changes (e.g.
  // the admin runs the Start Election wizard) -- but only then, not on every
  // 5-second poll refresh, so a manual toggle in between two such changes
  // isn't clobbered.
  useEffect(() => {
    if (pollStatus?.activeElectionType) {
      setSelectedElectionType(pollStatus.activeElectionType);
    }
  }, [pollStatus?.activeElectionType]);

  const handlePresentFullScreen = () => {
    liveResultsRef.current?.requestFullscreen?.().catch(() => {
      // Fullscreen can be denied by the browser/OS -- the tab still works
      // fine without it, just not edge-to-edge.
    });
  };

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pollResponse, resultsResponse] = await Promise.all([
        getPollStatus(),
        getResults(undefined, selectedBranch, selectedElectionType)
      ]);
      setPollStatus(pollResponse.poll);
      setResults(resultsResponse.results);
      setTotalVotes(resultsResponse.totalVotes);
      setLastUpdated(Date.now());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, selectedElectionType]);

  // syncDrafts is false for the background 3-second poll, so it can refresh
  // vote counts without clobbering officer names the admin is mid-typing.
  const loadOfficerCodes = useCallback(async (syncDrafts: boolean = true) => {
    const secret = sessionStorage.getItem('adminSecret');
    if (!secret) {
      return;
    }
    try {
      const response = await getOfficerCodes(secret);
      setOfficerCodes(response.codes);
      if (syncDrafts) {
        setOfficerNameDrafts(
          Object.fromEntries(response.codes.map((entry) => [entry.code, entry.officerName]))
        );
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load officer codes');
    }
  }, []);

  // Used only by the 3-second background poll below. It updates vote totals
  // (candidate results + per-officer vote counts) and nothing else -- not
  // pollStatus, not officer name drafts, not the global `loading` flag -- so
  // it can never interrupt an admin who is mid-edit elsewhere on this page.
  // Everything else (poll open/close, candidate add/edit/delete, code
  // generate/save/delete) reloads its own state explicitly after acting.
  const refreshVoteCounts = useCallback(async () => {
    try {
      const resultsResponse = await getResults(undefined, selectedBranch, selectedElectionType);
      setResults(resultsResponse.results);
      setTotalVotes(resultsResponse.totalVotes);
      setLastUpdated(Date.now());
    } catch {
      // Silent: a background tick failing once isn't worth surfacing an
      // error banner for; the next tick retries automatically.
    }
    await loadOfficerCodes(false);
  }, [loadOfficerCodes, selectedBranch, selectedElectionType]);

  // Backs the Storage status indicator -- checked on a slower, steady
  // cadence regardless of whether the poll is open, so an admin can confirm
  // recovery after a failure even once voting has stopped. This is the
  // signal an admin actually needs when an officer reports the "vote may
  // not have saved" error: a station's vote count alone can't distinguish
  // "saved fine" from "captured in memory but not yet durable."
  const loadStorageHealth = useCallback(async () => {
    const secret = sessionStorage.getItem('adminSecret');
    if (!secret) {
      return;
    }
    try {
      const health = await getStorageHealth(secret);
      setStorageHealth(health);
    } catch {
      // Silent, same reasoning as refreshVoteCounts -- the next tick retries.
    }
  }, []);

  const loadCurrentRun = useCallback(async () => {
    const secret = sessionStorage.getItem('adminSecret');
    if (!secret) {
      return;
    }
    try {
      const response = await getCurrentRun(secret);
      setCurrentRun(response.run);
    } catch {
      // Silent -- the Dashboard tab just won't show a run banner this tick;
      // the next explicit action (e.g. Start Recording) will surface any
      // real error directly.
    }
  }, []);

  // Called by StartElectionWizard once it has started the run AND opened
  // the poll -- one continuous action, not "arm then separately open".
  const handleWizardStarted = async (wizardMessage: string) => {
    setShowWizard(false);
    setMessage(wizardMessage);
    await Promise.all([loadDashboard(), loadOfficerCodes(), loadCurrentRun()]);
  };

  const handleCloseRecording = async () => {
    if (!currentRun) {
      return;
    }
    const confirmed = window.confirm(
      `End the election process for "${currentRun.name}"?\n\nThis saves the final results to Election History, resets votes to zero, and closes the poll. Officer codes and their allotments are kept for the next election. This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    try {
      setRunLoading(true);
      setError(null);
      const run = await closeRecording(adminSecret);
      setCurrentRun(null);
      setMessage(`"${run.name}" closed and saved to Election History.`);
      await Promise.all([loadDashboard(), loadOfficerCodes(), loadArchives()]);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Failed to close the election');
    } finally {
      setRunLoading(false);
    }
  };

  const loadPastRuns = useCallback(async () => {
    const secret = sessionStorage.getItem('adminSecret');
    if (!secret) {
      return;
    }
    try {
      const response = await getRuns(secret);
      setPastRuns(response.runs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load past elections');
    }
  }, []);

  // "Ask your data" -- runs whatever's currently in logFilters against the
  // search endpoint. Empty/'' fields are simply omitted (searchRunLog only
  // sends filters that have a real value), so an all-blank form searches
  // everything.
  const runLogSearch = useCallback(async (filters: typeof emptyLogFilters) => {
    try {
      setLogLoading(true);
      setError(null);
      const response = await searchRunLog(
        {
          runId: filters.runId || undefined,
          electionType: filters.electionType || undefined,
          branch: filters.branch || undefined,
          actor: filters.actor || undefined,
          action: filters.action || undefined,
          code: filters.code || undefined,
          adminOnly: filters.adminOnly
        },
        adminSecret
      );
      setLogResults(response.entries);
      setLogSearched(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to search the activity log');
    } finally {
      setLogLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSecret]);

  const handleLogFilterChange = (updates: Partial<typeof emptyLogFilters>) => {
    setLogFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleLogSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runLogSearch(logFilters);
  };

  const handleClearLogFilters = () => {
    setLogFilters(emptyLogFilters);
    void runLogSearch(emptyLogFilters);
  };

  // One-click answer to "who were the polling officers/teachers given a
  // code" -- every officerCode.name entry is itself a record of "this code
  // was allotted to this name at this time," so filtering to that action is
  // the log's own audit trail of the roster (including any corrections),
  // not just the current live snapshot the Officer Codes tab shows.
  const handleShowOfficerRoster = () => {
    const next = { ...emptyLogFilters, runId: logFilters.runId, action: 'officerCode.name' };
    setLogFilters(next);
    void runLogSearch(next);
  };

  // Generates the same number of house-bound codes for every one of the 8
  // houses in one go, instead of the admin having to repeat "Generate" 8 times.
  const handleGenerateHouseCodesForAll = async () => {
    const perHouseCount = Number(houseCodeCount);
    if (!Number.isInteger(perHouseCount) || perHouseCount < 1 || perHouseCount > 200) {
      setError('Enter a number of codes between 1 and 200.');
      return;
    }
    try {
      setOfficerCodesLoading(true);
      setError(null);
      for (const houseId of HOUSE_IDS) {
        await generateOfficerCodes(perHouseCount, adminSecret, houseId, selectedBranch);
      }
      setMessage(`Generated ${perHouseCount} code${perHouseCount === 1 ? '' : 's'} for each of the 8 houses (${selectedBranch === 'AN' ? 'AN' : 'Dwarka'}).`);
      await loadOfficerCodes();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate codes for all houses');
    } finally {
      setOfficerCodesLoading(false);
    }
  };

  // Tops up a single house (e.g. a code was lost) without regenerating for
  // every house.
  const handleGenerateSingleHouseCodes = async () => {
    if (!generateHouse) {
      setError('Choose a house first.');
      return;
    }
    const count = Number(houseCodeCount);
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      setError('Enter a number of codes between 1 and 200.');
      return;
    }
    try {
      setOfficerCodesLoading(true);
      setError(null);
      await generateOfficerCodes(count, adminSecret, generateHouse, selectedBranch);
      setMessage(`Generated ${count} new code${count === 1 ? '' : 's'} for ${generateHouse} House (${selectedBranch === 'AN' ? 'AN' : 'Dwarka'}).`);
      await loadOfficerCodes();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate codes');
    } finally {
      setOfficerCodesLoading(false);
    }
  };

  const handleGenerateSchoolCodes = async () => {
    const count = Number(schoolCodeCount);
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      setError('Enter a number of codes between 1 and 200.');
      return;
    }
    try {
      setOfficerCodesLoading(true);
      setError(null);
      await generateOfficerCodes(count, adminSecret, undefined, selectedBranch);
      setMessage(`Generated ${count} new school code${count === 1 ? '' : 's'} (${selectedBranch === 'AN' ? 'AN' : 'Dwarka'}).`);
      await loadOfficerCodes();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate codes');
    } finally {
      setOfficerCodesLoading(false);
    }
  };

  const handleReopenOfficerCode = async (code: string) => {
    try {
      setOfficerCodesLoading(true);
      setError(null);
      await reopenOfficerCode(code, adminSecret);
      setMessage(`Reopened code ${code}. It can be used to activate a ballot again.`);
      await loadOfficerCodes();
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : 'Failed to reopen code');
    } finally {
      setOfficerCodesLoading(false);
    }
  };

  const handleSaveOfficerName = async (code: string) => {
    const officerName = officerNameDrafts[code] ?? '';
    try {
      setOfficerCodesLoading(true);
      setError(null);
      await updateOfficerCode(code, { officerName }, adminSecret);
      setMessage(`Saved name for code ${code}.`);
      await loadOfficerCodes();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save officer name');
    } finally {
      setOfficerCodesLoading(false);
    }
  };

  const loadArchives = useCallback(async () => {
    const secret = sessionStorage.getItem('adminSecret');
    if (!secret) {
      return;
    }
    try {
      const response = await getArchivesList(secret);
      setArchives(response.archives);
      setArchiveNameDrafts(Object.fromEntries(response.archives.map((entry) => [entry.id, entry.name ?? ''])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load election history');
    }
  }, []);

  const handleSaveArchiveName = async (id: string) => {
    const name = archiveNameDrafts[id] ?? '';
    try {
      setError(null);
      await renameArchive(id, name, adminSecret);
      setMessage('Election name saved.');
      await loadArchives();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Failed to save the name');
    }
  };

  const handleDeleteArchive = async (archive: ArchiveSummary) => {
    const confirmed = window.confirm(
      `Permanently delete this Election History entry?\n\n${archive.name || '(unnamed)'} — ${formatTimestamp(archive.archivedAt)} — ${archive.totalVotes} vote${archive.totalVotes === 1 ? '' : 's'}\n\nThis cannot be undone. Use this to clear out test/junk entries -- do not delete a real election's record unless you're certain you no longer need it.`
    );
    if (!confirmed) {
      return;
    }
    try {
      setError(null);
      await deleteArchive(archive.id, adminSecret);
      setMessage('Election History entry deleted.');
      await loadArchives();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete the entry');
    }
  };

  const handleDeleteOfficerCode = async (code: string) => {
    const confirmed = window.confirm(`Delete code ${code}? It will no longer be able to activate a kiosk.`);
    if (!confirmed) {
      return;
    }
    try {
      setOfficerCodesLoading(true);
      setError(null);
      await deleteOfficerCode(code, adminSecret);
      setMessage(`Deleted code ${code}.`);
      await loadOfficerCodes();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete code');
    } finally {
      setOfficerCodesLoading(false);
    }
  };

  // On first load, silently re-use a previously verified secret for this browser tab.
  useEffect(() => {
    const stored = sessionStorage.getItem('adminSecret');
    if (!stored) {
      setCheckingAuth(false);
      return;
    }
    void (async () => {
      try {
        await verifyAdminSecret(stored);
        setAdminSecret(stored);
        setAuthenticated(true);
      } catch {
        sessionStorage.removeItem('adminSecret');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminSecret.trim()) {
      setAuthError('Enter the admin secret.');
      return;
    }
    try {
      setUnlocking(true);
      setAuthError(null);
      setSessionConflict(null);
      await verifyAdminSecret(adminSecret.trim());
      sessionStorage.setItem('adminSecret', adminSecret.trim());
      setAuthenticated(true);
    } catch (verifyError) {
      const code = (verifyError as { errorCode?: string })?.errorCode;
      const messageText = verifyError instanceof Error ? verifyError.message : 'Incorrect admin secret';
      if (code === 'ADMIN_SESSION_CONFLICT') {
        setSessionConflict(messageText);
      } else {
        setAuthError(messageText);
      }
    } finally {
      setUnlocking(false);
    }
  };

  // Only reachable after the user has explicitly confirmed a takeover in
  // response to the ADMIN_SESSION_CONFLICT prompt above -- disconnects
  // whichever other terminal currently holds the admin console.
  const handleTakeOver = async () => {
    try {
      setUnlocking(true);
      setAuthError(null);
      await verifyAdminSecret(adminSecret.trim(), true);
      sessionStorage.setItem('adminSecret', adminSecret.trim());
      setSessionConflict(null);
      setAuthenticated(true);
    } catch (verifyError) {
      setAuthError(verifyError instanceof Error ? verifyError.message : 'Failed to take over the admin console');
    } finally {
      setUnlocking(false);
    }
  };

  const handleLogout = () => {
    void logoutAdmin();
    sessionStorage.removeItem('adminSecret');
    setAdminSecret('');
    setAuthenticated(false);
    setPollStatus(null);
    setResults([]);
  };

  useEffect(() => {
    if (authenticated) {
      void loadDashboard();
      void loadOfficerCodes();
      void loadArchives();
      void loadStorageHealth();
      void loadCurrentRun();
    }
  }, [authenticated, loadDashboard, loadOfficerCodes, loadArchives, loadStorageHealth, loadCurrentRun]);

  // Activity Log tab: on first visit, default the Run filter to the current
  // run if one is active (otherwise "All Runs") and run that search
  // immediately, so the tab never opens empty. Also (re)loads the list of
  // past runs so the Run dropdown stays current.
  useEffect(() => {
    if (activeTab !== 'log') {
      return;
    }
    void loadPastRuns();
    if (!logSearched) {
      const initial = { ...emptyLogFilters, runId: currentRun?.id ?? '' };
      setLogFilters(initial);
      void runLogSearch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentRun, loadPastRuns]);

  // Checked on its own steady cadence -- independent of whether the poll is
  // open -- so the indicator stays current even after voting has stopped.
  useEffect(() => {
    if (!authenticated) {
      return;
    }
    const intervalId = setInterval(() => {
      void loadStorageHealth();
    }, 10000); // 10 seconds
    return () => clearInterval(intervalId);
  }, [authenticated, loadStorageHealth]);

  // Auto-refresh results when poll is open
  useEffect(() => {
    if (!authenticated || !pollStatus?.settings.isOpen) {
      return; // Don't poll when logged out or poll is closed
    }

    // Refresh vote counts only -- see refreshVoteCounts above -- every 3
    // seconds while the poll is open.
    const intervalId = setInterval(() => {
      void refreshVoteCounts();
    }, 3000); // 3 seconds

    // Cleanup interval on unmount or when poll closes
    return () => {
      clearInterval(intervalId);
    };
  }, [authenticated, pollStatus?.settings.isOpen, refreshVoteCounts]);

  const mutatePoll = async (action: 'open' | 'close') => {
    if (!adminSecret.trim()) {
      setError('Enter the admin secret to manage the poll.');
      return;
    }

    if (action === 'close') {
      const confirmed = window.confirm(
        'Pause polling?\n\nNo booth will be able to activate or submit a ballot until you re-start polling. This is safe and reversible -- it will not affect any votes already cast.'
      );
      if (!confirmed) {
        return;
      }
    }

    let closedElectionType: ElectionType | null = null;
    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      await (action === 'open' ? openPoll(adminSecret) : closePoll(adminSecret));
      setMessage(`Polling ${action === 'open' ? 're-started' : 'paused'} successfully.`);
      if (action === 'close') {
        closedElectionType = pollStatus?.activeElectionType ?? null;
      }
      // Reload everything to ensure consistency
      await loadDashboard();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Action failed');
      return;
    } finally {
      setLoading(false);
    }

    // Closing doesn't touch votes or create a history record on its own --
    // only Reset Poll / Switch Election Type do, as a side effect of
    // clearing votes. Offer to save one now, while it's top of mind, so a
    // closed election isn't silently missing from Election History until
    // someone remembers to Reset. Cancel skips entirely; OK with a blank
    // name still saves, just unnamed.
    if (closedElectionType) {
      const name = window.prompt(
        'Save this election to Election History?\n\nEnter a name (e.g. "House Elections -- Term 1 2026"), or leave blank and click OK to save without one. Votes are not affected, and you can do this anytime later with "Save to Election History". Click Cancel to skip for now.',
        `${closedElectionType === 'house' ? 'House' : 'School'} Election -- ${new Date().toLocaleDateString('en-GB')}`
      );
      if (name !== null) {
        try {
          await saveElectionToHistory(adminSecret, name.trim() || undefined);
          setMessage('Poll closed. Saved to Election History.');
          await loadArchives();
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : 'Failed to save to Election History');
        }
      }
    }
  };

  const handleSaveToHistory = async () => {
    if (!adminSecret.trim()) {
      setError('Enter the admin secret to save to Election History.');
      return;
    }
    if (!pollStatus?.activeElectionType) {
      setError('Select an election type first.');
      return;
    }

    const name = window.prompt(
      'Save the current results to Election History.\n\nEnter a name (e.g. "House Elections -- Term 1 2026"), or leave blank and click OK to save without one. Votes are not affected.',
      `${pollStatus.activeElectionType === 'house' ? 'House' : 'School'} Election -- ${new Date().toLocaleDateString('en-GB')}`
    );
    if (name === null) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      await saveElectionToHistory(adminSecret, name.trim() || undefined);
      setMessage('Saved to Election History.');
      await loadArchives();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save to Election History');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!adminSecret.trim()) {
      setError('Enter the admin secret to reset the poll.');
      return;
    }

    if (pollStatus?.settings.isOpen) {
      setError('Please close the poll before resetting.');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to RESET the poll?\n\nThis will:\n- Save a snapshot of the current results to Election History (skipped if you already saved this exact election with "Save to Election History")\n- Delete ALL votes for both election types\n- Reset all results to zero\n\nVotes cannot be recovered after this, but the snapshot will remain available in Election History.'
    );

    if (!confirmed) {
      return;
    }

    // Reset always archives a snapshot when an election type is set, even
    // with zero votes -- ask for a name so Election History reads as
    // something more useful than just a timestamp. Cancelling this prompt
    // only skips the name (it can be added later from Election History), it
    // does not cancel the reset the admin already confirmed above.
    const archiveName = pollStatus?.activeElectionType
      ? window.prompt(
          'Name this election for the history record (e.g. "School Council -- Term 1 2026"). Leave blank to skip -- you can add a name later from Election History.',
          `${pollStatus.activeElectionType === 'house' ? 'House' : 'School'} Election -- ${new Date().toLocaleDateString('en-GB')}`
        )?.trim() || undefined
      : undefined;

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      await resetPoll(adminSecret, archiveName);
      setMessage('Poll reset successfully. A snapshot was saved to Election History and all votes have been cleared.');
      await loadDashboard();
      await loadArchives();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCandidate = async (candidateId: string, name: string, imageUrl: string) => {
    if (!adminSecret.trim()) {
      throw new Error('Admin secret required');
    }
    await updateCandidate(candidateId, { name, imageUrl }, adminSecret);
    await loadDashboard();
    setMessage(`Candidate updated successfully.`);
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    if (!adminSecret.trim()) {
      throw new Error('Admin secret required');
    }
    await deleteCandidate(candidateId, adminSecret);
    await loadDashboard();
    setMessage(`Candidate deleted successfully.`);
  };

  const handleAddCandidate = async (post: PostId, name: string, house?: HouseId) => {
    if (!adminSecret.trim()) {
      setError('Admin secret required');
      return;
    }
    if (!name.trim()) {
      setError('Candidate name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const id = `${post.toLowerCase()}-${Date.now()}`;
      
      // Determine election type from post
      const electionType: ElectionType = ['HB', 'HG', 'SSC', 'SRC', 'SCC'].includes(post) ? 'school' : 'house';
      
      await addCandidate({
        id,
        name: name.trim(),
        post,
        electionType,
        house: house || undefined,
        branch: selectedBranch
      }, adminSecret);
      await loadDashboard();
      setMessage(`Candidate added successfully to ${selectedBranch === 'AN' ? 'AN' : 'Dwarka'}.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Failed to add candidate');
    } finally {
      setLoading(false);
    }
  };

  // Shared by Manage Candidates, Live Results, and Polling Officer Codes --
  // all three read/write through the same branch-scoped `results`/
  // `officerCodes` state, so the control needs to be reachable from each one,
  // not just wherever it happened to be added first (a real gap: it was
  // originally only on Manage Candidates, so switching to AN there silently
  // carried over to Live Results with no visible toggle to explain why).
  const renderBranchToggle = (subject: string) => (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }} role="tablist" aria-label="Branch">
        {(['dwarka', 'AN'] as const).map((branch) => (
          <button
            key={branch}
            role="tab"
            aria-selected={selectedBranch === branch}
            onClick={() => setSelectedBranch(branch)}
            disabled={loading}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              border: selectedBranch === branch ? '2px solid #3b82f6' : '1px solid #d1d5db',
              backgroundColor: selectedBranch === branch ? '#eff6ff' : '#ffffff',
              color: selectedBranch === branch ? '#1d4ed8' : '#374151',
              fontWeight: selectedBranch === branch ? 700 : 500,
              cursor: loading ? 'default' : 'pointer'
            }}
          >
            {branch === 'AN' ? 'AN' : 'Dwarka'}
          </button>
        ))}
      </div>
      <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1rem' }}>
        Showing {subject} for {selectedBranch === 'AN' ? 'AN' : 'Dwarka'} only. This applies across Manage
        Candidates, Live Results, and Polling Officer Codes together.
      </p>
    </>
  );

  // Shared by Manage Candidates and Live Results -- lets an admin check or
  // edit the OTHER election type's candidates/results without starting an
  // election of that type first. Not shared with Polling Officer Codes,
  // which already shows school and house codes together in one list.
  const renderElectionTypeToggle = () => (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }} role="tablist" aria-label="Election type">
      {(['school', 'house'] as const).map((type) => (
        <button
          key={type}
          role="tab"
          aria-selected={selectedElectionType === type}
          onClick={() => setSelectedElectionType(type)}
          disabled={loading}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: selectedElectionType === type ? '2px solid #16a34a' : '1px solid #d1d5db',
            backgroundColor: selectedElectionType === type ? '#f0fdf4' : '#ffffff',
            color: selectedElectionType === type ? '#15803d' : '#374151',
            fontWeight: selectedElectionType === type ? 700 : 500,
            cursor: loading ? 'default' : 'pointer'
          }}
        >
          {type === 'house' ? '🏠 House Posts' : '🏫 School Posts'}
        </button>
      ))}
    </div>
  );

  // Every ballot fills exactly one selection per post (enforced server-side
  // -- see votes.ts validateVote), so summing a post's own candidate totals
  // is the count of ballots cast for it specifically -- not the combined
  // "Total Votes" figure in the panel header, which for House Elections
  // sums across all 8 houses together and so isn't a number any one house's
  // voters/candidates can be judged against. Showing it per post also means
  // the same three totals within one house should always agree; if they
  // ever don't, that's worth a second look.
  const postVoteTotal = (candidates: CandidateResult[]): number =>
    candidates.reduce((sum, c) => sum + c.total, 0);

  const renderPostTotalRow = (candidates: CandidateResult[]) => (
    <div className="live-post-total">
      <span>Total votes for this post</span>
      <span>{postVoteTotal(candidates)}</span>
    </div>
  );

  // Renders one school post's card for the Live Results tab -- pulled out
  // so all 5 posts can share the same card markup and colored header.
  const renderSchoolPostCard = (postId: SchoolPostId) => {
    const postResult = results.find((r) => r.post === postId);
    const sortedCandidates = [...(postResult?.candidates ?? [])].sort((a, b) => b.total - a.total);
    const color = POST_COLORS[postId];
    return (
      <div key={postId} className="live-post-card">
        <h3 style={{ backgroundColor: color.background, color: color.text }}>{POST_NAMES[postId]}</h3>
        {sortedCandidates.length > 0 ? (
          <>
            {sortedCandidates.map((candidateResult, index) => (
              <div
                key={candidateResult.candidate.id}
                className={`live-candidate-row${index === 0 && candidateResult.total > 0 ? ' leader' : ''}`}
              >
                <span>{candidateResult.candidate.name}</span>
                <span>{candidateResult.total}</span>
              </div>
            ))}
            {renderPostTotalRow(sortedCandidates)}
          </>
        ) : (
          <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>No candidates</p>
        )}
      </div>
    );
  };

  // Group results by house for house elections
  const houseGroupedResults = useMemo(() => {
    if (selectedElectionType === 'house') {
      return groupResultsByHouse(results);
    }
    return null;
  }, [results, selectedElectionType]);

  // Groups the officer-code table by house (in a fixed house order), with
  // unbound/school codes in their own group at the end -- so it reads as
  // "n codes for Anand House, then n for Dhiraj House, etc." rather than
  // whatever order they happened to be generated in.
  const groupedOfficerCodes = useMemo(() => {
    // Codes generated before the branch field existed have no `branch` set
    // client-side either -- treat that the same way the backend defaults it,
    // so old Dwarka codes still show up under "Dwarka" instead of vanishing.
    const branchFiltered = officerCodes.filter((entry) => (entry.branch ?? 'dwarka') === selectedBranch);
    return groupOfficerCodesByHouse(branchFiltered);
  }, [officerCodes, selectedBranch]);

  // "Download Dwarka/AN Report" mirrors GET /report/current: the live
  // results while an election is running, or the final result of whichever
  // election most recently closed once activeElectionType goes back to
  // null -- so these stay usable right up until an admin's first-ever
  // election, not just while one happens to be active.
  const canDownloadCurrentReport = Boolean(pollStatus?.activeElectionType) || archives.length > 0;

  if (checkingAuth) {
    return (
      <section className="page-card admin">
        <h1>Admin Dashboard</h1>
        <p>Checking access...</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="page-card admin">
        <h1>Admin Login</h1>
        <p>Enter the admin secret to view or manage the election.</p>
        <form className="form" onSubmit={handleUnlock} style={{ maxWidth: '320px' }}>
          <label className="form-label" htmlFor="admin-secret">Admin Secret</label>
          <input
            id="admin-secret"
            className="form-input"
            type="password"
            value={adminSecret}
            onChange={(event) => {
              setAdminSecret(event.target.value);
              setSessionConflict(null);
            }}
            placeholder="Enter admin secret"
            autoFocus
          />
          {authError && <p style={{ color: '#dc2626', fontWeight: 600 }}>{authError}</p>}
          {sessionConflict && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fffbeb',
                border: '2px solid #f59e0b',
                borderRadius: '8px',
                color: '#92400e'
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>{sessionConflict}</p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
                Only one terminal can control the election at a time. Taking over will immediately sign the other
                device out.
              </p>
              <button
                type="button"
                className="button"
                onClick={handleTakeOver}
                disabled={unlocking}
                style={{ backgroundColor: '#ea580c', marginTop: '0.75rem' }}
              >
                {unlocking ? 'Taking over...' : 'Take Over This Terminal'}
              </button>
            </div>
          )}
          <button className="button" type="submit" disabled={unlocking || !adminSecret.trim()}>
            {unlocking ? 'Checking...' : 'Unlock Admin Dashboard'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="page-card admin">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Admin Dashboard</h1>
          <p>Monitor poll status, manage voting, and review live results.</p>
        </div>
        <button className="button" onClick={handleLogout} style={{ backgroundColor: '#6b7280', flexShrink: 0 }}>
          Log out
        </button>
      </div>

      {storageHealth && !storageHealth.ok && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#fef2f2',
            border: '2px solid #dc2626',
            borderRadius: '8px',
            color: '#991b1b'
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>
            ⚠ Storage is not saving right now
            {storageHealth.lastErrorAt && ` (since ${formatTimestamp(storageHealth.lastErrorAt)})`}
          </p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
            Votes and other changes are still being held in the server's memory, but are NOT yet durably saved --
            they would be lost if the server restarted right now. Do not restart or redeploy anything. Get IT/developer
            help immediately.
            {storageHealth.lastSuccessAt && ` Last confirmed save: ${formatTimestamp(storageHealth.lastSuccessAt)}.`}
          </p>
        </div>
      )}
      <div className="admin-tabs">
        {(
          [
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'candidates', label: 'Manage Candidates' },
            { key: 'results', label: 'Live Results' },
            { key: 'codes', label: `Polling Officer Codes${officerCodes.length > 0 ? ` (${officerCodes.length})` : ''}` },
            { key: 'history', label: 'Election History' },
            { key: 'log', label: currentRun ? '🗳️ Activity Log' : 'Activity Log' }
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            className={`admin-tab-button${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="admin-panel dashboard-panel">
          <div className="dashboard-title-row">
            <h2>Poll Controls</h2>
            {pollStatus && (
              <span className={`poll-status-pill ${pollStatus.settings.isOpen ? 'is-open' : 'is-closed'}`}>
                <span className="poll-status-dot" aria-hidden="true" />
                {pollStatus.settings.isOpen ? 'Poll Open' : 'Poll Closed'}
              </span>
            )}
          </div>

          <section className="dashboard-section">
            <h3 className="dashboard-section-title">Election</h3>
            {currentRun ? (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#ecfdf5',
                  border: '2px solid #059669',
                  borderRadius: '8px'
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, color: '#065f46' }}>
                  🗳️ ELECTION IN PROGRESS: {currentRun.name}
                </p>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: '#065f46' }}>
                  {currentRun.electionType === 'house' ? 'House Elections' : 'School Elections'} &middot; started{' '}
                  {formatTimestamp(currentRun.startedAt)} by {currentRun.startedBy}
                </p>
                <p style={{ margin: '0.5rem 0 0.75rem 0', fontSize: '0.8rem', color: '#065f46' }}>
                  Every action from here on is permanently logged (see the Activity Log tab) until this election is
                  closed. Use Voting below to pause/resume; use the button below to end the election entirely.
                </p>
                <button
                  className="button"
                  onClick={handleCloseRecording}
                  disabled={runLoading}
                  style={{ backgroundColor: '#991b1b' }}
                >
                  {runLoading ? 'Closing...' : '⏹ End the Election Process'}
                </button>
              </div>
            ) : showWizard ? (
              <StartElectionWizard
                adminSecret={adminSecret}
                activeElectionType={pollStatus?.activeElectionType ?? null}
                officerCodes={officerCodes}
                onClose={() => setShowWizard(false)}
                onStarted={handleWizardStarted}
                onTypeChanged={() => void loadDashboard()}
              />
            ) : (
              <div style={{ padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#4b5563' }}>
                  No election is in progress. Setup work (adding candidates, generating officer codes) is free and
                  unlogged until you start one.
                </p>
                <button className="button" onClick={() => setShowWizard(true)}>
                  🗳️ Start the Election Process (School / House)
                </button>
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <h3 className="dashboard-section-title">Voting</h3>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
              For pausing/resuming voting within the election currently in progress -- opening the very first poll
              of a new election happens through "Start the Election Process" above.
            </p>
            <div className="admin-actions">
              <button
                className="button"
                onClick={() => mutatePoll('open')}
                disabled={loading || !currentRun || pollStatus?.settings.isOpen === true}
                style={{ opacity: pollStatus?.settings.isOpen === true ? 0.5 : 1 }}
                title={
                  pollStatus?.settings.isOpen === true
                    ? 'Voting is already running'
                    : !currentRun
                    ? 'Start the election process first'
                    : 'Resume voting'
                }
              >
                ▶ Re-start Polling
              </button>
              <button
                className="button"
                onClick={() => mutatePoll('close')}
                disabled={loading || pollStatus?.settings.isOpen !== true}
                style={{ backgroundColor: '#dc2626', opacity: pollStatus?.settings.isOpen !== true ? 0.5 : 1 }}
                title={pollStatus?.settings.isOpen !== true ? 'Voting is already paused' : 'Pause voting'}
              >
                ⏸ Pause Polling
              </button>
              <button className="button" onClick={() => void loadDashboard()} disabled={loading} style={{ backgroundColor: '#6b7280', opacity: loading ? 0.5 : 1 }}>
                Refresh this Page
              </button>
            </div>
          </section>

          <section className="dashboard-section">
            <h3 className="dashboard-section-title">Records &amp; Reports</h3>
            <div className="admin-actions" style={{ flexDirection: 'column' }}>
              <button
                className="button"
                onClick={handleSaveToHistory}
                disabled={loading || !pollStatus?.activeElectionType}
                style={{
                  backgroundColor: '#0f766e',
                  width: '100%',
                  opacity: !pollStatus?.activeElectionType ? 0.5 : 1
                }}
                title={
                  !pollStatus?.activeElectionType
                    ? 'Select an election type first'
                    : 'Save the current results to Election History -- does not affect any votes'
                }
              >
                📋 Save to Election History
              </button>
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <button
                  className="button"
                  onClick={() => window.open('/admin/report?branch=dwarka', '_blank')}
                  disabled={!canDownloadCurrentReport}
                  style={{ backgroundColor: '#4338ca', flex: 1, opacity: !canDownloadCurrentReport ? 0.5 : 1 }}
                  title={
                    !canDownloadCurrentReport
                      ? 'No election has ever been set up yet'
                      : 'Open a printable Dwarka results report in a new tab -- the live results while an election is running, or the final result once it has closed'
                  }
                >
                  🖨️ Download Dwarka Report
                </button>
                <button
                  className="button"
                  onClick={() => window.open('/admin/report?branch=AN', '_blank')}
                  disabled={!canDownloadCurrentReport}
                  style={{ backgroundColor: '#4338ca', flex: 1, opacity: !canDownloadCurrentReport ? 0.5 : 1 }}
                  title={
                    !canDownloadCurrentReport
                      ? 'No election has ever been set up yet'
                      : 'Open a printable AN results report in a new tab -- the live results while an election is running, or the final result once it has closed'
                  }
                >
                  🖨️ Download AN Report
                </button>
              </div>
              <button
                className="button"
                onClick={handleReset}
                disabled={loading || pollStatus?.settings.isOpen === true}
                style={{
                  backgroundColor: pollStatus?.settings.isOpen ? '#9ca3af' : '#ea580c',
                  width: '100%',
                  opacity: pollStatus?.settings.isOpen ? 0.5 : 1
                }}
                title={pollStatus?.settings.isOpen ? 'Close the poll before resetting' : 'Delete all votes and reset the poll'}
              >
                🗑️ Reset Poll (Clear All Votes)
                {pollStatus?.settings.isOpen && ' (Close poll first)'}
              </button>
            </div>
          </section>

          {/* Combines the two timestamps that used to be shown separately
              (a global "Storage: OK" line above the tabs, and "Last
              updated" buried at the bottom of this panel) into one place,
              each labelled with what it actually tells the admin -- they
              answer two different questions ("is my data safe?" vs. "how
              fresh is what I'm looking at?") that are easy to conflate. */}
          <div className="status-strip">
            <div className={`status-card${storageHealth?.ok === false ? ' status-card-danger' : ''}`}>
              <span className="status-card-icon" aria-hidden="true">💾</span>
              <div>
                <p className="status-card-title">
                  Storage {storageHealth ? (storageHealth.ok ? 'OK' : 'Not Saving') : ''}
                </p>
                <p className="status-card-value">
                  {storageHealth?.ok === false
                    ? 'See the red alert above -- get IT/developer help immediately.'
                    : storageHealth?.lastSuccessAt
                    ? `Last saved ${formatTimestamp(storageHealth.lastSuccessAt)}`
                    : 'No save confirmed yet'}
                </p>
                <p className="status-card-hint">
                  Confirms votes and other changes made so far are safely and durably saved on the server &mdash; not just held in memory.
                </p>
              </div>
            </div>
            <div className="status-card">
              <span className="status-card-icon" aria-hidden="true">🔄</span>
              <div>
                <p className="status-card-title">Screen Data</p>
                <p className="status-card-value">{lastUpdated ? formatTimestamp(lastUpdated) : 'Not loaded yet'}</p>
                <p className="status-card-hint">
                  How recently the poll status and vote counts on this screen were fetched from the server. This updates automatically every 3 seconds while the poll is open &mdash; click "Refresh this Page" above to update it immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'candidates' && (
        <div className="admin-panel">
          <h2>Manage Candidates</h2>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '1rem' }}>
            {selectedElectionType === 'house'
              ? 'Edit, delete, or add candidates for each house and post'
              : 'Edit, delete, or add candidates for each post'}
          </p>

          {renderElectionTypeToggle()}
          {renderBranchToggle('and adding candidates')}

          {selectedElectionType === 'house' && houseGroupedResults ? (
            // House elections: Group by house, then by post
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {houseGroupedResults.map((houseGroup) => (
                <div key={houseGroup.house} style={{
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  backgroundColor: '#f9fafb'
                }}>
                  <h3 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#1f2937',
                    marginBottom: '1rem',
                    borderBottom: '2px solid #3b82f6',
                    paddingBottom: '0.5rem'
                  }}>
                    🏠 {houseGroup.house} House
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {HOUSE_POST_IDS.map((postId) => {
                      const postResult = houseGroup.posts.find(p => p.post === postId);
                      const postCandidates = postResult?.candidates || [];

                      return (
                        <div key={`${houseGroup.house}-${postId}`} className="result-card">
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                            {postId}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {postCandidates.map((candidateResult) => (
                              <CandidateEditor
                                key={candidateResult.candidate.id}
                                candidate={candidateResult.candidate}
                                adminSecret={adminSecret}
                                onUpdate={handleUpdateCandidate}
                                onDelete={handleDeleteCandidate}
                              />
                            ))}
                            <AddCandidateForm
                              post={postId}
                              house={houseGroup.house}
                              onAdd={(post, name) => handleAddCandidate(post, name, houseGroup.house)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // School elections: Group by post only
            <div className="results-grid">
              {results.map((postResult) => (
                <div key={postResult.post} className="result-card">
                  <h3>{postResult.post}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {postResult.candidates.map((candidateResult) => (
                      <CandidateEditor
                        key={candidateResult.candidate.id}
                        candidate={candidateResult.candidate}
                        adminSecret={adminSecret}
                        onUpdate={handleUpdateCandidate}
                        onDelete={handleDeleteCandidate}
                      />
                    ))}
                    <AddCandidateForm
                      post={postResult.post}
                      onAdd={handleAddCandidate}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'results' && (
      <>
      {/* Deliberately outside the fullscreen ref below -- "Present Full
          Screen" is meant for a clean projector view, and these toggles have
          no business being visible to the audience watching it. Set the
          election type/branch here first, then present. */}
      {renderElectionTypeToggle()}
      {renderBranchToggle('results')}
      <div className="admin-panel" ref={liveResultsRef} style={{ backgroundColor: '#ffffff', padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', margin: 0, lineHeight: 1.2 }}>
              {selectedElectionType === 'house' ? 'House Elections' : 'School Elections'} &mdash; Live Results
            </h2>
            <p style={{ color: '#6b7280', margin: '0.15rem 0 0 0', fontSize: '0.75rem' }}>
              {pollStatus?.settings.isOpen ? '🔄 Auto-refreshing every 3 seconds' : 'Click Refresh to update'}
              {lastUpdated && ` — last updated on: ${formatTimestamp(lastUpdated)}`}
            </p>
          </div>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
            {selectedElectionType === 'house'
              ? `Total Ballots (all 8 houses combined): ${totalVotes}`
              : `Total Votes: ${totalVotes}`}
          </p>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              style={{ backgroundColor: '#6b7280', padding: '0.35rem 0.7rem', fontSize: '0.8rem', opacity: loading ? 0.5 : 1 }}
            >
              Refresh
            </button>
            <button
              className="button"
              onClick={handlePresentFullScreen}
              style={{ backgroundColor: '#4338ca', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
              title="Fill the screen with just this tab -- press Esc to exit"
            >
              🖥️ Present Full Screen
            </button>
          </div>
        </div>

        {selectedElectionType === 'house' && houseGroupedResults ? (
          <div className="live-house-grid">
            {houseGroupedResults.map((houseGroup) => (
              <div key={houseGroup.house} className="live-house-card">
                <h3
                  style={{
                    backgroundColor: HOUSE_COLORS[houseGroup.house].accent,
                    color: HOUSE_COLORS[houseGroup.house].stripText
                  }}
                >
                  🏠 {houseGroup.house}
                </h3>
                {HOUSE_POST_IDS.map((postId) => {
                  const postResult = houseGroup.posts.find((p) => p.post === postId);
                  const sortedCandidates = [...(postResult?.candidates ?? [])].sort((a, b) => b.total - a.total);
                  return (
                    <div key={postId} className="live-house-post">
                      <p className="live-house-post-label" style={{ color: POST_COLORS[postId].accent }}>
                        {POST_NAMES[postId]}
                      </p>
                      {sortedCandidates.length > 0 ? (
                        <>
                          {sortedCandidates.map((candidateResult, index) => (
                            <div
                              key={candidateResult.candidate.id}
                              className={`live-candidate-row${index === 0 && candidateResult.total > 0 ? ' leader' : ''}`}
                            >
                              <span>{candidateResult.candidate.name}</span>
                              <span>{candidateResult.total}</span>
                            </div>
                          ))}
                          {renderPostTotalRow(sortedCandidates)}
                        </>
                      ) : (
                        <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>No candidates</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="live-school-grid">
            {(['HB', 'HG', 'SSC', 'SRC', 'SCC'] as const).map(renderSchoolPostCard)}
            {results.length === 0 && <p>No votes recorded yet.</p>}
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'codes' && (
      <div className="admin-panel">
        {renderBranchToggle('codes')}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Polling Officer Codes</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="button"
              onClick={() => setShowBulkAllot(true)}
              disabled={showBulkAllot}
              style={{ backgroundColor: '#7c3aed', opacity: showBulkAllot ? 0.5 : 1 }}
              title={
                showBulkAllot
                  ? 'Already open below -- use its own Close button to dismiss'
                  : 'Generate and name codes for a whole teacher list at once, from an Excel file'
              }
            >
              📋 Bulk Allot from List
            </button>
            <button
              className="button"
              onClick={() => window.open(`/admin/report/officer-codes/${selectedBranch}`, '_blank')}
              style={{ backgroundColor: '#0f766e' }}
              title={`Open a printable ${selectedBranch === 'AN' ? 'AN' : 'Dwarka'} code-allotment list -- hand this to that branch's Election Head/Principal`}
            >
              🖨️ Print {selectedBranch === 'AN' ? 'AN' : 'Dwarka'} Code List
            </button>
            <button
              className="button"
              onClick={() => window.open('/admin/report/turnout', '_blank')}
              disabled={!pollStatus?.activeElectionType}
              style={{ backgroundColor: '#4338ca', opacity: !pollStatus?.activeElectionType ? 0.5 : 1 }}
              title={!pollStatus?.activeElectionType ? 'Select an election type first' : 'Open a printable turnout report in a new tab'}
            >
              🖨️ Print Officer Turnout
            </button>
          </div>
        </div>

        {showBulkAllot && (
          <BulkAllotCodesModal
            adminSecret={adminSecret}
            branch={selectedBranch}
            onClose={() => setShowBulkAllot(false)}
            onAllotted={() => void loadOfficerCodes()}
          />
        )}

        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: '1rem' }}>
          Generate codes here, hand them out, then come back and type each officer's name against their code so
          you know who has which one. This is prep work, same as adding candidates -- do it any time, before or
          after starting the election process. Generating adds new codes to the list below &mdash; it never
          replaces or removes existing ones.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: '1 1 340px', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
            <label className="form-label" style={{ fontWeight: 600, display: 'block' }}>
              Generate codes for House Elections
            </label>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0.75rem 0' }}>
              Each code opens straight into its house's ballot on the kiosk &mdash; no house-selection step.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="form-label" htmlFor="house-code-count">Codes per house</label>
                <input
                  id="house-code-count"
                  className="form-input"
                  type="number"
                  min={1}
                  max={200}
                  value={houseCodeCount}
                  onChange={(event) => setHouseCodeCount(event.target.value)}
                  style={{ width: '120px' }}
                />
              </div>
              <button
                className="button"
                onClick={handleGenerateHouseCodesForAll}
                disabled={officerCodesLoading}
              >
                Generate for All 8 Houses
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <div>
                <label className="form-label" htmlFor="single-house">Or just one house</label>
                <select
                  id="single-house"
                  className="form-input"
                  value={generateHouse}
                  onChange={(event) => setGenerateHouse(event.target.value as HouseId | '')}
                  style={{ width: '160px' }}
                >
                  <option value="">Choose a house&hellip;</option>
                  {HOUSE_IDS.map((houseId) => (
                    <option key={houseId} value={houseId}>
                      {houseId}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="button"
                style={{ backgroundColor: '#6b7280', opacity: officerCodesLoading || !generateHouse ? 0.5 : 1 }}
                onClick={handleGenerateSingleHouseCodes}
                disabled={officerCodesLoading || !generateHouse}
                title={!generateHouse ? 'Choose a house first' : 'Add more codes to just this one house, e.g. to replace a lost code'}
              >
                Add to This House
              </button>
            </div>
          </div>

          <div style={{ flex: '1 1 260px', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
            <label className="form-label" style={{ fontWeight: 600, display: 'block' }}>
              Generate codes for School Posts
            </label>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0.75rem 0' }}>
              Not tied to any house &mdash; for Head Boy/Girl and other whole-school posts.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label" htmlFor="school-code-count">Number of codes</label>
                <input
                  id="school-code-count"
                  className="form-input"
                  type="number"
                  min={1}
                  max={200}
                  value={schoolCodeCount}
                  onChange={(event) => setSchoolCodeCount(event.target.value)}
                  style={{ width: '120px' }}
                />
              </div>
              <button
                className="button"
                onClick={handleGenerateSchoolCodes}
                disabled={officerCodesLoading}
              >
                Generate School Codes
              </button>
            </div>
          </div>
        </div>

        {officerCodes.length === 0 ? (
          <p>No codes generated yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.5rem' }}>Code</th>
                  <th style={{ padding: '0.5rem' }}>Officer Name</th>
                  <th style={{ padding: '0.5rem' }}>Votes Cast</th>
                  <th style={{ padding: '0.5rem' }}>Status</th>
                  <th style={{ padding: '0.5rem' }}></th>
                </tr>
              </thead>
              {groupedOfficerCodes.map((group) => (
                <tbody key={group.label}>
                  <tr>
                    <td
                      colSpan={5}
                      style={{ padding: '0.5rem', fontWeight: 700, backgroundColor: '#eef2ff', color: '#3730a3' }}
                    >
                      {group.label} ({group.codes.length})
                    </td>
                  </tr>
                  {group.codes.map((entry) => {
                    const isClosed = Boolean(entry.closedAt);
                    return (
                      <tr
                        key={entry.code}
                        style={{
                          borderBottom: '1px solid #f3f4f6',
                          backgroundColor: isClosed ? '#fef2f2' : undefined
                        }}
                      >
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}>
                          {entry.code}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              className="form-input"
                              style={{ margin: 0 }}
                              value={officerNameDrafts[entry.code] ?? ''}
                              placeholder="Officer name"
                              onChange={(event) =>
                                setOfficerNameDrafts((prev) => ({ ...prev, [entry.code]: event.target.value }))
                              }
                            />
                            <button
                              className="button"
                              style={{ backgroundColor: '#6b7280', flexShrink: 0, opacity: officerCodesLoading ? 0.5 : 1 }}
                              disabled={officerCodesLoading}
                              onClick={() => handleSaveOfficerName(entry.code)}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem' }}>{entry.voteCount}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {isClosed ? (
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>CLOSED</span>
                          ) : (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>Open</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {isClosed && (
                              <button
                                className="button"
                                style={{ backgroundColor: '#16a34a', opacity: officerCodesLoading ? 0.5 : 1 }}
                                disabled={officerCodesLoading}
                                onClick={() => handleReopenOfficerCode(entry.code)}
                              >
                                Reopen
                              </button>
                            )}
                            <button
                              className="button"
                              style={{ backgroundColor: '#dc2626', opacity: officerCodesLoading ? 0.5 : 1 }}
                              disabled={officerCodesLoading}
                              onClick={() => handleDeleteOfficerCode(entry.code)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>
      )}

      {activeTab === 'history' && (
      <div className="admin-panel">
        <h2>Election History</h2>
        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          A snapshot of results and polling-officer turnout is saved here automatically every time "Reset Poll" is
          used, so a completed election's record survives even after votes are cleared or the election type is
          switched.
        </p>
        {archives.length === 0 ? (
          <p>No past elections have been archived yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.5rem' }}>Name</th>
                  <th style={{ padding: '0.5rem' }}>Archived</th>
                  <th style={{ padding: '0.5rem' }}>Election Type</th>
                  <th style={{ padding: '0.5rem' }}>Total Votes</th>
                  <th style={{ padding: '0.5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {[...archives]
                  .sort((a, b) => b.archivedAt - a.archivedAt)
                  .map((archive) => (
                    <tr key={archive.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', minWidth: '220px' }}>
                          <input
                            className="form-input"
                            style={{ margin: 0 }}
                            value={archiveNameDrafts[archive.id] ?? ''}
                            placeholder="Unnamed -- add a label"
                            onChange={(event) =>
                              setArchiveNameDrafts((prev) => ({ ...prev, [archive.id]: event.target.value }))
                            }
                          />
                          <button
                            className="button"
                            style={{ backgroundColor: '#6b7280', flexShrink: 0 }}
                            onClick={() => handleSaveArchiveName(archive.id)}
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{formatTimestamp(archive.archivedAt)}</td>
                      <td style={{ padding: '0.5rem' }}>{archive.electionType === 'school' ? 'School' : 'House'}</td>
                      <td style={{ padding: '0.5rem' }}>{archive.totalVotes}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {/* Delete is intentionally hidden here, not removed --
                            once real users are on the app, a visible "Delete"
                            next to an election's permanent record undermines
                            trust in the record even if never clicked. See
                            handleDeleteArchive above and DELETE
                            /admin/report/archives/:id on the backend if it's
                            ever needed again (e.g. clearing test data) --
                            re-add the button rather than reintroducing a new
                            deletion path. */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="button"
                            style={{ backgroundColor: '#4338ca' }}
                            onClick={() => window.open(`/admin/report/${archive.id}?branch=dwarka`, '_blank')}
                          >
                            View/Print Dwarka
                          </button>
                          <button
                            className="button"
                            style={{ backgroundColor: '#4338ca' }}
                            onClick={() => window.open(`/admin/report/${archive.id}?branch=AN`, '_blank')}
                          >
                            View/Print AN
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {activeTab === 'log' && (
      <div className="admin-panel">
        <h2>Activity Log</h2>
        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Every action taken while an election is in progress, permanent and unmutable -- nothing here can be
          edited or deleted, by anyone. Setup work done before an election starts is not logged at all (see the
          Dashboard tab's Election section). Search below instead of reading straight through -- e.g. paste a code
          to see everything that happened to it, or filter by branch/election type/actor.
        </p>

        {pastRuns.length === 0 ? (
          <p>No elections started yet. Start one from the Dashboard tab.</p>
        ) : (
          <>
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="button" style={{ backgroundColor: '#0f766e' }} onClick={handleShowOfficerRoster}>
                👥 Who were the polling officers?
              </button>
              <button
                className="button"
                style={{ backgroundColor: '#4338ca' }}
                onClick={() => handleLogFilterChange({ adminOnly: !logFilters.adminOnly })}
              >
                {logFilters.adminOnly ? '☑' : '☐'} Admin actions only
              </button>
            </div>

            <form
              onSubmit={handleLogSearchSubmit}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                padding: '1rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                marginBottom: '1rem',
                alignItems: 'flex-end'
              }}
            >
              <div>
                <label className="form-label" htmlFor="log-filter-run">Election</label>
                <select
                  id="log-filter-run"
                  className="form-input"
                  style={{ width: '220px' }}
                  value={logFilters.runId}
                  onChange={(event) => handleLogFilterChange({ runId: event.target.value })}
                >
                  <option value="">All Runs</option>
                  {pastRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.status === 'running' ? '🔴 ' : ''}
                      {run.name} &mdash; {formatTimestamp(run.startedAt)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="log-filter-type">Election Type</label>
                <select
                  id="log-filter-type"
                  className="form-input"
                  style={{ width: '140px' }}
                  value={logFilters.electionType}
                  onChange={(event) => handleLogFilterChange({ electionType: event.target.value as ElectionType | '' })}
                >
                  <option value="">All</option>
                  <option value="school">🏫 School</option>
                  <option value="house">🏠 House</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="log-filter-branch">Branch</label>
                <select
                  id="log-filter-branch"
                  className="form-input"
                  style={{ width: '120px' }}
                  value={logFilters.branch}
                  onChange={(event) => handleLogFilterChange({ branch: event.target.value as Branch | '' })}
                >
                  <option value="">All</option>
                  <option value="dwarka">Dwarka</option>
                  <option value="AN">AN</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="log-filter-code">Code</label>
                <input
                  id="log-filter-code"
                  className="form-input"
                  style={{ width: '120px' }}
                  value={logFilters.code}
                  onChange={(event) => handleLogFilterChange({ code: event.target.value })}
                  placeholder="e.g. ab2k7m"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="log-filter-actor">Actor contains</label>
                <input
                  id="log-filter-actor"
                  className="form-input"
                  style={{ width: '150px' }}
                  value={logFilters.actor}
                  onChange={(event) => handleLogFilterChange({ actor: event.target.value })}
                  placeholder="e.g. Rajeev"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="log-filter-action">Action contains</label>
                <input
                  id="log-filter-action"
                  className="form-input"
                  style={{ width: '170px' }}
                  value={logFilters.action}
                  onChange={(event) => handleLogFilterChange({ action: event.target.value })}
                  placeholder="e.g. officerCode"
                />
              </div>
              <button className="button" type="submit" disabled={logLoading}>
                {logLoading ? 'Searching...' : '🔎 Search'}
              </button>
              <button className="button" type="button" style={{ backgroundColor: '#6b7280' }} onClick={handleClearLogFilters}>
                Clear
              </button>
            </form>

            {logLoading ? (
              <p>Loading...</p>
            ) : logResults.length === 0 ? (
              <p>{logSearched ? 'No actions match this search.' : 'No actions logged yet.'}</p>
            ) : (
              <>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                  {logResults.length} action{logResults.length === 1 ? '' : 's'} &middot;{' '}
                  {new Set(logResults.map((entry) => entry.actor)).size} distinct actor
                  {new Set(logResults.map((entry) => entry.actor)).size === 1 ? '' : 's'}
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '0.5rem' }}>Time</th>
                        <th style={{ padding: '0.5rem' }}>Actor</th>
                        <th style={{ padding: '0.5rem' }}>Action</th>
                        <th style={{ padding: '0.5rem' }}>Branch</th>
                        <th style={{ padding: '0.5rem' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logResults.map((entry) => {
                        // Flagged prominently -- a takeover or the legacy
                        // Reset Poll button used while a recording is active
                        // are both exactly the kind of thing this log exists
                        // to surface, not bury in an ordinary row
                        // (ELECTION-INTEGRITY-AND-TRUST.md item 5).
                        const isNotable = entry.action === 'admin.session.takeover' || entry.action === 'poll.reset';
                        return (
                          <tr
                            key={entry.id}
                            style={{
                              borderBottom: '1px solid #f3f4f6',
                              backgroundColor: isNotable ? '#fef2f2' : undefined
                            }}
                          >
                            <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                              {formatTimestamp(entry.timestamp)}
                            </td>
                            <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{entry.actor}</td>
                            <td style={{ padding: '0.5rem', fontWeight: isNotable ? 700 : 500, color: isNotable ? '#991b1b' : undefined }}>
                              {isNotable && '⚠ '}
                              {entry.action}
                            </td>
                            <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                              {entry.branch === 'AN' ? 'AN' : entry.branch === 'dwarka' ? 'Dwarka' : ''}
                            </td>
                            <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace' }}>
                              {entry.details && Object.keys(entry.details).length > 0
                                ? Object.entries(entry.details)
                                    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                                    .join(' ')
                                : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
      )}

      {message && <p className="message success">{message}</p>}
      {error && <p className="message error">{error}</p>}
      {loading && <p>Processing request...</p>}
    </section>
  );
};
