import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, ElectionRun, PollState } from '../types/election.js';

// Regression test: candidate add/edit/delete used to be guarded on
// settings.isOpen alone -- "Pause Polling" sets isOpen to false without
// ending the election (the run stays active until End the Election
// Process), so a routine pause silently unlocked candidate edits mid
// election, contradicting StartElectionWizard's own "Candidates will be
// locked" step and risking a stranded ballot for anyone who'd already voted
// for the edited/deleted candidate before the pause.

const mockedDataStore = {
  getCandidates: vi.fn<[], Candidate[]>(),
  setCandidates: vi.fn(),
  getPollState: vi.fn<[], PollState>(),
  getCurrentRun: vi.fn<[], ElectionRun | undefined>()
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

vi.mock('../middleware/adminAuth.js', () => ({
  requireAdminSession: [(_req: unknown, _res: unknown, next: () => void) => next()],
  requireAdminSecret: [(_req: unknown, _res: unknown, next: () => void) => next()]
}));

const runningRun: ElectionRun = {
  id: 'run-1',
  electionType: 'school',
  name: 'Test Run',
  status: 'running',
  startedAt: Date.now(),
  startedBy: 'actor-1'
};

const candidate: Candidate = {
  id: 'hb-1',
  name: 'Dwarka Head Boy',
  post: 'HB',
  electionType: 'school',
  branch: 'dwarka'
};

describe('candidate add/edit/delete guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCandidates.mockReturnValue([candidate]);
  });

  it('is blocked while the poll is open', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      settings: { isOpen: true, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);

    const { createApp } = await import('../app.js');
    const app = createApp();

    const del = await request(app).delete('/api/candidates/hb-1');
    expect(del.status).toBe(403);
    expect(del.body.error).toContain('in progress');

    const put = await request(app).put('/api/candidates/hb-1').send({ name: 'Renamed' });
    expect(put.status).toBe(403);

    const post = await request(app)
      .post('/api/candidates')
      .send({ id: 'hb-2', name: 'New', post: 'HB', electionType: 'school', branch: 'dwarka' });
    expect(post.status).toBe(403);

    expect(mockedDataStore.setCandidates).not.toHaveBeenCalled();
  });

  // The actual regression: isOpen is false (a Pause Polling break) but the
  // election is still running -- must be blocked exactly the same as while
  // the poll is open, not silently allowed.
  it('is blocked while polling is paused but an election is still running', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: 'school',
      settings: { isOpen: false, allowRevote: false } // paused, not ended
    });
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);

    const { createApp } = await import('../app.js');
    const app = createApp();

    const del = await request(app).delete('/api/candidates/hb-1');
    expect(del.status).toBe(403);
    expect(del.body.error).toContain('Pause Polling');

    expect(mockedDataStore.setCandidates).not.toHaveBeenCalled();
  });

  it('succeeds while no election is in progress', async () => {
    mockedDataStore.getPollState.mockReturnValue({
      activeElectionType: null,
      settings: { isOpen: false, allowRevote: false }
    });
    mockedDataStore.getCurrentRun.mockReturnValue(undefined);

    const { createApp } = await import('../app.js');
    const app = createApp();

    const del = await request(app).delete('/api/candidates/hb-1');
    expect(del.status).toBe(204);
    expect(mockedDataStore.setCandidates).toHaveBeenCalled();
  });
});
