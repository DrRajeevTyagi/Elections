import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SealDialog } from './SealDialog';
import type { OfficerCode } from '../types/api';

const mockApi = vi.hoisted(() => ({
  sealOfficerCode: vi.fn()
}));

vi.mock('../services/api', () => mockApi);

const booth: OfficerCode = {
  code: 'abc123',
  officerName: 'Mrs. Sharma',
  electionType: 'school',
  createdAt: 1,
  closedAt: 2,
  voteCount: 38,
  branch: 'dwarka'
};

const renderDialog = () => {
  const props = { onClose: vi.fn(), onSealed: vi.fn(), onOrderRepoll: vi.fn() };
  render(<SealDialog adminSecret="secret" entry={booth} {...props} />);
  return props;
};

const sealButton = () => screen.getByRole('button', { name: /Verify & Seal/ });
const typePaperList = (value: string) => fireEvent.change(screen.getByLabelText('Number of voters on the Paper List'), { target: { value } });

describe('SealDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the app count and stays locked until a Paper List number is typed', () => {
    renderDialog();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(sealButton()).toBeDisabled();
  });

  it('seals when the Paper List matches the app', async () => {
    mockApi.sealOfficerCode.mockResolvedValue(undefined);
    const { onSealed } = renderDialog();
    typePaperList('38');
    expect(screen.getByText(/The counts match/)).toBeInTheDocument();
    fireEvent.click(sealButton());

    await waitFor(() => expect(onSealed).toHaveBeenCalled());
    expect(mockApi.sealOfficerCode).toHaveBeenCalledWith('abc123', 38, 'secret');
  });

  it('on a mismatch, will not seal and offers Order Re-poll instead', () => {
    const { onOrderRepoll } = renderDialog();
    typePaperList('36');

    expect(screen.getByRole('alert')).toHaveTextContent('the app has 38, the Paper List has 36');
    expect(sealButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Order Re-poll' }));
    expect(onOrderRepoll).toHaveBeenCalled();
    expect(mockApi.sealOfficerCode).not.toHaveBeenCalled();
  });

  it('ignores anything but digits', () => {
    renderDialog();
    typePaperList('3a8');
    expect(screen.getByLabelText('Number of voters on the Paper List')).toHaveValue('38');
  });
});
