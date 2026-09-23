import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getOfficerCodes } from '../services/api';
import { groupOfficerCodesByHouse } from '../utils/officerCodeGroups';
import type { OfficerCode } from '../types/api';
import type { Branch } from '../types/election';
import { formatTimestamp } from './ReportPage';
import './ReportPage.css';

// The confirmed letterhead text for each branch -- Dwarka and AN are not the
// same school name, so this can't be a single hardcoded string the way
// ReportPage's "Mount Carmel School" is. Decided with the Election
// Commissioner 2026-09-22.
const BRANCH_LETTERHEAD: Record<Branch, string> = {
  dwarka: 'Mount Carmel School',
  AN: 'Mount Carmel School, Anand Niketan'
};

const BRANCH_LABEL: Record<Branch, string> = {
  dwarka: 'Dwarka',
  AN: 'AN'
};

const isValidBranch = (value: string | undefined): value is Branch => value === 'dwarka' || value === 'AN';

// A printable "who has which code" roster, one per branch, reachable from
// the Polling Officer Codes tab -- separate from ReportPage/TurnoutReportPage
// (which are about results/turnout after voting starts). This is the
// handout given to each branch's Election Head/Principal *before* polling,
// so they can distribute codes to the named teacher on each row. Unlike the
// turnout report, it deliberately omits vote counts -- this document's job
// is code-to-name attribution, not live tallies.
export const OfficerCodesPrintPage = (): JSX.Element => {
  const { branch } = useParams<{ branch?: string }>();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [codes, setCodes] = useState<OfficerCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt] = useState(() => Date.now());

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
        const response = await getOfficerCodes(adminSecret);
        setCodes(response.codes);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load officer codes');
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

  if (!isValidBranch(branch)) {
    return (
      <div className="report-status">
        <p>Unknown branch.</p>
        <Link to="/admin">Back to Admin Dashboard</Link>
      </div>
    );
  }

  if (error) {
    return <p className="report-status report-error">{error}</p>;
  }

  if (codes === null) {
    return <p className="report-status">Loading codes...</p>;
  }

  // Codes generated before the branch field existed have no `branch` set --
  // treat that the same way the backend defaults it, so old Dwarka codes
  // still show up here instead of vanishing off the roster.
  const branchCodes = codes.filter((entry) => (entry.branch ?? 'dwarka') === branch);
  const groups = groupOfficerCodesByHouse(branchCodes);
  const unallotedCount = branchCodes.filter((entry) => !entry.officerName.trim()).length;

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <Link to="/admin">&larr; Back to Admin Dashboard</Link>
        <button className="button" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <p className="report-school-name">{BRANCH_LETTERHEAD[branch]}</p>
      <h1>Polling Officer Code Allotment — {BRANCH_LABEL[branch]} Branch</h1>
      <p className="report-meta">
        Generated {formatTimestamp(generatedAt)}
        {' · '}
        {branchCodes.length} code{branchCodes.length === 1 ? '' : 's'}
        {unallotedCount > 0 && (
          <span className="report-unallotted"> · {unallotedCount} not yet allotted</span>
        )}
      </p>
      <p className="report-meta">
        For the {BRANCH_LABEL[branch]} branch Election Head/Principal: Please distribute each code below to the
        named teacher only.
      </p>

      {groups.length === 0 ? (
        <p className="report-empty">No codes have been generated yet for this branch.</p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="report-house">
            <h2>{group.label}</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Teacher / Polling Officer Name</th>
                </tr>
              </thead>
              <tbody>
                {group.codes.map((entry) => (
                  <tr key={entry.code}>
                    <td className="report-code-cell">{entry.code}</td>
                    <td className={entry.officerName.trim() ? '' : 'report-unallotted'}>
                      {entry.officerName.trim() || 'NOT YET ALLOTTED'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
};
