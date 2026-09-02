import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useKiosk } from '../context/KioskContext';
import { getPollStatus } from '../services/api';
import './Page.css';

export const WelcomePage = (): JSX.Element => {
  const { status, house } = useKiosk();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (status === 'ready') {
      navigate('/kiosk/vote');
      return;
    }

    const checkElectionType = async () => {
      try {
        const { poll } = await getPollStatus();
        if (poll.activeElectionType === 'house' && !house) {
          // House elections active but no house selected, go to house selection
          navigate('/kiosk/select-house');
          return;
        }
        setChecking(false);
      } catch (err) {
        console.error('Failed to check election type:', err);
        setChecking(false);
      }
    };
    void checkElectionType();
  }, [navigate, status, house]);

  if (checking) {
    return (
      <section className="page-card">
        <h1>Loading...</h1>
        <p>Please wait...</p>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h1>Welcome to the Polling Booth</h1>
      <p>
        When the polling officer is ready, they will unlock this station for your ballot. Please wait until you are
        instructed to begin.
      </p>
      {house && (
        <p style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 600, marginTop: '-0.5rem' }}>
          House: {house}
        </p>
      )}
      <div className="page-actions">
        <Link className="button" to={house ? "/kiosk/activate" : "/kiosk/select-house"}>
          Officer Activation
        </Link>
      </div>
    </section>
  );
};
