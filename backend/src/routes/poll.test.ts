import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionRun, PollState } from '../types/election.js';

// Regression test: the "Election for X Posts" banner (AppLayout.tsx, shared
// by the admin dashboard and the kiosk) used to trust activeElectionType
// alone, which never resets once an election ends via most paths -- so it
// kept announcing an election that was no longer happening. hasActiveRun
// lets the banner tell "genuinely running" apart from "just a leftover
// value," self-healing any already-stale activeElectionType in storage
// without needing a data migration.

const mockedDataStore = {
  getPollState: vi.fn<[], PollState>(),
  getCurrentRun: vi.fn<[], ElectionRun | undefined>()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

const runningRun: ElectionRun = {
  id: 'run-1',
  electionType: 'house',
  name: 'Test Run',
  status: 'running',
  startedAt: Date.now(),
  startedBy: 'actor-1'
};

describe('GET /api/poll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports hasActiveRun: false even when activeElectionType is stale (no run active)', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'house', // leftover from a run that already closed
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/poll');

    expect(response.status).toBe(200);
    expect(response.body.poll.activeElectionType).toBe('house');
    expect(response.body.poll.hasActiveRun).toBe(false);
  });

  it('reports hasActiveRun: true while a run is genuinely active', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'house',
      settings: { isOpen: true, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);

    const { createApp } = await import('../app.js');
    const response = await request(createApp()).get('/api/poll');

    expect(response.status).toBe(200);
    expect(response.body.poll.hasActiveRun).toBe(true);
  });
});
