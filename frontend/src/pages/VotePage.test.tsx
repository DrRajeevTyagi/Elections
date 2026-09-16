import { useEffect } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KioskProvider, useKiosk } from '../context/KioskContext';
import { VotePage } from './VotePage';
import type { PostCandidateGroup } from '../types/election';

const mockApi = vi.hoisted(() => ({
  activateKiosk: vi.fn(),
  fetchPosts: vi.fn(),
  submitVote: vi.fn(),
  deactivateKiosk: vi.fn()
}));

vi.mock('../services/api', () => mockApi);

const posts: PostCandidateGroup[] = [
  {
    post: 'HB',
    candidates: [
      { id: 'hb-1', name: 'Alice', post: 'HB' },
      { id: 'hb-2', name: 'Bob', post: 'HB' }
    ]
  },
  {
    post: 'HG',
    candidates: [
      { id: 'hg-1', name: 'Carol', post: 'HG' },
      { id: 'hg-2', name: 'Dana', post: 'HG' }
    ]
  }
] as PostCandidateGroup[];

// Drives the context to 'ready' (mirroring ActivationPage) so VotePage
// renders instead of redirecting away for an idle session.
const Harness = () => {
  const { activate, status } = useKiosk();
  useEffect(() => {
    void activate('secret');
  }, [activate]);

  if (status === 'idle' || status === 'activating') {
    return <p>loading</p>;
  }
  return <VotePage />;
};

const renderVotePage = () => {
  mockApi.activateKiosk.mockResolvedValue({ token: 'token-1', officerName: 'Officer X', stationVoteCount: 0 });
  mockApi.fetchPosts.mockResolvedValue({ posts });
  mockApi.submitVote.mockResolvedValue({ voteId: 'vote-1', timestamp: 1700000000000, stationVoteCount: 1 });
  mockApi.deactivateKiosk.mockResolvedValue(undefined);

  return render(
    <MemoryRouter initialEntries={['/kiosk/vote']}>
      <KioskProvider>
        <Harness />
      </KioskProvider>
    </MemoryRouter>
  );
};

const walkToReview = async () => {
  fireEvent.click(await screen.findByText('Alice'));
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(await screen.findByText('Carol'));
  fireEvent.click(screen.getByText('Review & Submit'));
  expect(await screen.findByText('Review Your Selections')).toBeInTheDocument();
};

describe('VotePage review Change/Cancel flow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('discards a re-pick when the voter cancels out of the change screen', async () => {
    renderVotePage();
    await walkToReview();

    // Review shows the original picks.
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();

    // Enter "Change" for the HB row, click a different candidate, then Cancel.
    fireEvent.click(screen.getAllByText('Change')[0]);
    fireEvent.click(await screen.findByText('Bob'));
    fireEvent.click(screen.getByText('Cancel'));

    // Back on review: HB must still show the original pick (Alice), not Bob.
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Submit Ballot'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi.submitVote).toHaveBeenCalledWith('token-1', {
      selections: { HB: 'hb-1', HG: 'hg-1' }
    });
  });

  it('applies a re-pick once confirmed with Back to Review', async () => {
    renderVotePage();
    await walkToReview();

    fireEvent.click(screen.getAllByText('Change')[0]);
    fireEvent.click(await screen.findByText('Bob'));
    fireEvent.click(screen.getByText('Back to Review'));

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Submit Ballot'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi.submitVote).toHaveBeenCalledWith('token-1', {
      selections: { HB: 'hb-2', HG: 'hg-1' }
    });
  });
});

describe('VotePage house indicator', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows which house is active when a house-bound code auto-selects it', async () => {
    mockApi.activateKiosk.mockResolvedValue({
      token: 'token-1',
      officerName: 'Officer X',
      house: 'Anand',
      stationVoteCount: 0
    });
    mockApi.fetchPosts.mockResolvedValue({ posts });
    mockApi.submitVote.mockResolvedValue({ voteId: 'vote-1', timestamp: 1700000000000, stationVoteCount: 1 });
    mockApi.deactivateKiosk.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/kiosk/vote']}>
        <KioskProvider>
          <Harness />
        </KioskProvider>
      </MemoryRouter>
    );

    // The house the code auto-selected must be visible on the ballot screen
    // itself, not just implied by which candidates happen to show up.
    await screen.findByText('Select Your Candidate');
    expect(screen.getAllByText('Anand House').length).toBeGreaterThan(0);

    fireEvent.click(await screen.findByText('Alice'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(await screen.findByText('Carol'));
    fireEvent.click(screen.getByText('Review & Submit'));

    // Still shown on the review screen.
    expect(await screen.findByText('Review Your Selections')).toBeInTheDocument();
    expect(screen.getAllByText('Anand House').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Submit Ballot'));

    // And on the post-vote confirmation screen.
    await screen.findByText('Vote Recorded');
    expect(screen.getAllByText('Anand House').length).toBeGreaterThan(0);
  });
});
