import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminLandingPage } from './AdminLandingPage';

const mockApi = vi.hoisted(() => ({
  closePoll: vi.fn(),
  getPollStatus: vi.fn(),
  getResults: vi.fn(),
  openPoll: vi.fn(),
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
  closeOfficerCode: vi.fn(),
  getArchivesList: vi.fn(),
  getStorageHealth: vi.fn().mockResolvedValue({ ok: true, lastSuccessAt: null, lastErrorAt: null }),
  logoutAdmin: vi.fn(),
  setAdminSessionLostHandler: vi.fn(),
  getCurrentRun: vi.fn().mockResolvedValue({ run: null }),
  getRuns: vi.fn().mockResolvedValue({ runs: [] }),
  searchRunLog: vi.fn().mockResolvedValue({ entries: [] }),
  startRecording: vi.fn(),
  closeRecording: vi.fn(),
  getAdminSessionStatus: vi.fn().mockResolvedValue({ pendingRequest: null }),
  requestAdminTakeover: vi.fn(),
  getAdminTakeoverRequest: vi.fn(),
  cancelAdminTakeover: vi.fn(),
  respondToAdminTakeover: vi.fn(),
  startFreshDuties: vi.fn(),
  removeAllOfficerCodes: vi.fn(),
  getVoteBreakdown: vi.fn(() => Promise.resolve([]))
}));

vi.mock('../services/api', () => mockApi);

const unlockAsAdmin = async () => {
  render(<AdminLandingPage />);
  await screen.findByText('Admin Login');
  fireEvent.change(screen.getByPlaceholderText('Enter admin secret'), { target: { value: 'testadmin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Admin Dashboard' }));
  await screen.findByText('Poll Controls');
};

