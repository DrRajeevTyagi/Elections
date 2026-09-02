import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../context/KioskContext';
import { getPollStatus } from '../services/api';
import type { HouseId } from '../types/election';
import './Page.css';

const HOUSES: HouseId[] = ['Anand', 'Dhiraj', 'Kripa', 'Prem', 'Namrata', 'Nishtha', 'Satya', 'Shanti'];

export const HouseSelectionPage = (): JSX.Element => {
  const [selectedHouse, setSelectedHouse] = useState<HouseId | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const { setHouse } = useKiosk();

  useEffect(() => {
    const checkElectionType = async () => {
      try {
        const { poll } = await getPollStatus();
        if (poll.activeElectionType !== 'house') {
          // Not house elections, go to activation directly
          navigate('/kiosk/activate');
          return;
        }
        setChecking(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check election type');
        setChecking(false);
      }
    };
    void checkElectionType();
  }, [navigate]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedHouse) {
      setError('Please select a house');
      return;
    }

    setHouse(selectedHouse);
    navigate('/kiosk/activate');
  };

  if (checking) {
    return (
      <section className="page-card">
        <h1>Checking Election Type...</h1>
        <p>Please wait...</p>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h1>Select House</h1>
      <p>Polling officers: Please select the house for this polling booth.</p>
      <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '-0.5rem' }}>
        This selection will remain constant for all votes from this booth.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="form-label">House</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          {HOUSES.map((house) => (
            <button
              key={house}
              type="button"
              className="button"
              onClick={() => {
                setSelectedHouse(house);
                setError(undefined);
              }}
              style={{
                backgroundColor: selectedHouse === house ? '#16a34a' : '#6b7280',
                color: 'white',
                border: selectedHouse === house ? '2px solid #15803d' : '2px solid transparent'
              }}
            >
              {house}
            </button>
          ))}
        </div>
        {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
        <button className="button" type="submit" disabled={!selectedHouse} style={{ width: '100%' }}>
          Continue to Activation
        </button>
      </form>
    </section>
  );
};

