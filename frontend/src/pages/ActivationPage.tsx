import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../context/KioskContext';
import { MaskedCodeInput } from '../components/MaskedCodeInput';
import './Page.css';

export const ActivationPage = (): JSX.Element => {
  const [secret, setSecret] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);
  // The code was right but voting hasn't opened yet -- the teacher is now
  // marked ready on the admin's Officer Codes tab. Good news, not an error.
  const [readyNotice, setReadyNotice] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  const { activate, status, house } = useKiosk();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    setReadyNotice(undefined);
    try {
      await activate(secret);
      navigate('/kiosk/vote');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Activation failed';
      if ((error as { errorCode?: string })?.errorCode === 'READY_POLL_NOT_OPEN') {
        setReadyNotice(message);
      } else {
        setFormError(message);
      }
    }
  };

  return (
    <section className="page-card">
      <h1>Activate Ballot</h1>
      <p>Polling officers: enter your officer code to unlock a ballot session.</p>
      {house && (
        <p style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 600, marginTop: '-0.5rem', marginBottom: '1rem' }}>
          House: {house}
        </p>
      )}
      <form className="form" onSubmit={handleSubmit}>
        <label className="form-label" htmlFor="secret">
          Officer Code
        </label>
        <MaskedCodeInput id="secret" value={secret} onChange={setSecret} placeholder="e.g. ab2k7m" />
        {formError && <p style={{ color: '#dc2626', margin: 0 }}>{formError}</p>}
        {readyNotice && (
          <p role="status" style={{ color: '#166534', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.6rem 0.75rem', margin: 0, fontWeight: 600 }}>
            {readyNotice}
          </p>
        )}
        <button className="button" type="submit" disabled={!secret.trim() || status === 'activating'}>
          {status === 'activating' ? 'Unlocking...' : 'Unlock Ballot'}
        </button>
      </form>
    </section>
  );
};
