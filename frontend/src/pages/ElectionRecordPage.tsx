import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getElectionRecord } from '../services/api';
import { getSchoolPostIds, POST_NAMES } from '../constants/posts';
import { HOUSE_IDS } from '../constants/houses';
import { REPOLL_REASON_LABELS } from '../types/api';
import type { ArchivedOfficerCode, CandidateVoteCount, ElectionRecordResponse } from '../types/api';
import type { Branch } from '../types/election';
import { CancelledVotesList } from '../components/CancelledVotesList';
import { describeLogEntry, isRoutineLogEntry, summarizeRoutineEntries } from '../utils/logSentences';
import { PostResultsTable, formatTimestamp, groupByHouse, groupByPost } from './ReportPage';
import type { GroupedPost } from './ReportPage';
import './ReportPage.css';

// The Election Record (Election History → "Election Record"): one
// election's whole story on one printable page --
//   1. Summary: name, who started and ended it and when, votes per branch,
//      booths used and sealed, re-polls.
//   2. Results: the winner of every post, with every candidate's count.
//   3. Booth by booth: teacher, votes counted, Paper List, sealed, re-polls
//      (with what each re-poll took off each candidate).
//   4. What happened: the Activity Log in plain sentences, in time order.
// For Dwarka, AN, or both together (?branch=). While the election is still
// running the figures are live and the page says "Not final yet".

const isValidBranch = (value: string | null): value is Branch => value === 'dwarka' || value === 'AN';
const branchLabel = (branch: Branch | undefined): string => (branch === 'AN' ? 'AN' : 'Dwarka');
// Dwarka first, as everywhere else in the app.
const branchRank = (branch: Branch | undefined): number => (branch === 'AN' ? 1 : 0);
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

const BRANCH_VIEWS: Array<{ value: Branch | undefined; label: string }> = [
  { value: undefined, label: 'Both branches' },
  { value: 'dwarka', label: 'Dwarka' },
  { value: 'AN', label: 'AN' }
];

// "Asha (14)" -- or "Tie: Asha, Ravi (14)" -- for the Winners list.
const winnerText = (group: GroupedPost): string => {
  const top = group.candidates[0];
  if (!top || top.total === 0) {
    return 'No votes';
  }
  const tied = group.candidates.filter((candidate) => candidate.total === top.total);
  return tied.length > 1
    ? `Tie: ${tied.map((candidate) => candidate.name).join(', ')} (${top.total} each)`
    : `${top.name} (${top.total})`;
};

const boothStatus = (entry: ArchivedOfficerCode, final: boolean): string => {
  if (entry.replacementCode) {
    return `Re-polled → ${entry.replacementCode}`;
  }
  if (entry.paperListCount !== undefined) {
    return '🔒 Sealed';
  }
  if (final || entry.closedAt) {
    return 'Closed, not sealed';
  }
  return 'Open';
};

