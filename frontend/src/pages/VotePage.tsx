import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../context/KioskContext';
import type { PostCandidateGroup, PostId } from '../types/election';
import './Page.css';

const POST_NAMES: Record<PostId, string> = {
  HB: 'Head Boy',
  HG: 'Head Girl',
  SSC: 'School Sports Captain',
  SRC: 'School Resources Captain',
  SCC: 'School Cultural Captain'
};

export const VotePage = (): JSX.Element => {
  const { posts, selections, updateSelection, submit, status, error, confirmation, reset } = useKiosk();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [reviewMode, setReviewMode] = useState(false);

  useEffect(() => {
    if (status === 'idle') {
      navigate('/kiosk');
    } else if (status === 'error' && error) {
      setLocalError(error);
    }
  }, [error, navigate, status]);

  const currentPost: PostCandidateGroup | undefined = posts[currentIndex];
  const allSelected = useMemo(() => posts.every((group) => Boolean(selections[group.post])), [posts, selections]);

  const handleSelect = (post: PostId, candidateId: string) => {
    updateSelection(post, candidateId);
    setLocalError(undefined);
  };

  const handleNext = () => {
    if (currentIndex < posts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (allSelected && !reviewMode) {
      setReviewMode(true);
      setCurrentIndex(0);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setLocalError(undefined);
    try {
      await submit();
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
        <p>Your ballot was submitted successfully.</p>
        <p>
          Receipt: <strong>{confirmation.voteId}</strong>
        </p>
        <p>Timestamp: {new Date(confirmation.timestamp).toLocaleString()}</p>
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

  const selectedCandidate = currentPost.candidates.find(
    (c) => c.id === selections[currentPost.post]
  );

  return (
    <section className="page-card">
      {/* Progress indicator */}
      <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
          {reviewMode ? '✓ Review Your Choices' : `Step ${currentIndex + 1} of ${posts.length}`}
        </p>
      </div>

      {reviewMode ? (
        <>
          <h1 style={{ color: '#16a34a' }}>Review Your Selection</h1>
          <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>
            {POST_NAMES[currentPost.post]} ({currentPost.post})
          </p>
          <div style={{ 
            padding: '1.5rem', 
            backgroundColor: '#f0fdf4', 
            borderRadius: '12px',
            border: '2px solid #16a34a',
            marginBottom: '1rem'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#15803d', fontWeight: 600 }}>
              Your choice:
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.2rem', fontWeight: 600, color: '#166534' }}>
              {selectedCandidate?.name}
            </p>
          </div>
          <p style={{ fontSize: '0.95rem', color: '#6b7280' }}>
            {currentIndex < posts.length - 1 
              ? 'Click "Next" to review your next selection.'
              : 'Click "Submit Ballot" to cast your vote, or "Previous" to review your choices.'}
          </p>
        </>
      ) : (
        <>
          <h1>Select Your Candidate</h1>
          <p style={{ fontSize: '1.1rem', fontWeight: 500, color: '#1f2937' }}>
            {POST_NAMES[currentPost.post]} ({currentPost.post})
          </p>
          <p style={{ fontSize: '0.95rem', color: '#6b7280', marginTop: '-0.5rem' }}>
            Choose one candidate from the list below:
          </p>

          <div className="page-actions" style={{ flexDirection: 'column', gap: '1rem' }}>
            {currentPost.candidates.map((candidate) => {
              const isSelected = selections[currentPost.post] === candidate.id;
              return (
                <button
                  key={candidate.id}
                  className="button"
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? '#16a34a' : '#1c64f2'
                  }}
                  onClick={() => handleSelect(currentPost.post, candidate.id)}
                >
                  <span>{candidate.name}</span>
                  {isSelected && <span>✓ Selected</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {localError && <p style={{ color: '#dc2626', fontWeight: 600 }}>{localError}</p>}

      <div className="page-actions" style={{ justifyContent: 'space-between', width: '100%', marginTop: '1rem' }}>
        <button
          className="button"
          style={{ backgroundColor: '#6b7280' }}
          onClick={() => {
            if (currentIndex === 0 && reviewMode) {
              setReviewMode(false);
            }
            setCurrentIndex((index) => Math.max(0, index - 1));
          }}
          disabled={currentIndex === 0 && !reviewMode}
        >
          {reviewMode && currentIndex === 0 ? 'Back to Voting' : 'Previous'}
        </button>

        {reviewMode ? (
          currentIndex < posts.length - 1 ? (
            <button
              className="button"
              onClick={handleNext}
            >
              Next
            </button>
          ) : (
            <button 
              className="button" 
              onClick={handleSubmit} 
              disabled={submitting}
              style={{ backgroundColor: '#16a34a' }}
            >
              {submitting ? 'Submitting...' : 'Submit Ballot'}
            </button>
          )
        ) : (
          <button
            className="button"
            onClick={handleNext}
            disabled={!selections[currentPost.post]}
          >
            {currentIndex < posts.length - 1 ? 'Next' : allSelected ? 'Review & Submit' : 'Next'}
          </button>
        )}
      </div>
    </section>
  );
};
