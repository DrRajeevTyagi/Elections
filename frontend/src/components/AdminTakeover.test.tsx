import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TakeoverPrompt, TakeoverRequestBox } from './AdminTakeover';

const mockApi = vi.hoisted(() => ({
  requestAdminTakeover: vi.fn(),
  getAdminTakeoverRequest: vi.fn(),
  cancelAdminTakeover: vi.fn().mockResolvedValue(undefined),
  getAdminSessionStatus: vi.fn(),
  respondToAdminTakeover: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/api', () => mockApi);

const now = Date.now();
const pendingRequest = { id: 'tr-1', label: 'Phone B', createdAt: now, expiresAt: now + 60000 };

describe('TakeoverRequestBox (the device asking for control)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi.requestAdminTakeover.mockResolvedValue({ ...pendingRequest, status: 'pending' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const renderBox = (onGranted = vi.fn(), onRetryLogin = vi.fn()) => {
    render(
      <TakeoverRequestBox
        adminSecret="secret"
        message="The admin console is in use on Laptop A."
        details={{ holderLabel: 'Laptop A' }}
        onGranted={onGranted}
        onRetryLogin={onRetryLogin}
      />
    );
    return { onGranted, onRetryLogin };
  };

  it('asks, waits, and logs in once the other device allows it', async () => {
    const { onGranted } = renderBox();
    mockApi.getAdminTakeoverRequest.mockResolvedValue({ ...pendingRequest, status: 'approved' });

    fireEvent.click(screen.getByRole('button', { name: 'Ask for Control' }));
    expect(await screen.findByText(/Waiting for Laptop A to answer/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(onGranted).toHaveBeenCalled());
  });

  it('says so when the other device refuses', async () => {
    const { onGranted } = renderBox();
    mockApi.getAdminTakeoverRequest.mockResolvedValue({ ...pendingRequest, status: 'denied' });

    fireEvent.click(screen.getByRole('button', { name: 'Ask for Control' }));
    await screen.findByText(/Waiting for Laptop A/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(await screen.findByText(/Request refused/)).toBeInTheDocument();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('explains the 3-minute rule when nobody answers', async () => {
    renderBox();
    mockApi.getAdminTakeoverRequest.mockResolvedValue({ ...pendingRequest, status: 'expired' });

    fireEvent.click(screen.getByRole('button', { name: 'Ask for Control' }));
    await screen.findByText(/Waiting for Laptop A/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(await screen.findByText(/silent for 3 minutes/)).toBeInTheDocument();
  });

  it('cancelling withdraws the request', async () => {
    renderBox();
    fireEvent.click(screen.getByRole('button', { name: 'Ask for Control' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Request' }));
    expect(mockApi.cancelAdminTakeover).toHaveBeenCalledWith('secret', 'tr-1');
  });

  it('just logs in again if nobody is in control any more', async () => {
    const { onRetryLogin } = renderBox();
    mockApi.requestAdminTakeover.mockRejectedValue(Object.assign(new Error('not needed'), { errorCode: 'TAKEOVER_NOT_NEEDED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask for Control' }));
    await waitFor(() => expect(onRetryLogin).toHaveBeenCalled());
  });
});

describe('TakeoverPrompt (the device in control)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing while nobody is asking', async () => {
    mockApi.getAdminSessionStatus.mockResolvedValue({ pendingRequest: null });
    render(<TakeoverPrompt adminSecret="secret" onHandedOver={vi.fn()} />);
    await waitFor(() => expect(mockApi.getAdminSessionStatus).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Allow hands control over and signs this device out', async () => {
    mockApi.getAdminSessionStatus.mockResolvedValue({ pendingRequest });
    const onHandedOver = vi.fn();
    render(<TakeoverPrompt adminSecret="secret" onHandedOver={onHandedOver} />);

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Phone B');
    fireEvent.click(screen.getByRole('button', { name: /Allow/ }));

    await waitFor(() => expect(onHandedOver).toHaveBeenCalledWith('Phone B'));
    expect(mockApi.respondToAdminTakeover).toHaveBeenCalledWith('secret', 'tr-1', true);
  });

  it('Deny keeps control and closes the popup', async () => {
    mockApi.getAdminSessionStatus.mockResolvedValueOnce({ pendingRequest }).mockResolvedValue({ pendingRequest: null });
    const onHandedOver = vi.fn();
    render(<TakeoverPrompt adminSecret="secret" onHandedOver={onHandedOver} />);

    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: /Deny/ }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockApi.respondToAdminTakeover).toHaveBeenCalledWith('secret', 'tr-1', false);
    expect(onHandedOver).not.toHaveBeenCalled();
  });
});
