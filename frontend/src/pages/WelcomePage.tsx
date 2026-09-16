import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useKiosk } from '../context/KioskContext';
import './Page.css';

export const WelcomePage = (): JSX.Element => {
  const { status, house } = useKiosk();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'ready') {
      navigate('/kiosk/vote');
    }
  }, [navigate, status]);

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
        <Link className="button" to="/kiosk/activate">
          Officer Activation
        </Link>
      </div>
      <p style={{ marginTop: '2rem' }}>
        <Link to="/kiosk/close-booth" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          Close polling at this booth
        </Link>
      </p>
    </section>
  );
};
