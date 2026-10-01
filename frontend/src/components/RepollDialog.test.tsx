import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepollDialog } from './RepollDialog';
import type { OfficerCode } from '../types/api';

const mockApi = vi.hoisted(() => ({
  orderRepoll: vi.fn()
}));

vi.mock('../services/api', () => mockApi);

const booth: OfficerCode = {
  code: 'abc123',
  officerName: 'Mrs. Sharma',
  electionType: 'house',
  house: 'Anand',
  createdAt: 1,
  voteCount: 42,
  branch: 'dwarka',
  phone: '919876543210'
};

const replacement: OfficerCode = { ...booth, code: 'new999', voteCount: 0, replacesCode: 'abc123' };

const renderDialog = () => {
  const onOrdered = vi.fn();
  render(<RepollDialog adminSecret="secret" entry={booth} onClose={vi.fn()} onOrdered={onOrdered} />);
  return { onOrdered };
};

const orderButton = () => screen.getByRole('button', { name: /Cancel 42 Votes and Order Re-poll/ });

describe('RepollDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('warns with the exact number of votes that will be cancelled', () => {
    renderDialog();
    expect(screen.getByText(/This cancels all 42 votes cast at booth abc123/)).toBeInTheDocument();
  });

  it('stays locked until CONFIRM is typed', () => {
    renderDialog();
    expect(orderButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type CONFIRM/), { target: { value: 'confirm' } });
    expect(orderButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type CONFIRM/), { target: { value: 'CONFIRM' } });
    expect(orderButton()).toBeEnabled();
  });

  it('needs a reason', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Type CONFIRM/), { target: { value: 'CONFIRM' } });
    fireEvent.click(orderButton());
    expect(screen.getByText('Choose a reason.')).toBeInTheDocument();
    expect(mockApi.orderRepoll).not.toHaveBeenCalled();
  });

  it('orders a re-poll for the same teacher', async () => {
    mockApi.orderRepoll.mockResolvedValue({ code: booth, replacement });
    const { onOrdered } = renderDialog();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'count-mismatch' } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: ' Register says 38 ' } });
    fireEvent.change(screen.getByLabelText(/Type CONFIRM/), { target: { value: 'CONFIRM' } });
    fireEvent.click(orderButton());

    await waitFor(() => expect(onOrdered).toHaveBeenCalledWith(replacement));
    expect(mockApi.orderRepoll).toHaveBeenCalledWith('abc123', { reason: 'count-mismatch', note: 'Register says 38' }, 'secret');
  });

  it('orders a re-poll for a different teacher, with their number', async () => {
    mockApi.orderRepoll.mockResolvedValue({ code: booth, replacement });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'irregularity' } });
    fireEvent.click(screen.getByLabelText('A different teacher'));
    fireEvent.change(screen.getByLabelText("New teacher's name"), { target: { value: 'Mr. Rao' } });
    fireEvent.change(screen.getByLabelText("New teacher's mobile number"), { target: { value: '98000 00000' } });
    fireEvent.change(screen.getByLabelText(/Type CONFIRM/), { target: { value: 'CONFIRM' } });
    fireEvent.click(orderButton());

    await waitFor(() =>
      expect(mockApi.orderRepoll).toHaveBeenCalledWith(
        'abc123',
        { reason: 'irregularity', note: '', officerName: 'Mr. Rao', phone: '919800000000' },
        'secret'
      )
    );
  });

  it('shows the server\'s refusal', async () => {
    mockApi.orderRepoll.mockRejectedValue(new Error('A re-poll can only be ordered while that election is running.'));
    renderDialog();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'disruption' } });
    fireEvent.change(screen.getByLabelText(/Type CONFIRM/), { target: { value: 'CONFIRM' } });
    fireEvent.click(orderButton());

    expect(await screen.findByText(/only be ordered while that election is running/)).toBeInTheDocument();
  });
});
