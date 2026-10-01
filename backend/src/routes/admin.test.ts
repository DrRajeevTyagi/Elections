import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionRun } from '../types/election.js';

// End-to-end through the real admin middleware and session service: one
// device in control, a second device asking for control, Allow / Deny.

const runningRun: ElectionRun = {
  id: 'run-1',
  electionType: 'school',
  name: 'Test Run',
  status: 'running',
  startedAt: Date.now(),
  startedBy: 'actor-1'
};

const mockedDataStore = {
  getCurrentRun: vi.fn<[], ElectionRun | undefined>(() => runningRun),
  appendLogEntry: vi.fn(),
  getStorageHealth: vi.fn(() => ({ ok: true }))
};

vi.mock('../storage/datastore.js', () => ({
  dataStore: mockedDataStore
}));

const SECRET = 'admin-secret';

const loadApp = async () => {
  // Fresh modules each test so the in-memory admin session starts empty.
  vi.resetModules();
  const { createApp } = await import('../app.js');
  return createApp();
};

const as = (clientId: string) => ({ 'x-admin-secret': SECRET, 'x-admin-client-id': clientId });

describe('admin console hand-over', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDataStore.getCurrentRun.mockReturnValue(runningRun);
  });

  it('refuses a second device with the name of the device in control', async () => {
    const app = await loadApp();
    await request(app).post('/api/admin/verify').set(as('device-a')).send({ label: 'Laptop A' }).expect(200);

    const response = await request(app).post('/api/admin/verify').set(as('device-b')).send({ label: 'Phone B' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ADMIN_SESSION_CONFLICT');
    expect(response.body.details).toMatchObject({ holderLabel: 'Laptop A', takeableAt: expect.any(Number) });
  });

  it('Allow: the asking device gets control and the old one is signed out', async () => {
    const app = await loadApp();
    await request(app).post('/api/admin/verify').set(as('device-a')).send({ label: 'Laptop A' });

    const asked = await request(app).post('/api/admin/takeover-requests').set(as('device-b')).send({ label: 'Phone B' });
    expect(asked.status).toBe(201);
    const requestId = asked.body.request.id as string;

    const status = await request(app).get('/api/admin/session-status').set(as('device-a'));
    expect(status.body.pendingRequest).toMatchObject({ id: requestId, label: 'Phone B' });

    const answer = await request(app).post(`/api/admin/takeover-requests/${requestId}/respond`).set(as('device-a')).send({ allow: true });
    expect(answer.status).toBe(200);

    const check = await request(app).get(`/api/admin/takeover-requests/${requestId}`).set(as('device-b'));
    expect(check.body.request.status).toBe('approved');

    await request(app).get('/api/admin/session-status').set(as('device-b')).expect(200);
    const oldDevice = await request(app).get('/api/admin/session-status').set(as('device-a'));
    expect(oldDevice.status).toBe(401);
    expect(oldDevice.body.code).toBe('ADMIN_SESSION_LOST');

    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session.takeoverRequested' })
    );
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session.takeover', actor: 'Phone B', details: expect.objectContaining({ evicted: 'Laptop A' }) })
    );
  });

  it('Deny: the device in control stays in control', async () => {
    const app = await loadApp();
    await request(app).post('/api/admin/verify').set(as('device-a')).send({ label: 'Laptop A' });
    const asked = await request(app).post('/api/admin/takeover-requests').set(as('device-b')).send({ label: 'Phone B' });
    const requestId = asked.body.request.id as string;

    await request(app).post(`/api/admin/takeover-requests/${requestId}/respond`).set(as('device-a')).send({ allow: false }).expect(200);

    const check = await request(app).get(`/api/admin/takeover-requests/${requestId}`).set(as('device-b'));
    expect(check.body.request.status).toBe('denied');
    await request(app).get('/api/admin/session-status').set(as('device-a')).expect(200);
    expect(mockedDataStore.appendLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session.takeoverDenied', actor: 'Laptop A', details: { requester: 'Phone B', holder: 'Laptop A' } })
    );
  });

  it('the asking device cannot answer its own request', async () => {
    const app = await loadApp();
    await request(app).post('/api/admin/verify').set(as('device-a'));
    const asked = await request(app).post('/api/admin/takeover-requests').set(as('device-b'));

    const answer = await request(app)
      .post(`/api/admin/takeover-requests/${asked.body.request.id as string}/respond`)
      .set(as('device-b'))
      .send({ allow: true });

    expect(answer.status).toBe(401);
  });

  it('asking requires the admin secret', async () => {
    const app = await loadApp();
    await request(app).post('/api/admin/verify').set(as('device-a'));

    const asked = await request(app)
      .post('/api/admin/takeover-requests')
      .set({ 'x-admin-secret': 'wrong', 'x-admin-client-id': 'device-b' });

    expect(asked.status).toBe(401);
  });
});
