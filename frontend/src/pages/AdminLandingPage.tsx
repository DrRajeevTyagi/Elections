import { useCallback, useEffect, useState, useMemo } from 'react';
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
  verifyAdminSecret
} from '../services/api';
import type { PollStatus, PostResult, CandidateResult } from '../types/api';
import type { PostId, ElectionType, HouseId } from '../types/election';
import { AddCandidateForm } from '../components/AddCandidateForm';
import { CandidateEditor } from '../components/CandidateEditor';
import './Page.css';
import './admin.css';

const formatTimestamp = (timestamp: number): string => new Date(timestamp).toLocaleString();

const HOUSE_IDS: HouseId[] = ['Anand', 'Dhiraj', 'Kripa', 'Prem', 'Namrata', 'Nishtha', 'Satya', 'Shanti'];
const HOUSE_POST_IDS: PostId[] = ['HC', 'HCC', 'HSC'];

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
  const [unlocking, setUnlocking] = useState(false);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [results, setResults] = useState<PostResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pollResponse, resultsResponse] = await Promise.all([getPollStatus(), getResults()]);
      setPollStatus(pollResponse.poll);
      setResults(resultsResponse.results);
      setLastUpdated(Date.now());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

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
      await verifyAdminSecret(adminSecret.trim());
      sessionStorage.setItem('adminSecret', adminSecret.trim());
      setAuthenticated(true);
    } catch (verifyError) {
      setAuthError(verifyError instanceof Error ? verifyError.message : 'Incorrect admin secret');
    } finally {
      setUnlocking(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminSecret');
    setAdminSecret('');
    setAuthenticated(false);
    setPollStatus(null);
    setResults([]);
  };

  useEffect(() => {
    if (authenticated) {
      void loadDashboard();
    }
  }, [authenticated, loadDashboard]);

  // Auto-refresh results when poll is open
  useEffect(() => {
    if (!authenticated || !pollStatus?.settings.isOpen) {
      return; // Don't poll when logged out or poll is closed
    }

    // Refresh results every 3 seconds when poll is open
    const intervalId = setInterval(() => {
      void loadDashboard();
    }, 3000); // 3 seconds

    // Cleanup interval on unmount or when poll closes
    return () => {
      clearInterval(intervalId);
    };
  }, [authenticated, pollStatus?.settings.isOpen, loadDashboard]);

  const mutatePoll = async (action: 'open' | 'close') => {
    if (!adminSecret.trim()) {
      setError('Enter the admin secret to manage the poll.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      const response = action === 'open' ? await openPoll(adminSecret) : await closePoll(adminSecret);
      setMessage(`Poll ${action === 'open' ? 'opened' : 'closed'} successfully.`);
      // Reload everything to ensure consistency
      await loadDashboard();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Action failed');
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
      'Are you sure you want to RESET the poll?\n\nThis will:\n- Delete ALL votes\n- Reset all results to zero\n\nThis action cannot be undone!'
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      await resetPoll(adminSecret);
      setMessage('Poll reset successfully. All votes have been cleared.');
      await loadDashboard();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCandidate = async (candidateId: string, name: string) => {
    if (!adminSecret.trim()) {
      throw new Error('Admin secret required');
    }
    await updateCandidate(candidateId, { name }, adminSecret);
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

  // Group results by house for house elections
  const houseGroupedResults = useMemo(() => {
    if (pollStatus?.activeElectionType === 'house') {
      return groupResultsByHouse(results);
    }
    return null;
  }, [results, pollStatus?.activeElectionType]);

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

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      await setElectionType(electionType, adminSecret);
      setMessage(`Switched to ${electionType === 'school' ? 'School' : 'House'} Elections successfully.`);
      await loadDashboard();
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
            onChange={(event) => setAdminSecret(event.target.value)}
            placeholder="Enter admin secret"
            autoFocus
          />
          {authError && <p style={{ color: '#dc2626', fontWeight: 600 }}>{authError}</p>}
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

      <div className="admin-grid">
        <div className="admin-panel">
          <h2>Poll Controls</h2>
          
          {/* Election Type Selector */}
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
            <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
              Election Type
            </label>
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

          <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Admin Secret</label>
          <p className="status" style={{ margin: '0 0 0.75rem 0' }}>✓ Unlocked for this browser session</p>
          <div className="admin-actions">
            <button 
              className="button" 
              onClick={() => mutatePoll('open')} 
              disabled={loading || !pollStatus?.activeElectionType}
              title={!pollStatus?.activeElectionType ? 'Please select an election type first' : 'Open the poll for voting'}
            >
              Open Poll
            </button>
            <button className="button" onClick={() => mutatePoll('close')} disabled={loading} style={{ backgroundColor: '#dc2626' }}>
              Close Poll
            </button>
            <button className="button" onClick={() => void loadDashboard()} disabled={loading} style={{ backgroundColor: '#6b7280' }}>
              Refresh
            </button>
          </div>
          <div className="admin-actions" style={{ marginTop: '0.5rem' }}>
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
          {pollStatus && (
            <p className="status">
              Status: <strong>{pollStatus.settings.isOpen ? 'Open' : 'Closed'}</strong>
            </p>
          )}
          {lastUpdated && <p className="status">Last updated: {formatTimestamp(lastUpdated)}</p>}
        </div>

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

        <div className="admin-panel">
          <h2>Results Overview</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: 0 }}>
              {pollStatus?.settings.isOpen ? (
                <span>
                  🔄 Auto-refreshing every 3 seconds
                  {lastUpdated && (
                    <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      (Last updated: {formatTimestamp(lastUpdated)})
                    </span>
                  )}
                </span>
              ) : (
                'Click "Refresh" to update vote counts'
              )}
            </p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
              Total Votes: {results.length > 0 
                ? Math.round(results.reduce((sum, post) => sum + post.candidates.reduce((s, c) => s + c.total, 0), 0) / results.length)
                : 0}
            </p>
          </div>
          
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
                          <ul>
                            {postCandidates.length > 0 ? (
                              postCandidates.map((candidateResult, index) => (
                                <li key={candidateResult.candidate.id} style={{ 
                                  backgroundColor: index === 0 && candidateResult.total > 0 ? '#f0fdf4' : 'transparent',
                                  padding: '0.5rem',
                                  borderRadius: '6px',
                                  marginBottom: '0.25rem'
                                }}>
                                  <span style={{ fontWeight: index === 0 && candidateResult.total > 0 ? 600 : 400 }}>
                                    {candidateResult.candidate.name}
                                  </span>
                                  <span className="badge" style={{ 
                                    backgroundColor: index === 0 && candidateResult.total > 0 ? '#16a34a' : '#1c64f2'
                                  }}>
                                    {candidateResult.total} {candidateResult.total === 1 ? 'vote' : 'votes'}
                                  </span>
                                </li>
                              ))
                            ) : (
                              <li style={{ color: '#9ca3af', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                No candidates
                              </li>
                            )}
                          </ul>
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
                  <ul>
                    {postResult.candidates.map((candidateResult, index) => (
                      <li key={candidateResult.candidate.id} style={{ 
                        backgroundColor: index === 0 && candidateResult.total > 0 ? '#f0fdf4' : 'transparent',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        marginBottom: '0.25rem'
                      }}>
                        <span style={{ fontWeight: index === 0 && candidateResult.total > 0 ? 600 : 400 }}>
                          {candidateResult.candidate.name}
                        </span>
                        <span className="badge" style={{ 
                          backgroundColor: index === 0 && candidateResult.total > 0 ? '#16a34a' : '#1c64f2'
                        }}>
                          {candidateResult.total} {candidateResult.total === 1 ? 'vote' : 'votes'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {results.length === 0 && <p>No votes recorded yet.</p>}
            </div>
          )}
        </div>
      </div>

      {message && <p className="message success">{message}</p>}
      {error && <p className="message error">{error}</p>}
      {loading && <p>Processing request...</p>}
    </section>
  );
};
