import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getArchive, getCurrentReport } from '../services/api';
import { HOUSE_IDS, HOUSE_POST_IDS } from '../constants/houses';
import { POST_NAMES, SCHOOL_POST_IDS } from '../constants/posts';
import type { ArchivedCandidateResult, ElectionReport } from '../types/api';
import type { HouseId, PostId } from '../types/election';
import './ReportPage.css';

const formatTimestamp = (timestamp: number): string => new Date(timestamp).toLocaleString();

interface GroupedPost {
  post: PostId;
  candidates: ArchivedCandidateResult[];
}

const groupByPost = (results: ArchivedCandidateResult[], postIds: PostId[]): GroupedPost[] =>
  postIds.map((post) => ({
    post,
    candidates: results.filter((r) => r.post === post).sort((a, b) => b.total - a.total)
  }));

interface GroupedHouse {
  house: HouseId;
  posts: GroupedPost[];
}

const groupByHouse = (results: ArchivedCandidateResult[]): GroupedHouse[] =>
  HOUSE_IDS.map((house) => ({
    house,
    posts: groupByPost(
      results.filter((r) => r.house === house),
      HOUSE_POST_IDS
    )
  }));

const PostResultsTable = ({ group }: { group: GroupedPost }): JSX.Element => (
  <table className="report-table">
    <thead>
      <tr>
        <th colSpan={2}>{POST_NAMES[group.post]} ({group.post})</th>
      </tr>
    </thead>
    <tbody>
      {group.candidates.length === 0 ? (
        <tr>
          <td colSpan={2} className="report-empty">No candidates</td>
        </tr>
      ) : (
        group.candidates.map((candidate, index) => (
          <tr key={candidate.candidateId} className={index === 0 && candidate.total > 0 ? 'report-winner' : ''}>
            <td>{candidate.name}</td>
            <td className="report-votes">{candidate.total}</td>
          </tr>
        ))
      )}
    </tbody>
  </table>
);

export const ReportPage = (): JSX.Element => {
  const { archiveId } = useParams<{ archiveId?: string }>();
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
        if (archiveId) {
          const response = await getArchive(archiveId, adminSecret);
          setReport(response.report);
        } else {
          const response = await getCurrentReport(adminSecret);
          setReport(response.report);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load report');
      }
    })();
  }, [adminSecret, archiveId]);

  const grouped = useMemo(() => {
    if (!report) {
      return null;
    }
    if (report.electionType === 'house') {
      return { kind: 'house' as const, houses: groupByHouse(report.results) };
    }
    return { kind: 'school' as const, posts: groupByPost(report.results, SCHOOL_POST_IDS) };
  }, [report]);

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

      <h1>{report.electionType === 'school' ? 'School Elections' : 'House Elections'} — Results Report</h1>
      <p className="report-meta">
        {archiveId ? 'Archived' : 'Generated'} {formatTimestamp(report.archivedAt)}
        {' · '}
        {report.totalVotes} total vote{report.totalVotes === 1 ? '' : 's'} cast
      </p>

      {grouped?.kind === 'school' &&
        grouped.posts.map((group) => <PostResultsTable key={group.post} group={group} />)}

      {grouped?.kind === 'house' &&
        grouped.houses.map((houseGroup) => (
          <section key={houseGroup.house} className="report-house">
            <h2>{houseGroup.house} House</h2>
            {houseGroup.posts.map((group) => (
              <PostResultsTable key={`${houseGroup.house}-${group.post}`} group={group} />
            ))}
          </section>
        ))}

      <h2>Polling Officer Turnout</h2>
      <table className="report-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Officer Name</th>
            <th>Votes Cast</th>
          </tr>
        </thead>
        <tbody>
          {report.officerCodes.length === 0 ? (
            <tr>
              <td colSpan={3} className="report-empty">No polling officer codes were generated</td>
            </tr>
          ) : (
            report.officerCodes.map((entry) => (
              <tr key={entry.code}>
                <td>{entry.code}</td>
                <td>{entry.officerName || <em>(unnamed)</em>}</td>
                <td className="report-votes">{entry.voteCount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