const BoothTable = ({ booths, showBranch, final }: { booths: ArchivedOfficerCode[]; showBranch: boolean; final: boolean }): JSX.Element => (
  <div style={{ overflowX: 'auto' }}>
    <table className="report-table">
      <thead>
        <tr>
          <th>Booth</th>
          {showBranch && <th>Branch</th>}
          <th>Teacher</th>
          <th className="report-votes">Votes counted</th>
          <th className="report-votes">Paper List</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {booths.map((entry) => (
          <tr key={entry.code}>
            <td className="report-code-cell">
              {entry.code}
              {entry.replacesCode && <div className="report-repoll-note">Re-poll of {entry.replacesCode}</div>}
            </td>
            {showBranch && <td>{branchLabel(entry.branch)}</td>}
            <td style={{ overflowWrap: 'anywhere' }}>
              {entry.officerName || <em>(not allotted)</em>}
              {entry.replacementCode && (
                <div className="report-repoll-note">
                  {plural(entry.cancelledVoteCount ?? 0, 'vote')} cancelled. Reason:{' '}
                  {entry.repollReason ? REPOLL_REASON_LABELS[entry.repollReason] : 'not given'}
                  {entry.repollNote ? ` (${entry.repollNote})` : ''}.
                  {entry.cancelledByCandidate && entry.cancelledByCandidate.length > 0 && (
                    <>
                      {' '}Taken off each candidate:
                      <CancelledVotesList breakdown={entry.cancelledByCandidate} />
                    </>
                  )}
                </div>
              )}
            </td>
            <td className="report-votes">{entry.voteCount}</td>
            <td className="report-votes">{entry.paperListCount ?? '—'}</td>
            <td>{boothStatus(entry, final)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ElectionRecordPage = (): JSX.Element => {
  const { runId } = useParams<{ runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const branchParam = searchParams.get('branch');
  const branch = isValidBranch(branchParam) ? branchParam : undefined;
  const [adminSecret] = useState(() => sessionStorage.getItem('adminSecret'));
  const [record, setRecord] = useState<ElectionRecordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEveryStep, setShowEveryStep] = useState(false);

  useEffect(() => {
    if (!adminSecret || !runId) {
      return;
    }
    setRecord(null);
    setError(null);
    getElectionRecord(runId, adminSecret, branch)
      .then(setRecord)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Failed to load the election record'));
  }, [adminSecret, runId, branch]);

  const report = record?.report ?? null;
  // Each branch elects its own winners, so results are always grouped one
  // branch at a time -- in the "Both branches" view, Dwarka then AN.
  const resultsByBranch = useMemo(() => {
    if (!report) {
      return [];
    }
    const branches: Branch[] = branch ? [branch] : ['dwarka', 'AN'];
    return branches
      .map((each) => {
        const own = report.results.filter((entry) => (entry.branch ?? 'dwarka') === each);
        return {
          branch: each,
          empty: own.length === 0,
          results:
            report.electionType === 'house'
              ? { kind: 'house' as const, houses: groupByHouse(own).filter((house) => house.posts.some((post) => post.candidates.length > 0)) }
              : { kind: 'school' as const, posts: groupByPost(own, getSchoolPostIds(each)) }
        };
      })
      .filter((entry) => !entry.empty);
  }, [report, branch]);

  // Booths in a fixed order: by house (House Elections), then branch, then
  // code -- with each re-poll's new code straight after the booth it replaced.
  const booths = useMemo(() => {
    if (!report) {
      return [];
    }
    const houseOrder = (entry: ArchivedOfficerCode) => (entry.house ? HOUSE_IDS.indexOf(entry.house) : -1);
    const originals = report.officerCodes
      .filter((entry) => !entry.replacesCode)
      .sort(
        (a, b) =>
          houseOrder(a) - houseOrder(b) ||
          branchRank(a.branch) - branchRank(b.branch) ||
          (a.officerName || '~').localeCompare(b.officerName || '~')
      );
    const ordered: ArchivedOfficerCode[] = [];
    for (const entry of originals) {
      ordered.push(entry);
      let next = entry.replacementCode;
      while (next) {
        const replacement = report.officerCodes.find((item) => item.code === next);
        if (!replacement || ordered.includes(replacement)) break;
        ordered.push(replacement);
        next = replacement.replacementCode;
      }
    }
    // Anything not reached above (e.g. a re-poll code whose original was deleted).
    return [...ordered, ...report.officerCodes.filter((entry) => !ordered.includes(entry))];
  }, [report]);

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
  if (!record) {
    return <p className="report-status">Loading the election record...</p>;
  }

  const { run, final, log } = record;
  const kind = run.electionType === 'house' ? 'House Elections' : 'School Elections';
  const routine = log.filter(isRoutineLogEntry);
  const shownLog = showEveryStep ? log : log.filter((entry) => !isRoutineLogEntry(entry));
  const routineSummary = summarizeRoutineEntries(routine);
  const used = report?.officerCodes.filter((entry) => entry.voteCount > 0 || (entry.cancelledVoteCount ?? 0) > 0).length ?? 0;
  const sealed = report?.officerCodes.filter((entry) => entry.paperListCount !== undefined).length ?? 0;
  const repolls = report?.officerCodes.filter((entry) => entry.replacementCode) ?? [];
  const cancelled = repolls.reduce((sum, entry) => sum + (entry.cancelledVoteCount ?? 0), 0);
  const teachers = new Set(report?.officerCodes.map((entry) => entry.officerName.trim()).filter(Boolean)).size;

  const fact = (label: string, value: string) => (
    <tr>
      <th style={{ width: '40%' }}>{label}</th>
      <td style={{ overflowWrap: 'anywhere' }}>{value}</td>
    </tr>
  );

  return (
    <div className="report-page">
      <div className="report-toolbar no-print" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <Link to="/admin">&larr; Back to Admin Dashboard</Link>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }} role="tablist" aria-label="Branch">
          {BRANCH_VIEWS.map((view) => (
            <button
              key={view.label}
              role="tab"
              aria-selected={branch === view.value}
              className="button"
              style={{ backgroundColor: branch === view.value ? '#1d4ed8' : '#9ca3af', padding: '0.35rem 0.8rem' }}
              onClick={() => setSearchParams(view.value ? { branch: view.value } : {})}
            >
              {view.label}
            </button>
          ))}
        </div>
        <button className="button" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <p className="report-school-name">
        {branch === 'AN' ? 'Mount Carmel School, Anand Niketan' : branch === 'dwarka' ? 'Mount Carmel School, Dwarka' : 'Mount Carmel School — Dwarka and AN'}
      </p>
      <h1>Election Record — {kind}</h1>
      <p className="report-meta" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{run.name}</p>
      {!final && (
        <p className="report-repoll-note" style={{ fontSize: '1rem', margin: '0 0 1rem 0' }}>
          ⚠ NOT FINAL YET — this election is still running. The figures below are live.
        </p>
      )}

      <h2>1. Summary</h2>
      <table className="report-table">
        <tbody>
          {fact('Started', `${formatTimestamp(run.startedAt)} by ${run.startedBy}`)}
          {fact('Ended (End of Voting)', run.closedAt ? `${formatTimestamp(run.closedAt)} by ${run.closedBy ?? 'unknown'}` : 'Still running')}
          {report && fact(final ? 'Votes counted' : 'Votes counted so far', String(report.totalVotes))}
          {report && !branch && report.totalVotesByBranch &&
            fact('By branch', `Dwarka ${report.totalVotesByBranch.dwarka ?? 0} · AN ${report.totalVotesByBranch.AN ?? 0}`)}
          {report && fact('Booths', `${plural(report.officerCodes.length, 'code')}, ${used} used to vote, ${sealed} verified and sealed`)}
          {report && fact('Polling officers', plural(teachers, 'teacher'))}
          {report && fact('Re-polls', repolls.length === 0 ? 'None' : `${repolls.length} — ${plural(cancelled, 'vote')} cancelled in all`)}
        </tbody>
      </table>

      {!report ? (
        <p className="report-empty">
          The results saved for this election are no longer in Election History, so only the log below is available.
        </p>
      ) : (
        <>
          <h2>2. Results</h2>
          {resultsByBranch.length === 0 && <p className="report-empty">No candidates.</p>}
          {resultsByBranch.map(({ branch: each, results }) => (
            <section key={each}>
              {!branch && <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.2rem' }}>{branchLabel(each)}</h3>}
              <h3 style={{ margin: '0 0 0.5rem 0' }}>Winners</h3>
              {results.kind === 'school' && (
                <ul>
                  {results.posts.map((group) => (
                    <li key={group.post}>
                      <strong>{POST_NAMES[group.post]}:</strong> {winnerText(group)}
                    </li>
                  ))}
                </ul>
              )}
              {results.kind === 'house' && (
                <ul>
                  {results.houses.map((house) => (
                    <li key={house.house}>
                      <strong>{house.house} House</strong> &mdash;{' '}
                      {house.posts.map((group) => `${POST_NAMES[group.post]}: ${winnerText(group)}`).join('; ')}
                    </li>
                  ))}
                </ul>
              )}
              <h3 style={{ margin: '1rem 0 0.5rem 0' }}>Every candidate</h3>
              {results.kind === 'school' && results.posts.map((group) => <PostResultsTable key={group.post} group={group} />)}
              {results.kind === 'house' &&
                results.houses.map((house) => (
                  <section key={house.house} className="report-house">
                    <h2>{house.house} House</h2>
                    {house.posts.map((group) => (
                      <PostResultsTable key={`${house.house}-${group.post}`} group={group} />
                    ))}
                  </section>
                ))}
            </section>
          ))}

          <h2>3. Booth by booth</h2>
          {booths.length === 0 ? (
            <p className="report-empty">No booths.</p>
          ) : run.electionType === 'house' && booths.some((entry) => entry.house) ? (
            HOUSE_IDS.filter((house) => booths.some((entry) => entry.house === house)).map((house) => (
              <section key={house}>
                <h3 style={{ margin: '0.75rem 0 0.25rem 0' }}>{house} House</h3>
                <BoothTable booths={booths.filter((entry) => entry.house === house)} showBranch={!branch} final={final} />
              </section>
            ))
          ) : (
            <BoothTable booths={booths} showBranch={!branch} final={final} />
          )}
        </>
      )}

      <h2>4. What happened</h2>
      {routineSummary.length > 0 && (
        <p className="report-meta" style={{ marginBottom: '0.5rem' }}>
          Routine steps{showEveryStep ? ' (listed below)' : ', not listed one by one'}: {routineSummary.join(', ')}.
        </p>
      )}
      {routine.length > 0 && (
        <label className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <input type="checkbox" checked={showEveryStep} onChange={(event) => setShowEveryStep(event.target.checked)} />
          Show every step
        </label>
      )}
      {shownLog.length === 0 ? (
        <p className="report-empty">Nothing was recorded.</p>
      ) : (
        <table className="report-table">
          <tbody>
            {shownLog.map((entry) => (
              <tr key={entry.id}>
                <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: '0.85rem', color: '#4b5563', width: '1%' }}>
                  {formatTimestamp(entry.timestamp)}
                </td>
                <td style={{ overflowWrap: 'anywhere' }}>
                  {!branch && entry.branch && <strong>{branchLabel(entry.branch)}: </strong>}
                  {describeLogEntry(entry)}
                  {entry.action === 'officerCode.repoll' &&
                    Array.isArray(entry.details?.cancelledByCandidate) &&
                    (entry.details.cancelledByCandidate as unknown[]).length > 0 && (
                      <CancelledVotesList breakdown={entry.details.cancelledByCandidate as CandidateVoteCount[]} />
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
