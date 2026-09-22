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
  setElectionType,
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
  saveElectionToHistory
} from '../services/api';
import type { PollStatus, PostResult, CandidateResult, OfficerCode, ArchiveSummary, StorageHealth } from '../types/api';
import type { PostId, ElectionType, HouseId, SchoolPostId } from '../types/election';
import { AddCandidateForm } from '../components/AddCandidateForm';
import { CandidateEditor } from '../components/CandidateEditor';
import { HOUSE_IDS, HOUSE_POST_IDS } from '../constants/houses';
import { POST_NAMES } from '../constants/posts';
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
  const [officerNameDrafts, setOfficerNameDrafts] = useState<Record<string, string>>({});
  const [archives, setArchives] = useState<ArchiveSummary[]>([]);
  const [archiveNameDrafts, setArchiveNameDrafts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'dashboard' | 'candidates' | 'results' | 'codes' | 'history'>('dashboard');
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
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
      const [pollResponse, resultsResponse] = await Promise.all([getPollStatus(), getResults()]);
      setPollStatus(pollResponse.poll);
      setResults(resultsResponse.results);
      setTotalVotes(resultsResponse.totalVotes);
      setLastUpdated(Date.now());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

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
      const resultsResponse = await getResults();
      setResults(resultsResponse.results);
      setTotalVotes(resultsResponse.totalVotes);
      setLastUpdated(Date.now());
    } catch {
      // Silent: a background tick failing once isn't worth surfacing an
      // error banner for; the next tick retries automatically.
    }
    await loadOfficerCodes(false);
  }, [loadOfficerCodes]);

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
        await generateOfficerCodes(perHouseCount, adminSecret, houseId);
      }
      setMessage(`Generated ${perHouseCount} code${perHouseCount === 1 ? '' : 's'} for each of the 8 houses.`);
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
      await generateOfficerCodes(count, adminSecret, generateHouse);
      setMessage(`Generated ${count} new code${count === 1 ? '' : 's'} for ${generateHouse} House.`);
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
      await generateOfficerCodes(count, adminSecret);
      setMessage(`Generated ${count} new school code${count === 1 ? '' : 's'}.`);
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
    }
  }, [authenticated, loadDashboard, loadOfficerCodes, loadArchives, loadStorageHealth]);

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
        'Close the poll?\n\nNo booth will be able to activate or submit a ballot until you Open the poll again. This is safe and reversible -- it will not affect any votes already cast.'
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
      setMessage(`Poll ${action === 'open' ? 'opened' : 'closed'} successfully.`);
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
        house: house || undefined
      }, adminSecret);
      await loadDashboard();
      setMessage(`Candidate added successfully.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Failed to add candidate');
    } finally {
      setLoading(false);
    }
  };

  // Renders one school post's card for the Live Results tab -- pulled out
  // so the two fixed rows (Head Boy/Head Girl, then the other three posts)
  // can both call it instead of duplicating the card markup.
  const renderSchoolPostCard = (postId: SchoolPostId) => {
    const postResult = results.find((r) => r.post === postId);
    const sortedCandidates = [...(postResult?.candidates ?? [])].sort((a, b) => b.total - a.total);
    return (
      <div key={postId} className="live-post-card">
        <h3>{POST_NAMES[postId]}</h3>
        {sortedCandidates.length > 0 ? (
          sortedCandidates.map((candidateResult, index) => (
            <div
              key={candidateResult.candidate.id}
              className={`live-candidate-row${index === 0 && candidateResult.total > 0 ? ' leader' : ''}`}
            >
              <span>{candidateResult.candidate.name}</span>
              <span>{candidateResult.total}</span>
            </div>
          ))
        ) : (
          <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>No candidates</p>
        )}
      </div>
    );
  };

  // Group results by house for house elections
  const houseGroupedResults = useMemo(() => {
    if (pollStatus?.activeElectionType === 'house') {
      return groupResultsByHouse(results);
    }
    return null;
  }, [results, pollStatus?.activeElectionType]);

  // Groups the officer-code table by house (in a fixed house order), with
  // unbound/school codes in their own group at the end -- so it reads as
  // "n codes for Anand House, then n for Dhiraj House, etc." rather than
  // whatever order they happened to be generated in.
  const groupedOfficerCodes = useMemo(() => {
    const byHouse = new Map<HouseId, OfficerCode[]>();
    const unbound: OfficerCode[] = [];
    for (const entry of officerCodes) {
      if (entry.house) {
        const list = byHouse.get(entry.house) ?? [];
        list.push(entry);
        byHouse.set(entry.house, list);
      } else {
        unbound.push(entry);
      }
    }

    const groups: { label: string; codes: OfficerCode[] }[] = [];
    for (const houseId of HOUSE_IDS) {
      const codes = byHouse.get(houseId);
      if (codes && codes.length > 0) {
        groups.push({ label: `${houseId} House`, codes: [...codes].sort((a, b) => a.createdAt - b.createdAt) });
      }
    }
    if (unbound.length > 0) {
      groups.push({ label: 'School Posts', codes: [...unbound].sort((a, b) => a.createdAt - b.createdAt) });
    }
    return groups;
  }, [officerCodes]);

  const handleSetElectionType = async (electionType: ElectionType) => {
    if (!adminSecret.trim()) {
      setError('Enter the admin secret to change election type.');
      return;
    }

    if (pollStatus?.settings.isOpen) {
      setError('Please close the poll before changing election type.');
      return;
    }

    const confirmed = window.confirm(
      `Switch to ${electionType === 'school' ? 'School' : 'House'} Elections?\n\nThis will:\n- Clear all active sessions\n- Close the poll\n\nYou can then configure candidates and open the poll.`
    );

    if (!confirmed) {
      return;
    }

    // Switching type only archives the OUTGOING type's votes (and only if
    // there are any) -- see poll.ts. Only bother asking for a name when
    // that's actually going to happen.
    const outgoingVotesCast = results.reduce(
      (sum, post) => sum + post.candidates.reduce((s, c) => s + c.total, 0),
      0
    );
    const willArchive =
      Boolean(pollStatus?.activeElectionType) && pollStatus?.activeElectionType !== electionType && outgoingVotesCast > 0;
    const archiveName = willArchive
      ? window.prompt(
          'Name this election for the history record (e.g. "School Council -- Term 1 2026"). Leave blank to skip -- you can add a name later from Election History.',
          `${pollStatus!.activeElectionType === 'house' ? 'House' : 'School'} Election -- ${new Date().toLocaleDateString('en-GB')}`
        )?.trim() || undefined
      : undefined;

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      await setElectionType(electionType, adminSecret, archiveName);
      setMessage(`Switched to ${electionType === 'school' ? 'School' : 'House'} Elections successfully.`);
      await loadDashboard();
      await loadArchives();
    } catch (typeError) {
      setError(typeError instanceof Error ? typeError.message : 'Failed to change election type');
    } finally {
      setLoading(false);
    }
  };

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
      <div className="admin-tabs" style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', borderBottom: '2px solid #e5e7eb' }}>
        {(
          [
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'candidates', label: 'Manage Candidates' },
            { key: 'results', label: 'Live Results' },
            { key: 'codes', label: `Polling Officer Codes${officerCodes.length > 0 ? ` (${officerCodes.length})` : ''}` },
            { key: 'history', label: 'Election History' }
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            className="button"
            onClick={() => handleTabChange(tab.key)}
            style={{
              backgroundColor: activeTab === tab.key ? '#1c64f2' : 'transparent',
              color: activeTab === tab.key ? '#ffffff' : '#374151',
              borderRadius: '8px 8px 0 0',
              boxShadow: 'none'
            }}
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
                  How recently the poll status and vote counts on this screen were fetched from the server &mdash; click Refresh below to update now.
                </p>
              </div>
            </div>
          </div>

          <section className="dashboard-section">
            <h3 className="dashboard-section-title">Election Type</h3>
            <div style={{ padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  className="button"
                  onClick={() => handleSetElectionType('school')}
                  disabled={loading || pollStatus?.settings.isOpen === true || pollStatus?.activeElectionType === 'school'}
                  style={{
                    backgroundColor: pollStatus?.activeElectionType === 'school' ? '#16a34a' : '#6b7280',
                    flex: 1,
                    opacity: pollStatus?.settings.isOpen ? 0.5 : 1
                  }}
                  title={pollStatus?.settings.isOpen ? 'Close poll before changing election type' : 'Switch to School Elections'}
                >
                  🏫 School
                </button>
                <button
                  className="button"
                  onClick={() => handleSetElectionType('house')}
                  disabled={loading || pollStatus?.settings.isOpen === true || pollStatus?.activeElectionType === 'house'}
                  style={{
                    backgroundColor: pollStatus?.activeElectionType === 'house' ? '#16a34a' : '#6b7280',
                    flex: 1,
                    opacity: pollStatus?.settings.isOpen ? 0.5 : 1
                  }}
                  title={pollStatus?.settings.isOpen ? 'Close poll before changing election type' : 'Switch to House Elections'}
                >
                  🏠 House
                </button>
              </div>
              {pollStatus?.activeElectionType ? (
                <p className="status" style={{ margin: 0, fontSize: '0.875rem' }}>
                  Active: <strong>{pollStatus.activeElectionType === 'school' ? 'School Elections' : 'House Elections'}</strong>
                </p>
              ) : (
                <p className="status" style={{ margin: 0, fontSize: '0.875rem', color: '#dc2626' }}>
                  No election type selected
                </p>
              )}
            </div>
          </section>

          <section className="dashboard-section">
            <h3 className="dashboard-section-title">Voting</h3>
            <div className="admin-actions">
              <button
                className="button"
                onClick={() => mutatePoll('open')}
                disabled={loading || !pollStatus?.activeElectionType || pollStatus?.settings.isOpen === true}
                style={{ opacity: pollStatus?.settings.isOpen === true ? 0.5 : 1 }}
                title={
                  pollStatus?.settings.isOpen === true
                    ? 'Poll is already open'
                    : !pollStatus?.activeElectionType
                    ? 'Please select an election type first'
                    : 'Open the poll for voting'
                }
              >
                Open Poll
              </button>
              <button
                className="button"
                onClick={() => mutatePoll('close')}
                disabled={loading || pollStatus?.settings.isOpen !== true}
                style={{ backgroundColor: '#dc2626', opacity: pollStatus?.settings.isOpen !== true ? 0.5 : 1 }}
                title={pollStatus?.settings.isOpen !== true ? 'Poll is already closed' : 'Close the poll'}
              >
                Close Poll
              </button>
              <button className="button" onClick={() => void loadDashboard()} disabled={loading} style={{ backgroundColor: '#6b7280', opacity: loading ? 0.5 : 1 }}>
                Refresh
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
              <button
                className="button"
                onClick={() => window.open('/admin/report', '_blank')}
                disabled={!pollStatus?.activeElectionType}
                style={{ backgroundColor: '#4338ca', width: '100%', opacity: !pollStatus?.activeElectionType ? 0.5 : 1 }}
                title={!pollStatus?.activeElectionType ? 'Select an election type first' : 'Open a printable results report in a new tab'}
              >
                🖨️ Download Report (current results)
              </button>
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
        </div>
      )}

      {activeTab === 'candidates' && (
        <div className="admin-panel">
          <h2>Manage Candidates</h2>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '1rem' }}>
            {pollStatus?.activeElectionType === 'house'
              ? 'Edit, delete, or add candidates for each house and post'
              : 'Edit, delete, or add candidates for each post'}
          </p>

          {pollStatus?.activeElectionType === 'house' && houseGroupedResults ? (
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
      <div className="admin-panel" ref={liveResultsRef} style={{ backgroundColor: '#ffffff', padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', margin: 0, lineHeight: 1.2 }}>
              {pollStatus?.activeElectionType === 'house' ? 'House Elections' : 'School Elections'} &mdash; Live Results
            </h2>
            <p style={{ color: '#6b7280', margin: '0.15rem 0 0 0', fontSize: '0.75rem' }}>
              Last updated on: {lastUpdated ? formatTimestamp(lastUpdated) : '—'}
            </p>
          </div>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
            Total Votes: {totalVotes}
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

        {pollStatus?.activeElectionType === 'house' && houseGroupedResults ? (
          <div className="live-house-grid">
            {houseGroupedResults.map((houseGroup) => (
              <div key={houseGroup.house} className="live-house-card">
                <h3>🏠 {houseGroup.house}</h3>
                {HOUSE_POST_IDS.map((postId) => {
                  const postResult = houseGroup.posts.find((p) => p.post === postId);
                  const sortedCandidates = [...(postResult?.candidates ?? [])].sort((a, b) => b.total - a.total);
                  return (
                    <div key={postId} className="live-house-post">
                      <p className="live-house-post-label">{POST_NAMES[postId]}</p>
                      {sortedCandidates.length > 0 ? (
                        sortedCandidates.map((candidateResult, index) => (
                          <div
                            key={candidateResult.candidate.id}
                            className={`live-candidate-row${index === 0 && candidateResult.total > 0 ? ' leader' : ''}`}
                          >
                            <span>{candidateResult.candidate.name}</span>
                            <span>{candidateResult.total}</span>
                          </div>
                        ))
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
            <div className="live-school-row-2">{(['HB', 'HG'] as const).map(renderSchoolPostCard)}</div>
            <div className="live-school-row-3">{(['SSC', 'SRC', 'SCC'] as const).map(renderSchoolPostCard)}</div>
            {results.length === 0 && <p>No votes recorded yet.</p>}
          </div>
        )}
      </div>
      )}

      {activeTab === 'codes' && (
      <div className="admin-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Polling Officer Codes</h2>
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
        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: '1rem' }}>
          Generate codes here, hand them out, then come back and type each officer's name against their code so
          you know who has which one. Generating adds new codes to the list below &mdash; it never replaces or
          removes existing ones.
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
              <button className="button" onClick={handleGenerateHouseCodesForAll} disabled={officerCodesLoading}>
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
              <button className="button" onClick={handleGenerateSchoolCodes} disabled={officerCodesLoading}>
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
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="button"
                            style={{ backgroundColor: '#4338ca' }}
                            onClick={() => window.open(`/admin/report/${archive.id}`, '_blank')}
                          >
                            View / Print
                          </button>
                          <button
                            className="button"
                            style={{ backgroundColor: '#dc2626' }}
                            onClick={() => handleDeleteArchive(archive)}
                            title="Permanently remove this entry -- for clearing test/junk history"
                          >
                            Delete
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

      {message && <p className="message success">{message}</p>}
      {error && <p className="message error">{error}</p>}
      {loading && <p>Processing request...</p>}
    </section>
  );
};
