import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SendCodesPanel } from './SendCodesPanel';
import type { OfficerCode } from '../types/api';

const mockApi = vi.hoisted(() => ({
  markOfficerCodesSent: vi.fn().mockResolvedValue(undefined),
  updateOfficerCode: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/api', () => mockApi);

const code = (overrides: Partial<OfficerCode>): OfficerCode => ({
  code: 'aaa111',
  officerName: 'Mrs. Sharma',
  electionType: 'school',
  createdAt: 1,
  voteCount: 0,
  branch: 'dwarka',
  phone: '919876543210',
  ...overrides
});

const codes: OfficerCode[] = [
  code({}),
  code({ code: 'ccc333', electionType: 'house', house: 'Anand' }),
  code({ code: 'bbb222', officerName: 'Mr. Rao', phone: '919800000000', sentAt: Date.now() }),
  code({ code: 'ddd444', officerName: 'Ms. Iyer', phone: undefined }),
  code({ code: 'eee555', officerName: 'AN Teacher', branch: 'AN' })
];

const renderPanel = (onChanged = vi.fn().mockResolvedValue(undefined)) =>
  render(
    <SendCodesPanel adminSecret="secret" branch="dwarka" officerCodes={codes} onClose={vi.fn()} onChanged={onChanged} />
  );

describe('SendCodesPanel', () => {
  const originalOpen = window.open;
  const openSpy = vi.fn((_url?: string | URL, _target?: string) => null);

  beforeEach(() => {
    localStorage.clear();
    window.open = openSpy as unknown as typeof window.open;
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.open = originalOpen;
  });

  it('counts sent teachers for this branch only and lists those without a number separately', () => {
    renderPanel();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/1 without a WhatsApp number/)).toBeInTheDocument();
    expect(screen.queryByText('AN Teacher')).not.toBeInTheDocument();
  });

  it('Send Next sends a teacher\'s School and House codes together and ticks both as sent', async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    renderPanel(onChanged);
    fireEvent.change(screen.getByLabelText('Open messages in'), { target: { value: 'web' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Next: Mrs\. Sharma \(1 left\)/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [link, target] = openSpy.mock.calls[0] as [string, string];
    expect(target).toBe('whatsapp-send');
    const message = decodeURIComponent(link.split('?text=')[1]);
    expect(link.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(message).toContain('School Elections: aaa111');
    expect(message).toContain('Anand House Elections: ccc333');

    await waitFor(() => expect(mockApi.markOfficerCodesSent).toHaveBeenCalledWith(['aaa111', 'ccc333'], true, 'secret'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('Undo clears the sent mark', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockApi.markOfficerCodesSent).toHaveBeenCalledWith(['bbb222'], false, 'secret'));
  });

  it('saves a typed number onto every code of a teacher without one', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Mobile number for Ms. Iyer'), { target: { value: '98765 00000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.updateOfficerCode).toHaveBeenCalledWith('ddd444', { phone: '919876500000' }, 'secret'));
  });

  it('refuses a number that is not a valid mobile number', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Mobile number for Ms. Iyer'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/doesn't look like a valid 10-digit mobile number/)).toBeInTheDocument();
    expect(mockApi.updateOfficerCode).not.toHaveBeenCalled();
  });
});
