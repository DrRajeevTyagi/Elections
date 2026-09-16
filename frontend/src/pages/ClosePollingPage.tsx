import { useState } from 'react';
import { Link } from 'react-router-dom';
import { closeBooth } from '../services/api';
import './Page.css';

export const ClosePollingPage = (): JSX.Element => {
  const [secret, setSecret] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      await closeBooth(secret);
      setDone(true);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Failed to close polling for this booth');
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <section className="page-card">
        <h1>Polling Closed</h1>
        <p>This code can no longer be used to activate a ballot. Thank you.</p>
        <div className="page-actions">
          <Link className="button" to="/kiosk">
            Back to Start
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h1>Close Polling at This Booth</h1>
      <p>
        Only do this once every voter on your list has cast their ballot. This code will stop working
        immediately, and the administrator will see this booth marked as closed.
      </p>
      <form className="form" onSubmit={handleSubmit}>
        <label className="form-label" htmlFor="close-secret">
          Officer Code
        </label>
        <input
          id="close-secret"
          name="close-secret"
          type="text"
          value={secret}
          className="form-input"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={6}
          style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'monospace' }}
          onChange={(event) => {
            setSecret(event.target.value.toUpperCase());
            setConfirming(false);
          }}
          placeholder="e.g. AB2K7M"
        />
        {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
        {confirming && !error && (
          <p style={{ color: '#b45309', fontWeight: 600, margin: 0 }}>
            Are you sure? Click "Confirm Close" to proceed &mdash; this cannot be undone from this device.
          </p>
        )}
        <button
          className="button"
          type="submit"
          disabled={!secret.trim() || submitting}
          style={confirming ? { backgroundColor: '#dc2626' } : undefined}
        >
          {submitting ? 'Closing...' : confirming ? 'Confirm Close' : 'Close Polling at This Booth'}
        </button>
      </form>
      <div className="page-actions">
        <Link className="button" style={{ backgroundColor: '#6b7280' }} to="/kiosk">
          Cancel
        </Link>
      </div>
    </section>
  );
};
