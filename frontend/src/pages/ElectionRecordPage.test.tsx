import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectionRecordPage } from './ElectionRecordPage';
import type { ElectionRecordResponse } from '../types/api';

const mockApi = vi.hoisted(() => ({
  getElectionRecord: vi.fn()
}));

vi.mock('../services/api', () => mockApi);

const record: ElectionRecordResponse = {
  run: {
    id: 'run-1',
    electionType: 'school',
    name: 'School Elections 2026',
    status: 'closed',
    startedAt: Date.UTC(2026, 9, 9, 3, 0),
    startedBy: 'Rajeev',
    closedAt: Date.UTC(2026, 9, 9, 9, 0),
    closedBy: 'Rajeev',
    archiveIds: ['arch-1']
  },
  final: true,
  report: {
    id: 'arch-1',
    archivedAt: Date.UTC(2026, 9, 9, 9, 0),
    electionType: 'school',
    totalVotes: 40,
    totalVotesByBranch: { dwarka: 25, AN: 15 },
    results: [
      { candidateId: 'hb-1', name: 'Asha', post: 'HB', total: 22, branch: 'dwarka' },
      { candidateId: 'hb-2', name: 'Ravi', post: 'HB', total: 18, branch: 'dwarka' },
      { candidateId: 'hb-9', name: 'Kabir', post: 'HB', total: 29, branch: 'AN' }
    ],
    officerCodes: [
      {
        code: 'old111',
        officerName: 'Mrs. Sharma',
        voteCount: 0,
        branch: 'dwarka',
        cancelledVoteCount: 12,
        cancelledByCandidate: [
          { post: 'HB', candidateId: 'hb-1', name: 'Asha', count: 7 },
          { post: 'HB', candidateId: 'hb-2', name: 'Ravi', count: 5 }
        ],
        repollReason: 'count-mismatch',
        replacementCode: 'new999'
      },
      { code: 'new999', officerName: 'Mrs. Sharma', voteCount: 11, branch: 'dwarka', replacesCode: 'old111', paperListCount: 11 },
      { code: 'ccc333', officerName: 'Mr. Khan', voteCount: 29, branch: 'AN', paperListCount: 29 }
    ]
  },
  log: [
    { id: 'l1', timestamp: 1, runId: 'run-1', actor: 'Rajeev', action: 'run.start', details: { name: 'School Elections 2026' } },
    { id: 'l2', timestamp: 2, runId: 'run-1', actor: 'Rajeev', action: 'officerCode.name', details: { code: 'ccc333', officerName: 'Mr. Khan' }, branch: 'AN' },
    { id: 'l3', timestamp: 3, runId: 'run-1', actor: 'Rajeev', action: 'officerCode.seal', details: { code: 'ccc333', officerName: 'Mr. Khan', paperListCount: 29, appCount: 29 }, branch: 'AN' }
  ]
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/record/run-1']}>
      <Routes>
        <Route path="/admin/record/:runId" element={<ElectionRecordPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ElectionRecordPage', () => {
  beforeEach(() => {
    sessionStorage.setItem('adminSecret', 'secret');
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the summary, winners, every booth with its re-poll, and the story in plain sentences', async () => {
    mockApi.getElectionRecord.mockResolvedValue(record);
    renderPage();

    expect(await screen.findByText('Election Record — School Elections')).toBeInTheDocument();
    expect(screen.getByText('Dwarka 25 · AN 15')).toBeInTheDocument();
    expect(screen.getByText('1 — 12 votes cancelled in all')).toBeInTheDocument();
    // Each branch has its own winner -- AN's higher count doesn't beat Dwarka's.
    expect(screen.getByText('Asha (22)')).toBeInTheDocument();
    expect(screen.getByText('Kabir (29)')).toBeInTheDocument();
    expect(screen.getByText('Re-polled → new999')).toBeInTheDocument();
    expect(screen.getByText(/Asha −7, Ravi −5/)).toBeInTheDocument();
    expect(screen.getByText('Rajeev started the election "School Elections 2026".')).toBeInTheDocument();
    expect(screen.getByText(/verified booth ccc333 \(Mr\. Khan\) against the Paper List/)).toBeInTheDocument();
    // The routine allotment step is counted, not listed.
    expect(screen.getByText(/1 code allotted to teachers/)).toBeInTheDocument();
    expect(screen.queryByText(/allotted code ccc333/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NOT FINAL YET/)).not.toBeInTheDocument();
    expect(mockApi.getElectionRecord).toHaveBeenCalledWith('run-1', 'secret', undefined);
  });

  it('warns that a running election is not final', async () => {
    mockApi.getElectionRecord.mockResolvedValue({ ...record, final: false, run: { ...record.run, status: 'running', closedAt: undefined } });
    renderPage();
    expect(await screen.findByText(/NOT FINAL YET/)).toBeInTheDocument();
    expect(screen.getByText('Still running')).toBeInTheDocument();
  });
});
