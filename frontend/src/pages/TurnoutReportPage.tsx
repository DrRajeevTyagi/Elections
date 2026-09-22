import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentReport } from '../services/api';
import { formatTimestamp, OfficerTurnoutTable } from './ReportPage';
import type { ElectionReport } from '../types/api';
import './ReportPage.css';

// A live, officer-turnout-only report -- reachable from the Polling Officer
// Codes tab, separate from the results-only "Download Report" on the
// Dashboard tab. Election History's archived reports keep results and
// turnout together (see ReportPage), since that's the permanent record;
// this page is only for whoever wants turnout on its own, right now.
export const TurnoutReportPage = (): JSX.Element => {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [report, setReport] = useState<ElectionReport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('adminSecret');
    setAdminSecret(stored);
    setCheckingAuth(false);
  }, []);

  useEffect(() => {
    if (!adminSecret) {
      return;
    }
    void (async () => {
      try {
        const response = await getCurrentReport(adminSecret);
        setReport(response.report);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load report');
      }
    })();
  }, [adminSecret]);

  if (checkingAuth) {
    return <p className="report-status">Checking access...</p>;
  }

  if (!adminSecret) {
    return (
      <div className="report-status">
        <p>Please log in to the Admin Dashboard first.</p>
        <Link to="/admin">Go to Admin Dashboard</Link>
      </div>
    );
  }

  if (error) {
    return <p className="report-status report-error">{error}</p>;
  }

  if (report === undefined) {
    return <p className="report-status">Loading report...</p>;
  }

  if (report === null) {
    return (
      <div className="report-status">
        <p>No election is currently set up, so there is nothing to report yet.</p>
        <Link to="/admin">Back to Admin Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <Link to="/admin">&larr; Back to Admin Dashboard</Link>
        <button className="button" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <p className="report-school-name">Mount Carmel School</p>
      <h1>{report.electionType === 'school' ? 'School Elections' : 'House Elections'} — Polling Officer Turnout</h1>
      <p className="report-meta">
        Generated {formatTimestamp(report.archivedAt)}
        {' · '}
        {report.totalVotes} total vote{report.totalVotes === 1 ? '' : 's'} cast so far
      </p>

      <OfficerTurnoutTable officerCodes={report.officerCodes} />
    </div>
  );
};
