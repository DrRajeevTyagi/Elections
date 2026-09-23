import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { getPollStatus } from '../services/api';
import type { ElectionType } from '../types/election';
import { useKiosk } from '../context/KioskContext';
import './AppLayout.css';

const ELECTION_TYPE_LABEL: Record<ElectionType, string> = {
  school: 'Election for School Posts',
  house: 'Election for House Posts'
};

const POLL_STATUS_REFRESH_MS = 5000;

export const AppLayout = ({ children }: PropsWithChildren): JSX.Element => {
  const [electionType, setElectionType] = useState<ElectionType | null>(null);
  const location = useLocation();
  const { stationVoteCount, house } = useKiosk();

  useEffect(() => {
    let cancelled = false;

    const refreshElectionType = async () => {
      try {
        const { poll } = await getPollStatus();
        if (!cancelled) {
          setElectionType(poll.activeElectionType);
        }
      } catch {
        // Non-fatal -- the banner just stays hidden until the next poll.
      }
    };

    void refreshElectionType();
    const interval = setInterval(refreshElectionType, POLL_STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const showStationCount = location.pathname.startsWith('/kiosk') && typeof stationVoteCount === 'number';
  const isKioskRoute = location.pathname.startsWith('/kiosk');
  const bannerText =
    !electionType
      ? null
      : electionType === 'house' && house && isKioskRoute
      ? `Election for House Posts — ${house} House`
      : ELECTION_TYPE_LABEL[electionType];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-school">Mount Carmel School</span>
          <span className="brand-title">Student Council Elections</span>
          <span className="brand-subtitle">Voting Console</span>
        </div>
        {showStationCount && (
          <div className="station-count-badge">
            <span className="station-count-label">Votes cast at this station</span>
            <span className="station-count-value">{stationVoteCount}</span>
          </div>
        )}
      </header>
      {bannerText && <div className="election-type-banner">{bannerText}</div>}
      <main className="app-main">{children}</main>
    </div>
  );
};
