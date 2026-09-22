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
  getArchivesList: vi.fn(),
  getStorageHealth: vi.fn().mockResolvedValue({ ok: true, lastSuccessAt: null, lastErrorAt: null }),
  logoutAdmin: vi.fn(),
  setAdminSessionLostHandler: vi.fn()
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
      ],
      totalVotes: 3
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
    // Manage Candidates and Results Overview were moved/removed from the
    // Dashboard tab (see MULTI-BRANCH-EXPANSION-PLAN.md / TESTING-DEMO-SCRIPT.md)
    // -- lock in that neither still renders here.
    expect(screen.queryByRole('heading', { name: 'Manage Candidates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Results Overview' })).not.toBeInTheDocument();

    // Switch to the new Manage Candidates tab -- its own top-level tab now,
    // second after Dashboard.
    fireEvent.click(screen.getByRole('button', { name: 'Manage Candidates' }));
    await screen.findByRole('heading', { name: 'Manage Candidates' });
    expect(screen.getByText('Riya')).toBeInTheDocument();
    expect(screen.queryByText('Poll Controls')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await screen.findByText('Poll Controls');

    // Switch to Live Results tab -- this is the tab meant to be projected
    // alone on a large monitor, so it must show real vote data grouped by
    // house and hide the rest of the admin UI.
    fireEvent.click(screen.getByRole('button', { name: 'Live Results' }));
    await screen.findByText('Riya');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Present Full Screen/ })).toBeInTheDocument();
    expect(screen.queryByText('Poll Controls')).not.toBeInTheDocument();
    // Locks in the compact, deterministic house grid (see admin.css
    // .live-house-grid) so a future change can't silently regress back to
    // an auto-fit layout that wastes space and won't fit all 8 houses.
    expect(document.querySelector('.live-house-grid')).toBeInTheDocument();
    expect(document.querySelector('.live-house-card')).toBeInTheDocument();

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

  it('shows all 5 School Elections posts together in one live results grid', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({
      results: [
        { post: 'HB', candidates: [{ candidate: { id: 'hb-1', name: 'Alex', post: 'HB', electionType: 'school' }, total: 5 }] },
        { post: 'HG', candidates: [{ candidate: { id: 'hg-1', name: 'Sara', post: 'HG', electionType: 'school' }, total: 4 }] },
        { post: 'SSC', candidates: [{ candidate: { id: 'ssc-1', name: 'Kim', post: 'SSC', electionType: 'school' }, total: 2 }] },
        { post: 'SRC', candidates: [{ candidate: { id: 'src-1', name: 'Dan', post: 'SRC', electionType: 'school' }, total: 1 }] },
        { post: 'SCC', candidates: [{ candidate: { id: 'scc-1', name: 'Mia', post: 'SCC', electionType: 'school' }, total: 3 }] }
      ],
      totalVotes: 5
    });
    mockApi.getOfficerCodes.mockResolvedValue({ codes: [] });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Live Results' }));
    await screen.findByText('Alex');

    const grid = document.querySelector('.live-school-grid');
    expect(grid).toBeInTheDocument();
    expect(grid?.textContent).toContain('Head Boy');
    expect(grid?.textContent).toContain('Head Girl');
    expect(grid?.textContent).toContain('School Sports Captain');
    expect(grid?.textContent).toContain('School Resources Captain');
    expect(grid?.textContent).toContain('School Cultural Captain');
    // Every post's card gets its own distinct header color (see
    // constants/postColors.ts) rather than an identical black heading.
    const headings = Array.from(grid?.querySelectorAll('.live-post-card h3') ?? []);
    expect(headings).toHaveLength(5);
    const backgroundColors = new Set(headings.map((h) => (h as HTMLElement).style.backgroundColor));
    expect(backgroundColors.size).toBe(5);
  });
});
