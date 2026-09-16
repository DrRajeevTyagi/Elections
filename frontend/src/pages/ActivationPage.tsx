import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../context/KioskContext';
import type { HouseId } from '../types/election';
import './Page.css';

const HOUSES: HouseId[] = ['Anand', 'Dhiraj', 'Kripa', 'Prem', 'Namrata', 'Nishtha', 'Satya', 'Shanti'];

export const ActivationPage = (): JSX.Element => {
  const [secret, setSecret] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);
  // Set only when the server reports this code has no house of its own
  // built in (a legacy/unbound code) and one must be picked manually.
  const [houseRequired, setHouseRequired] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<HouseId | null>(null);
  const navigate = useNavigate();
  const { activate, status, house } = useKiosk();

  const attemptActivation = async (houseOverride?: HouseId) => {
    setFormError(undefined);
    try {
      await activate(secret, houseOverride);
      navigate('/kiosk/vote');
    } catch (error) {
      const errorCode = (error as { errorCode?: string } | undefined)?.errorCode;
      if (errorCode === 'HOUSE_REQUIRED') {
        setHouseRequired(true);
        return;
      }
      setFormError(error instanceof Error ? error.message : 'Activation failed');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await attemptActivation();
  };

  const handleHouseConfirm = async () => {
    if (!selectedHouse) {
      return;
    }
    await attemptActivation(selectedHouse);
  };

  if (houseRequired) {
    return (
      <section className="page-card">
        <h1>Select House</h1>
        <p>
          This code isn&apos;t linked to a specific house. Please select the house for this polling booth &mdash;
          it will stay selected for every voter after this one.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          {HOUSES.map((h) => (
            <button
              key={h}
              type="button"
              className="button"
              onClick={() => setSelectedHouse(h)}
              style={{
                backgroundColor: selectedHouse === h ? '#16a34a' : '#6b7280',
                color: 'white',
                border: selectedHouse === h ? '2px solid #15803d' : '2px solid transparent'
              }}
            >
              {h}
            </button>
          ))}
        </div>
        {formError && <p style={{ color: '#dc2626', margin: 0 }}>{formError}</p>}
        <button
          className="button"
          onClick={handleHouseConfirm}
          disabled={!selectedHouse || status === 'activating'}
          style={{ width: '100%' }}
        >
          {status === 'activating' ? 'Unlocking...' : 'Continue'}
        </button>
      </section>
    );
  }

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
