import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ActivationPage } from './ActivationPage';

const kiosk = vi.hoisted(() => ({ activate: vi.fn() }));

vi.mock('../context/KioskContext', () => ({
  useKiosk: () => ({ activate: kiosk.activate, status: 'idle', house: undefined })
}));

const submitCode = () => {
  render(
    <MemoryRouter>
      <ActivationPage />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Officer Code'), { target: { value: 'abc123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Ballot' }));
};

describe('ActivationPage', () => {
  it('shows "you are marked as ready" as good news, not an error, when voting has not opened', async () => {
    kiosk.activate.mockRejectedValueOnce(
      Object.assign(new Error('✓ Your code is correct and you are marked as ready. Voting has not started yet.'), {
        errorCode: 'READY_POLL_NOT_OPEN'
      })
    );
    submitCode();
    expect(await screen.findByRole('status')).toHaveTextContent('marked as ready');
  });

  it('still shows a real problem as an error', async () => {
    kiosk.activate.mockRejectedValueOnce(new Error('Incorrect officer code.'));
    submitCode();
    expect(await screen.findByText('Incorrect officer code.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
