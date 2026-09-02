import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../context/KioskContext';
import './Page.css';

export const ActivationPage = (): JSX.Element => {
  const [secret, setSecret] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  const { activate, status, house } = useKiosk();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    try {
      await activate(secret);
      navigate('/kiosk/vote');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Activation failed');
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
        <input
          id="secret"
          name="secret"
          type="text"
          value={secret}
          className="form-input"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={6}
          style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'monospace' }}
          onChange={(event) => setSecret(event.target.value.toUpperCase())}
          placeholder="e.g. AB2K7M"
        />
        {formError && <p style={{ color: '#dc2626', margin: 0 }}>{formError}</p>}
        <button className="button" type="submit" disabled={!secret.trim() || status === 'activating'}>
          {status === 'activating' ? 'Unlocking...' : 'Unlock Ballot'}
        </button>
      </form>
    </section>
  );
};
