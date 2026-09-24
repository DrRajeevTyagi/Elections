import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../context/KioskContext';
import { CandidatePhoto } from '../components/CandidatePhoto';
import { POST_NAMES } from '../constants/posts';
import { playVoteBeep } from '../utils/beep';
import type { PostCandidateGroup, PostId } from '../types/election';
import './Page.css';
import './Evm.css';

// Below this many seconds left on the 5-minute ballot session, show a
// warning banner so a slow voter isn't blindsided by a sudden "session
// expired" error with no notice.
const EXPIRY_WARNING_MS = 90 * 1000;

export const VotePage = (): JSX.Element => {
  const { posts, selections, updateSelection, submit, status, error, confirmation, officerName, house, expiresAt, reset } =
    useKiosk();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [reviewMode, setReviewMode] = useState(false);
  // True while the voter is changing a single answer from the review screen.
  const [editingFromReview, setEditingFromReview] = useState(false);
  // Buffers a re-pick made while editingFromReview so "Cancel" can truly
  // discard it instead of the click having already overwritten `selections`.
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status === 'idle') {
      navigate('/kiosk');
    } else if (status === 'error' && error) {
      setLocalError(error);
    }
  }, [error, navigate, status]);

  // Ticks once a second only while there's an active session to count down,
  // so the warning banner below stays live without polling the server.
  useEffect(() => {
    if (!expiresAt || status !== 'ready') {
      return;
    }
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [expiresAt, status]);

  const secondsUntilExpiry = expiresAt ? Math.round((expiresAt - now) / 1000) : null;
  const showExpiryWarning =
    status === 'ready' && secondsUntilExpiry !== null && secondsUntilExpiry > 0 && secondsUntilExpiry * 1000 <= EXPIRY_WARNING_MS;

  const currentPost: PostCandidateGroup | undefined = posts[currentIndex];
  const allSelected = useMemo(() => posts.every((group) => Boolean(selections[group.post])), [posts, selections]);

  const handleSelect = (post: PostId, candidateId: string) => {
    if (editingFromReview) {
      // Buffered only -- not written to `selections` until the voter
      // confirms with "Back to Review", so "Cancel" can discard it.
      setPendingSelection(candidateId);
    } else {
      updateSelection(post, candidateId);
    }
    setLocalError(undefined);
  };

  const handleNext = () => {
    if (editingFromReview) {
      if (pendingSelection) {
        updateSelection(currentPost.post, pendingSelection);
      }
      setEditingFromReview(false);
      setPendingSelection(null);
      setReviewMode(true);
      return;
    }
    if (currentIndex < posts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (allSelected) {
      setReviewMode(true);
      setCurrentIndex(0);
    }
  };

  const handleChangeChoice = (postIndex: number) => {
    setPendingSelection(selections[posts[postIndex].post]);
    setCurrentIndex(postIndex);
    setReviewMode(false);
    setEditingFromReview(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setLocalError(undefined);
    try {
      await submit();
      playVoteBeep();
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to submit vote');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'completed' && confirmation) {
    return (
      <section className="page-card">
        <h1>Vote Recorded</h1>
        {house && (
          <p style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 700, marginTop: '-0.5rem' }}>
            {house} House
          </p>
        )}
        <p>Your ballot was submitted successfully.</p>
        <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
          Recorded at {new Date(confirmation.timestamp).toLocaleString('en-GB')}. This
          confirms your vote was saved &mdash; there is nothing you need to write
          down or keep.
        </p>
        {typeof confirmation.stationVoteCount === 'number' && (
          <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '2px solid #16a34a' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>
              {officerName ? `Polling officer: ${officerName}` : 'Votes cast at your station'}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.4rem', fontWeight: 700, color: '#166534' }}>
              {confirmation.stationVoteCount} vote{confirmation.stationVoteCount === 1 ? '' : 's'} cast so far
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              Check this against your physical voter list.
            </p>
          </div>
        )}
        <div className="page-actions">
          <button className="button" onClick={() => reset().then(() => navigate('/kiosk'))}>
            Finish
          </button>
        </div>
      </section>
    );
  }

  if (!currentPost) {
    return (
      <section className="page-card">
        <h1>Preparing Ballot</h1>
        <p>Please wait...</p>
      </section>
    );
  }

  if (reviewMode) {
    return (
      <section className="page-card">
        <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>&#10003; Review Your Choices</p>
        </div>
        <h1 style={{ color: '#16a34a' }}>Review Your Selections</h1>
        {showExpiryWarning && (
          <p style={{ fontSize: '0.9rem', color: '#b45309', fontWeight: 700, backgroundColor: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
            ⏱ This ballot session expires in {secondsUntilExpiry}s &mdash; please submit now.
          </p>
        )}
        {house && (
          <p style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 700, marginTop: '-0.5rem' }}>
            {house} House
          </p>
        )}
        <p style={{ fontSize: '0.95rem', color: '#6b7280' }}>
          Check every choice below. Click "Change" to update any answer, or click
          "Submit Ballot" once you are sure.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {posts.map((group, index) => {
            const selectedCandidate = group.candidates.find((c) => c.id === selections[group.post]);
            return (
              <div
                key={group.post}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '12px',
                  border: '2px solid #16a34a'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  {selectedCandidate && (
                    <CandidatePhoto imageUrl={selectedCandidate.imageUrl} name={selectedCandidate.name} size={40} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>
                      {POST_NAMES[group.post]} ({group.post})
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.1rem', fontWeight: 600, color: '#166534' }}>
                      {selectedCandidate?.name ?? 'No selection'}
                    </p>
                  </div>
                </div>
                <button
                  className="button"
                  style={{ backgroundColor: '#6b7280', flexShrink: 0 }}
                  onClick={() => handleChangeChoice(index)}
                >
                  Change
                </button>
              </div>
            );
          })}
        </div>

        {localError && <p style={{ color: '#dc2626', fontWeight: 600 }}>{localError}</p>}

        <div className="page-actions" style={{ width: '100%', marginTop: '1.5rem' }}>
          <button
            className="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ backgroundColor: '#16a34a', width: '100%' }}
          >
            {submitting ? 'Submitting...' : 'Submit Ballot'}
          </button>
        </div>
      </section>
    );
  }

  const activeSelection = editingFromReview ? pendingSelection : selections[currentPost.post];
  const selectedCandidate = currentPost.candidates.find((c) => c.id === activeSelection);

  return (
    <section className="page-card">
      {/* Progress indicator */}
      <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
          {editingFromReview ? 'Changing your selection' : `Step ${currentIndex + 1} of ${posts.length}`}
        </p>
      </div>

      <h1>Select Your Candidate</h1>
      {showExpiryWarning && (
        <p style={{ fontSize: '0.9rem', color: '#b45309', fontWeight: 700, backgroundColor: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
          ⏱ This ballot session expires in {secondsUntilExpiry}s &mdash; please finish soon.
        </p>
      )}
      {house && (
        <p style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 700, marginTop: '-0.5rem' }}>
          {house} House
        </p>
      )}
      <p style={{ fontSize: '1.1rem', fontWeight: 500, color: '#1f2937' }}>
        {POST_NAMES[currentPost.post]} ({currentPost.post})
      </p>
      <p style={{ fontSize: '0.95rem', color: '#6b7280', marginTop: '-0.5rem' }}>
        Choose one candidate from the list below:
      </p>

      <div className="evm-panel">
        <div className="evm-header">
          {house ? `${house} House — ` : ''}
          {POST_NAMES[currentPost.post]} &mdash; Ballot Unit
        </div>
        <div className="evm-rows">
          {currentPost.candidates.map((candidate, index) => {
            const isSelected = activeSelection === candidate.id;
            return (
              <button
                key={candidate.id}
                className={`evm-row${isSelected ? ' selected' : ''}`}
                onClick={() => handleSelect(currentPost.post, candidate.id)}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span className="evm-slno">{index + 1}</span>
                <CandidatePhoto imageUrl={candidate.imageUrl} name={candidate.name} size={40} />
                <span className="evm-name">{candidate.name}</span>
                <span className="evm-indicator" aria-hidden="true">
                  <span className="evm-led" />
                  <span className="evm-vote-swatch" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {localError && <p style={{ color: '#dc2626', fontWeight: 600 }}>{localError}</p>}

      <div className="page-actions" style={{ justifyContent: 'space-between', width: '100%', marginTop: '1rem' }}>
        {editingFromReview ? (
          <button
            className="button"
            style={{ backgroundColor: '#6b7280' }}
            onClick={() => {
              setEditingFromReview(false);
              setPendingSelection(null);
              setReviewMode(true);
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            className="button"
            style={{ backgroundColor: '#6b7280' }}
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            disabled={currentIndex === 0}
          >
            Previous
          </button>
        )}

        <button
          className="button"
          onClick={handleNext}
          disabled={!activeSelection}
        >
          {editingFromReview
            ? 'Back to Review'
            : currentIndex < posts.length - 1
            ? 'Next'
            : allSelected
            ? 'Review & Submit'
            : 'Next'}
        </button>
      </div>
    </section>
  );
};
