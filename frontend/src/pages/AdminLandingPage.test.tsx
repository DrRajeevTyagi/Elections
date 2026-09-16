import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminLandingPage } from './AdminLandingPage';

const mockApi = vi.hoisted(() => ({
  closePoll: vi.fn(),
  getPollStatus: vi.fn(),
  getResults: vi.fn(),
  openPoll: vi.fn(),
  resetPoll: vi.fn(),
  updateCandidate: vi.fn(),
  deleteCandidate: vi.fn(),
  addCandidate: vi.fn(),
  setElectionType: vi.fn(),
  verifyAdminSecret: vi.fn(),
  getOfficerCodes: vi.fn(),
  generateOfficerCodes: vi.fn(),
  updateOfficerCode: vi.fn(),
  deleteOfficerCode: vi.fn(),
  reopenOfficerCode: vi.fn(),
  getArchivesList: vi.fn()
}));

vi.mock('../services/api', () => mockApi);

const unlockAsAdmin = async () => {
  render(<AdminLandingPage />);
  await screen.findByText('Admin Login');
  fireEvent.change(screen.getByPlaceholderText('Enter admin secret'), { target: { value: 'testadmin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Admin Dashboard' }));
  await screen.findByText('Poll Controls');
};

describe('AdminLandingPage tabs', () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows the Dashboard tab by default and switches to Officer Codes and History', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'house', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({
      results: [
        {
          post: 'HC',
          candidates: [
            {
              candidate: { id: 'anand-hc-1', name: 'Riya', post: 'HC', electionType: 'house', house: 'Anand' },
              total: 3
            }
          ]
        }
      ]
    });
    mockApi.getOfficerCodes.mockResolvedValue({
      codes: [
        { code: 'ABC123', officerName: 'Jane', house: 'Anand', createdAt: 1, voteCount: 0 },
        { code: 'DEF456', officerName: '', createdAt: 2, voteCount: 0 }
      ]
    });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });

    await unlockAsAdmin();

    // Dashboard tab content visible by default; other tabs' content is not.
    // ("Election History" is checked as a heading, not by text, since that
    // string is also the always-visible tab button's label.)
    expect(screen.getByText('Poll Controls')).toBeInTheDocument();
    expect(screen.queryByText('Generate codes for House Elections')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Election History' })).not.toBeInTheDocument();

    // Switch to Live Results tab -- this is the tab meant to be projected
    // alone on a large monitor, so it must show real vote data grouped by
    // house and hide the rest of the admin UI.
    fireEvent.click(screen.getByRole('button', { name: 'Live Results' }));
    await screen.findByText('Riya');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Present Full Screen/ })).toBeInTheDocument();
    expect(screen.queryByText('Poll Controls')).not.toBeInTheDocument();

    // Switch to Officer Codes tab.
    fireEvent.click(screen.getByRole('button', { name: /Polling Officer Codes/ }));
    await screen.findByText('Generate codes for House Elections');
    expect(screen.getByText('Generate codes for School Posts')).toBeInTheDocument();
    // Codes loaded from the mock are grouped by house.
    await waitFor(() => expect(screen.getByText('Anand House (1)')).toBeInTheDocument());
    expect(screen.getByText('School Posts (1)')).toBeInTheDocument();
    expect(screen.queryByText('Poll Controls')).not.toBeInTheDocument();

    // Switch to Election History tab.
    fireEvent.click(screen.getByRole('button', { name: 'Election History' }));
    await screen.findByText('No past elections have been archived yet.');
    expect(screen.queryByText('Generate codes for House Elections')).not.toBeInTheDocument();

    // And back to Dashboard.
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await screen.findByText('Poll Controls');
    expect(screen.queryByText('No past elections have been archived yet.')).not.toBeInTheDocument();
  });
});