describe('AdminLandingPage login while another device is in control', () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('offers to ask the device in control, instead of a forced takeover', async () => {
    mockApi.verifyAdminSecret.mockRejectedValue(
      Object.assign(new Error('The admin console is in use on Laptop A (since 9:05:00 AM).'), {
        errorCode: 'ADMIN_SESSION_CONFLICT',
        errorDetails: { holderLabel: 'Laptop A' }
      })
    );
    render(<AdminLandingPage />);
    await screen.findByText('Admin Login');
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret'), { target: { value: 'testadmin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Admin Dashboard' }));

    expect(await screen.findByText(/in use on Laptop A/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask for Control' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take Over/ })).not.toBeInTheDocument();
  });
});

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
    expect(screen.queryByText('Upload the teacher list')).not.toBeInTheDocument();
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
    // "3" appears twice here: Riya's own vote count, and the per-post
    // "Total votes for this post" summary row below the candidate list --
    // with a single candidate, those two numbers are always equal.
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByText('Total votes for this post')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Present Full Screen/ })).toBeInTheDocument();
    expect(screen.queryByText('Poll Controls')).not.toBeInTheDocument();
    // Locks in the compact, deterministic house grid (see admin.css
    // .live-house-grid) so a future change can't silently regress back to
    // an auto-fit layout that wastes space and won't fit all 8 houses.
    expect(document.querySelector('.live-house-grid')).toBeInTheDocument();
    expect(document.querySelector('.live-house-card')).toBeInTheDocument();

    // Switch to Officer Codes tab.
    fireEvent.click(screen.getByRole('button', { name: /Polling Officer Codes/ }));
    await screen.findByText('Upload the teacher list');
    // One election at a time: School first (nothing is running), then House,
    // whose codes are grouped by house.
    await waitFor(() => expect(screen.getByText('School Posts (1)')).toBeInTheDocument());
    expect(screen.queryByText('Anand House (1)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'House' }));
    expect(screen.getByText('Anand House (1)')).toBeInTheDocument();
    expect(screen.queryByText('School Posts (1)')).not.toBeInTheDocument();
    expect(screen.queryByText('Poll Controls')).not.toBeInTheDocument();

    // Switch to Election History tab.
    fireEvent.click(screen.getByRole('button', { name: 'Election History' }));
    await screen.findByText('No past elections have been archived yet.');
    expect(screen.queryByText('Upload the teacher list')).not.toBeInTheDocument();

    // And back to Dashboard.
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await screen.findByText('Poll Controls');
    expect(screen.queryByText('No past elections have been archived yet.')).not.toBeInTheDocument();
  });

  it('Officer Codes tab, Election day: an open booth shows Close Booth; a closed one shows Reopen', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getOfficerCodes.mockResolvedValue({
      codes: [
        { code: 'OPEN01', officerName: 'Mrs. Sharma', createdAt: 1, voteCount: 0 },
        { code: 'SHUT01', officerName: 'Mr. Rao', createdAt: 2, voteCount: 0, closedAt: Date.now() }
      ]
    });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Polling Officer Codes/ }));
    // Nothing is running, so it opens on step 1; go to Election day.
    await screen.findByText('Upload the teacher list');
    fireEvent.click(screen.getByRole('tab', { name: /Election day/ }));
    await screen.findByText('OPEN01');

    // Admin can close the still-open booth directly from here, without
    // opening a kiosk tab and entering the code there.
    const closeButtons = screen.getAllByRole('button', { name: 'Close Booth' });
    expect(closeButtons).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reopen' })).toHaveLength(1);

    mockApi.closeOfficerCode.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(closeButtons[0]);

    await waitFor(() => expect(mockApi.closeOfficerCode).toHaveBeenCalledWith('OPEN01', 'testadmin'));
    confirmSpy.mockRestore();
  });

  it('Officer Codes tab: opens on Election day while that election runs; Re-poll only for its booths; a re-polled booth shows its new code', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: true, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getCurrentRun.mockResolvedValue({
      run: { id: 'run-1', electionType: 'school', name: 'Test', status: 'running', startedAt: 1, startedBy: 'x' }
    });
    mockApi.getOfficerCodes.mockResolvedValue({
      codes: [
        { code: 'SCH001', officerName: 'Mrs. Sharma', electionType: 'school', createdAt: 1, voteCount: 12 },
        { code: 'HSE001', officerName: 'Mr. Rao', electionType: 'house', house: 'Anand', createdAt: 2, voteCount: 0 },
        {
          code: 'OLD001',
          officerName: 'Ms. Iyer',
          electionType: 'school',
          createdAt: 3,
          voteCount: 0,
          closedAt: 4,
          repoll: { orderedAt: 4, orderedBy: 'x', reason: 'disruption', note: '', cancelledVoteCount: 7, replacementCode: 'NEW001' }
        },
        { code: 'NEW001', officerName: 'Ms. Iyer', electionType: 'school', createdAt: 4, voteCount: 0, replacesCode: 'OLD001' }
      ]
    });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });

    try {
      await unlockAsAdmin();
      fireEvent.click(screen.getByRole('button', { name: /Polling Officer Codes/ }));
      await screen.findByText('SCH001');
      expect(screen.getByRole('tab', { name: /Election day/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getAllByText(/Before End of Voting/).length).toBeGreaterThan(0);

      // SCH001 and NEW001 (School, running) -- not the re-polled one, and
      // the House code isn't in the School view at all.
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Re-poll' })).toHaveLength(2));
      expect(screen.queryByText('HSE001')).not.toBeInTheDocument();
      expect(screen.getByText('Re-polled → NEW001')).toBeInTheDocument();
      expect(screen.getByText(/7 votes cancelled/)).toBeInTheDocument();
      expect(screen.getByText('Re-poll of OLD001')).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole('button', { name: 'Re-poll' })[0]);
      expect(await screen.findByRole('dialog')).toHaveTextContent('This cancels all 12 votes cast at booth SCH001');
    } finally {
      mockApi.getCurrentRun.mockResolvedValue({ run: null });
    }
  });

  it('Officer Codes tab, step 1: colours and counts each code, filters by colour, edits a name, resets colours, removes all', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: null, settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getOfficerCodes.mockResolvedValue({
      codes: [
        { code: 'FRESH1', officerName: 'A', electionType: 'school', createdAt: 1, voteCount: 0 },
        { code: 'SENT01', officerName: 'B', electionType: 'school', createdAt: 2, voteCount: 0, sentAt: 10 },
        { code: 'READY1', officerName: 'C', electionType: 'school', createdAt: 3, voteCount: 0, sentAt: 10, readyAt: 20 },
        { code: 'OVER01', officerName: 'D', electionType: 'school', createdAt: 4, voteCount: 5, sentAt: 10, readyAt: 20, closedAt: 30 }
      ]
    });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });
    mockApi.startFreshDuties.mockResolvedValue(4);
    mockApi.updateOfficerCode.mockResolvedValue(undefined);
    mockApi.removeAllOfficerCodes.mockResolvedValue(4);

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Polling Officer Codes/ }));
    await screen.findByText('FRESH1');

    const dutyOf = (code: string) => screen.getByText(code).closest('tr')?.getAttribute('data-duty');
    expect(dutyOf('FRESH1')).toBe('fresh');
    expect(dutyOf('SENT01')).toBe('sent');
    expect(dutyOf('READY1')).toBe('ready');
    expect(dutyOf('OVER01')).toBe('over');
    expect(screen.getByText('3 of 4')).toBeInTheDocument(); // sent (or already ready) so far

    // Tapping a colour count shows just those codes.
    fireEvent.click(screen.getByRole('button', { name: 'Sent, not ready 1' }));
    expect(screen.getByText('SENT01')).toBeInTheDocument();
    expect(screen.queryByText('FRESH1')).not.toBeInTheDocument();
    expect(screen.queryByText('READY1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Left from last election 1' }));
    expect(screen.getByText('OVER01')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All 4' }));

    // Names are changed one row at a time, with Edit.
    const freshRow = screen.getByText('FRESH1').closest('tr') as HTMLElement;
    fireEvent.click(within(freshRow).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Teacher for code FRESH1'), { target: { value: 'Anil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.updateOfficerCode).toHaveBeenCalledWith('FRESH1', { officerName: 'Anil' }, 'testadmin'));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Colours to White' }));
    await waitFor(() => expect(mockApi.startFreshDuties).toHaveBeenCalledWith('school', 'testadmin'));
    confirmSpy.mockRestore();

    // Remove All needs CONFIRM typed first.
    fireEvent.click(screen.getByRole('button', { name: 'Remove All School Codes' }));
    const removeButton = screen.getByRole('button', { name: 'Remove All 4 Codes' });
    expect(removeButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type CONFIRM to go ahead'), { target: { value: 'CONFIRM' } });
    fireEvent.click(removeButton);
    await waitFor(() => expect(mockApi.removeAllOfficerCodes).toHaveBeenCalledWith('school', 'testadmin'));
  });

  it('Dashboard: shows what is left before End of Voting, and a ready line once everything is sealed', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getCurrentRun.mockResolvedValue({
      run: { id: 'run-1', electionType: 'school', name: 'Test', status: 'running', startedAt: 1, startedBy: 'x' }
    });
    const seal = { sealedAt: 1, sealedBy: 'x', paperListCount: 0, appCount: 0 };
    mockApi.getOfficerCodes.mockResolvedValue({
      codes: [
        { code: 'SPARE1', officerName: '', electionType: 'school', createdAt: 1, voteCount: 0 },
        { code: 'OPEN01', officerName: 'A', electionType: 'school', createdAt: 1, voteCount: 3, branch: 'AN' },
        { code: 'OPEN02', officerName: 'B', electionType: 'school', createdAt: 1, voteCount: 0 },
        { code: 'SHUT01', officerName: 'C', electionType: 'school', createdAt: 1, voteCount: 0, closedAt: 2 },
        { code: 'DONE01', officerName: 'D', electionType: 'school', createdAt: 1, voteCount: 0, closedAt: 2, seal },
        { code: 'HOUSE1', officerName: 'E', electionType: 'house', house: 'Anand', createdAt: 1, voteCount: 0 }
      ]
    });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });

    try {
      await unlockAsAdmin();
      const todo = await screen.findByLabelText('Before End of Voting');
      expect(todo).toHaveTextContent('Booths still polling — close, then Verify & Seal: 2');
      expect(todo).toHaveTextContent('Closed booths waiting for Verify & Seal: 1');
      expect(todo).toHaveTextContent('Unallotted codes to delete: 1');
    } finally {
      mockApi.getCurrentRun.mockResolvedValue({ run: null });
    }
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
    expect(grid?.textContent).not.toContain('Integrity Captain');
  });

  it('adds an Integrity Captain card, last, to AN\'s School Elections live results', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({
      results: [
        { post: 'HB', candidates: [{ candidate: { id: 'hb-1', name: 'Alex', post: 'HB', electionType: 'school', branch: 'AN' }, total: 5 }] },
        { post: 'IC', candidates: [{ candidate: { id: 'ic-1', name: 'Isha', post: 'IC', electionType: 'school', branch: 'AN' }, total: 2 }] }
      ],
      totalVotes: 5
    });
    mockApi.getOfficerCodes.mockResolvedValue({ codes: [] });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Live Results' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'AN' }));
    await screen.findByText('Isha');

    const headings = Array.from(document.querySelectorAll('.live-school-grid .live-post-card h3'));
    expect(headings).toHaveLength(6);
    expect(headings[5]).toHaveTextContent('Integrity Captain');
    const backgroundColors = new Set(headings.map((h) => (h as HTMLElement).style.backgroundColor));
    expect(backgroundColors.size).toBe(6);
  });

  it('shows the election-in-progress banner, and leaves officer-code generation ungated regardless of the active election type', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'house', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getOfficerCodes.mockResolvedValue({ codes: [] });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });
    mockApi.getCurrentRun.mockResolvedValue({
      run: {
        id: 'run-1',
        electionType: 'school',
        name: 'Test Run',
        status: 'running',
        startedAt: Date.now(),
        startedBy: 'Rajeev -- laptop'
      }
    });

    await unlockAsAdmin();

    // Dashboard shows the election-in-progress banner.
    await screen.findByText(/ELECTION IN PROGRESS: Test Run/);

    // Officer Codes tab, More: making codes is prep work, not tied to the
    // running election -- it stays enabled for School and House alike.
    fireEvent.click(screen.getByRole('button', { name: /Polling Officer Codes/ }));
    fireEvent.click(await screen.findByRole('tab', { name: /More/ }));
    expect(screen.getByRole('button', { name: 'Make Codes' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'House' }));
    expect(screen.getByLabelText('House')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make Codes' })).not.toBeDisabled();
  });

  it('Activity Log "Who were the polling officers?" searches officerCode.name entries and shows the result', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getOfficerCodes.mockResolvedValue({ codes: [] });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });
    mockApi.getCurrentRun.mockResolvedValue({ run: null });
    mockApi.getRuns.mockResolvedValue({
      runs: [{ id: 'run-1', electionType: 'school', name: 'Term 1', status: 'closed', startedAt: Date.now(), startedBy: 'Rajeev' }]
    });
    mockApi.searchRunLog.mockResolvedValue({ entries: [] });

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Activity Log/ }));
    await screen.findByText('👥 Who were the polling officers?');

    mockApi.searchRunLog.mockResolvedValue({
      entries: [
        {
          id: 'log-1',
          timestamp: Date.now(),
          runId: 'run-1',
          actor: 'Rajeev -- laptop',
          action: 'officerCode.name',
          details: { code: 'ab2k7m', officerName: 'Mrs. Sharma' },
          electionType: 'school',
          branch: 'dwarka'
        }
      ]
    });
    fireEvent.click(screen.getByText('👥 Who were the polling officers?'));

    await screen.findByText('Mrs. Sharma', { exact: false });
    expect(mockApi.searchRunLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'officerCode.name' }),
      expect.any(String)
    );
  });

  it('Activity Log lists past elections by name; clicking one filters the log to just that election', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getOfficerCodes.mockResolvedValue({ codes: [] });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });
    mockApi.getCurrentRun.mockResolvedValue({ run: null });
    mockApi.getRuns.mockResolvedValue({
      runs: [
        { id: 'run-2', electionType: 'house', name: 'House Elections -- Term 1', status: 'closed', startedAt: Date.now(), startedBy: 'Rajeev' },
        { id: 'run-1', electionType: 'school', name: 'School Elections -- Term 1', status: 'closed', startedAt: Date.now() - 1000, startedBy: 'Rajeev' }
      ]
    });
    mockApi.searchRunLog.mockResolvedValue({ entries: [] });

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Activity Log/ }));

    // Both elections show up as named, clickable entries, not just inside a
    // dropdown -- this is the whole point of the feature.
    await screen.findByRole('button', { name: /House Elections -- Term 1/ });
    screen.getByRole('button', { name: /School Elections -- Term 1/ });

    mockApi.searchRunLog.mockResolvedValue({
      entries: [
        {
          id: 'log-1',
          timestamp: Date.now(),
          runId: 'run-2',
          actor: 'Rajeev -- laptop',
          action: 'run.start',
          details: {},
          electionType: 'house',
          branch: 'dwarka'
        }
      ]
    });
    fireEvent.click(screen.getByRole('button', { name: /House Elections -- Term 1/ }));

    // One click, no separate Search press, and no other filter set -- the
    // whole point is this is a direct shortcut, not a form to fill in.
    await waitFor(() =>
      expect(mockApi.searchRunLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ runId: 'run-2', electionType: undefined, branch: undefined, actor: undefined, action: undefined, code: undefined }),
        expect.any(String)
      )
    );
    // Shown as a plain sentence, not the stored action name.
    await screen.findByText('Rajeev -- laptop started the election.');
  });

  it('"Start the Voting Process" wizard walks through every step and opens the poll in one flow', async () => {
    mockApi.verifyAdminSecret.mockResolvedValue(undefined);
    mockApi.getPollStatus.mockResolvedValue({
      poll: { activeElectionType: 'school', settings: { isOpen: false, allowRevote: false } }
    });
    mockApi.getResults.mockResolvedValue({ results: [], totalVotes: 0 });
    mockApi.getOfficerCodes.mockResolvedValue({ codes: [] });
    mockApi.getArchivesList.mockResolvedValue({ archives: [] });
    mockApi.getCurrentRun.mockResolvedValue({ run: null });
    const startedRun = {
      id: 'run-1',
      electionType: 'school',
      name: 'Term 1 2026',
      status: 'running',
      startedAt: Date.now(),
      startedBy: 'Rajeev -- laptop'
    };
    mockApi.startRecording.mockResolvedValue(startedRun);
    mockApi.openPoll.mockResolvedValue({ poll: { activeElectionType: 'school', settings: { isOpen: true, allowRevote: false } } });

    await unlockAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Start the Voting Process/ }));

    // a. Select the election type -- picking the one already active
    // ('school', matching pollStatus) requires no API call.
    await screen.findByText('Select the Election type (School or House)');
    fireEvent.click(screen.getByRole('button', { name: /🏫 School/ }));
    expect(mockApi.setElectionType).not.toHaveBeenCalled();

    // b. Vote counts reset notice
    await screen.findByText(/Starting this election resets/i);
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));

    // c. Codes generated? (none exist -- still allowed to proceed)
    await screen.findByText(/No School codes have been generated yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));

    // d. Codes allotted to persons?
    await screen.findByText(/allotted their code/);
    fireEvent.click(screen.getByRole('button', { name: /Yes, allotted/ }));

    // e. Candidates lock notice
    await screen.findByText(/Candidates cannot be changed/);
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));

    // f. Name it -- now the last checklist step, right before opening.
    await screen.findByLabelText('Election name');
    fireEvent.change(screen.getByLabelText('Election name'), { target: { value: 'Term 1 2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // g. Open the poll -- the one continuous commit.
    await screen.findByRole('button', { name: /Open the Poll/ });
    mockApi.getCurrentRun.mockResolvedValue({ run: startedRun });
    fireEvent.click(screen.getByRole('button', { name: /Open the Poll/ }));

    await screen.findByText(/Voting is now open for School Elections/);
    expect(mockApi.startRecording).toHaveBeenCalledWith('school', 'Term 1 2026', expect.any(String));
    expect(mockApi.openPoll).toHaveBeenCalled();
  });
});
