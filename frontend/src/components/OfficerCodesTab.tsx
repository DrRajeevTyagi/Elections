import { useEffect, useMemo, useState } from 'react';
import { HOUSE_IDS } from '../constants/houses';
import { REPOLL_REASON_LABELS } from '../types/api';
import type { ElectionRun, OfficerCode } from '../types/api';
import type { Branch, ElectionType, HouseId } from '../types/election';
import { DUTY_STYLES, dutyStatus, endOfVotingChecklist } from '../utils/dutyStatus';
import { groupOfficerCodesByHouse } from '../utils/officerCodeGroups';
import './OfficerCodesTab.css';

// The Polling Officer Codes tab, laid out as approved on 2026-10-09: pick
// an election (School / House) and a branch, then one of three steps --
//   1. Before the election: upload the teacher list, send codes, print the
//      list, start fresh; the code list, where names are edited or codes
//      deleted.
//   2. Election day: the End of Voting checklist, then every booth with
//      its one next step (Close → Verify & Seal → done), and Re-poll.
//   More: making blank codes by hand, clearing code lockouts.
// It opens on Election day while that election is running, otherwise on
// step 1. Every action is still carried out (and checked) by the parent
// page and the server -- this only lays them out.

type Step = 'before' | 'day' | 'more';
type Filter = 'all' | 'fresh' | 'sent' | 'ready' | 'previous' | 'polling' | 'over' | 'sealed' | 'repolled';

export interface OfficerCodesTabProps {
  officerCodes: OfficerCode[];
  branch: Branch;
  onBranchChange: (branch: Branch) => void;
  currentRun: ElectionRun | null;
  busy: boolean;
  onOpenBulkAllot: () => void;
  onOpenSendCodes: () => void;
  // Resolves true once saved, so the row can leave edit mode.
  onSaveName: (code: string, officerName: string) => Promise<boolean>;
  onDelete: (code: string) => void;
  onClose: (code: string) => void;
  onReopen: (code: string) => void;
  onSeal: (entry: OfficerCode) => void;
  onRepoll: (entry: OfficerCode) => void;
  onFreshDuties: (electionType: ElectionType) => void;
  // Resolves true once removed.
  onRemoveAll: (electionType: ElectionType) => Promise<boolean>;
  onGenerate: (electionType: ElectionType, count: number, house: HouseId | 'all' | undefined) => void;
  onClearLockouts: () => void;
}

export const codeElectionType = (entry: OfficerCode): ElectionType => entry.electionType ?? (entry.house ? 'house' : 'school');
const branchName = (branch: Branch): string => (branch === 'AN' ? 'AN' : 'Dwarka');
const electionName = (type: ElectionType): string => (type === 'house' ? 'House' : 'School');
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

// Which chip a code falls under, for each step.
const beforeGroup = (entry: OfficerCode): Filter => {
  const duty = dutyStatus(entry);
  return duty === 'over' || duty === 'sealed' || duty === 'repolled' ? 'previous' : duty;
};
const dayGroup = (entry: OfficerCode): Filter => {
  const duty = dutyStatus(entry);
  return duty === 'fresh' || duty === 'sent' || duty === 'ready' ? 'polling' : duty;
};

const Pill = ({ entry }: { entry: OfficerCode }): JSX.Element => {
  const style = DUTY_STYLES[dutyStatus(entry)];
  return (
    <span className="codes-pill" style={{ backgroundColor: style.background, borderColor: style.border, color: style.text }}>
      {entry.repoll ? `Re-polled → ${entry.repoll.replacementCode}` : entry.seal ? `🔒 Sealed · Paper List ${entry.seal.paperListCount}` : style.label}
    </span>
  );
};

export const OfficerCodesTab = (props: OfficerCodesTabProps): JSX.Element => {
  const { officerCodes, branch, currentRun, busy } = props;
  const runningType = currentRun?.status === 'running' ? currentRun.electionType : null;

  const [election, setElection] = useState<ElectionType>(runningType ?? 'school');
  // null = automatic: Election day while this election runs, else step 1.
  const [chosenStep, setChosenStep] = useState<Step | null>(null);
  // When an election starts (or ends), show it, on its automatic step.
  useEffect(() => {
    if (runningType) {
      setElection(runningType);
    }
    setChosenStep(null);
  }, [runningType]);
  const running = runningType === election;

  const step: Step = chosenStep ?? (running ? 'day' : 'before');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ code: string; name: string } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [makeHouse, setMakeHouse] = useState<HouseId | 'all'>('all');
  const [makeCount, setMakeCount] = useState('1');

  useEffect(() => {
    setFilter('all');
  }, [step, election, branch]);

  const codes = useMemo(
    () => officerCodes.filter((entry) => codeElectionType(entry) === election && (entry.branch ?? 'dwarka') === branch),
    [officerCodes, election, branch]
  );
  const named = codes.filter((entry) => entry.officerName.trim());
  const sentCount = named.filter((entry) => entry.sentAt || entry.readyAt).length;

  const groupOf = step === 'day' ? dayGroup : beforeGroup;
  const counts = useMemo(() => {
    const result: Partial<Record<Filter, number>> = {};
    for (const entry of codes) {
      const key = groupOf(entry);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }, [codes, groupOf]);
  const shown = filter === 'all' ? codes : codes.filter((entry) => groupOf(entry) === filter);
  const groups = groupOfficerCodesByHouse(shown);

  const chips: Array<{ key: Filter; label: string; colour: string }> =
    step === 'day'
      ? [
          { key: 'polling', label: 'Polling', colour: DUTY_STYLES.ready.background },
          { key: 'over', label: 'Closed, to seal', colour: DUTY_STYLES.over.background },
          { key: 'sealed', label: 'Sealed', colour: '#ffffff' },
          { key: 'repolled', label: 'Re-polled', colour: DUTY_STYLES.repolled.background }
        ]
      : [
          { key: 'fresh', label: 'Not sent', colour: '#ffffff' },
          { key: 'sent', label: 'Sent, not ready', colour: DUTY_STYLES.sent.background },
          { key: 'ready', label: 'Ready', colour: DUTY_STYLES.ready.background },
          { key: 'previous', label: 'Left from last election', colour: DUTY_STYLES.over.background }
        ];

  // Mirrors the server: while its election runs, a code that has votes, a
  // seal or a re-poll can't be deleted; between elections any code can.
  const canDelete = (entry: OfficerCode): boolean =>
    !running || (!entry.repoll && !entry.replacesCode && !entry.seal && entry.voteCount === 0);

  const checklist = useMemo(() => {
    if (!running) {
      return null;
    }
    const all = endOfVotingChecklist(officerCodes, election);
    const total = officerCodes.filter((entry) => codeElectionType(entry) === election && !entry.repoll).length;
    const left = all.unallotted.length + all.open.length + all.unsealed.length;
    return { ...all, total, left };
  }, [officerCodes, election, running]);

  const saveName = async () => {
    if (!editing) return;
    if (await props.onSaveName(editing.code, editing.name.trim())) {
      setEditing(null);
    }
  };

  const removeAll = async () => {
    if (await props.onRemoveAll(election)) {
      setRemoveConfirm(null);
    }
  };

  const allCodesOfElection = officerCodes.filter((entry) => codeElectionType(entry) === election).length;

  const renderBeforeRow = (entry: OfficerCode) => {
    const isEditing = editing?.code === entry.code;
    return (
      <tr key={entry.code} data-duty={dutyStatus(entry)}>
        <td className="codes-code" data-label="Code">{entry.code}</td>
        <td data-label="Teacher" style={{ overflowWrap: 'anywhere' }}>
          {isEditing ? (
            <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                style={{ margin: 0, padding: '0.45rem 0.6rem', flex: '1 1 160px' }}
                aria-label={`Teacher for code ${entry.code}`}
                value={editing.name}
                autoFocus
                onChange={(event) => setEditing({ code: entry.code, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName();
                  if (event.key === 'Escape') setEditing(null);
                }}
              />
              <button className="button" style={{ padding: '0.45rem 0.9rem' }} disabled={busy} onClick={() => void saveName()}>
                Save
              </button>
              <button className="codes-link" onClick={() => setEditing(null)}>Cancel</button>
            </span>
          ) : (
            entry.officerName.trim() || <em style={{ color: '#991b1b' }}>Not allotted</em>
          )}
        </td>
        <td data-label="WhatsApp">
          {entry.phone ? `…${entry.phone.slice(-4)}` : <span style={{ color: '#991b1b' }}>No number</span>}
        </td>
        <td data-label="Status"><Pill entry={entry} /></td>
        <td className="codes-right">
          {!isEditing && (
            <span className="codes-actions">
              <button className="codes-link" disabled={busy} onClick={() => setEditing({ code: entry.code, name: entry.officerName })}>
                Edit
              </button>
              {canDelete(entry) && (
                <button className="codes-link red" disabled={busy} onClick={() => props.onDelete(entry.code)}>
                  Delete
                </button>
              )}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const renderDayRow = (entry: OfficerCode) => {
    const allotted = Boolean(entry.officerName.trim());
    const canRepoll = running && allotted && !entry.repoll && !entry.seal;
    let actions: JSX.Element;
    if (entry.repoll) {
      actions = <span style={{ color: '#64748b' }}>—</span>;
    } else if (entry.seal) {
      actions = <span style={{ color: '#64748b' }}>Done</span>;
    } else if (!allotted) {
      // One path per code: never allotted → delete it (End of Voting rule).
      actions = (
        <button className="button" style={{ backgroundColor: '#991b1b' }} disabled={busy} onClick={() => props.onDelete(entry.code)}>
          Delete Unused Code
        </button>
      );
    } else if (entry.closedAt) {
      actions = (
        <>
          {running && (
            <button className="button" style={{ backgroundColor: '#1e293b' }} disabled={busy} onClick={() => props.onSeal(entry)}>
              Verify &amp; Seal
            </button>
          )}
          <button className="codes-link" disabled={busy} onClick={() => props.onReopen(entry.code)}>Reopen</button>
        </>
      );
    } else {
      actions = (
        <button className="button" style={{ backgroundColor: '#c2410c' }} disabled={busy} onClick={() => props.onClose(entry.code)}>
          Close Booth
        </button>
      );
    }
    return (
      <tr key={entry.code} data-duty={dutyStatus(entry)} style={{ color: entry.repoll ? '#64748b' : undefined }}>
        <td className="codes-code" data-label="Booth">
          <span style={{ textDecoration: entry.repoll ? 'line-through' : undefined }}>{entry.code}</span>
          {entry.replacesCode && <span className="codes-sub">Re-poll of {entry.replacesCode}</span>}
        </td>
        <td data-label="Teacher" style={{ overflowWrap: 'anywhere' }}>
          {entry.officerName.trim() || <em style={{ color: '#991b1b' }}>Not allotted</em>}
          {entry.repoll && (
            <span className="codes-sub">
              {plural(entry.repoll.cancelledVoteCount, 'vote')} cancelled · {REPOLL_REASON_LABELS[entry.repoll.reason]}
            </span>
          )}
        </td>
        <td className="codes-right" data-label="Votes" style={{ fontWeight: 700 }}>{entry.voteCount}</td>
        <td data-label="Status"><Pill entry={entry} /></td>
        <td className="codes-right">
          <span className="codes-actions">
            {actions}
            {canRepoll && (
              <button className="codes-link purple" disabled={busy} onClick={() => props.onRepoll(entry)}>Re-poll</button>
            )}
          </span>
        </td>
      </tr>
    );
  };

  const renderList = (title: string, columns: string[], renderRow: (entry: OfficerCode) => JSX.Element) => (
    <section className="codes-list" aria-label={title}>
      <div className="codes-list-head">
        <h3>{title}</h3>
        <div className="codes-chips">
          <button className="codes-chip" style={{ background: '#ffffff' }} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All {codes.length}
          </button>
          {chips
            .filter((chip) => chip.key !== 'previous' || (counts.previous ?? 0) > 0)
            .map((chip) => (
              <button
                key={chip.key}
                className="codes-chip"
                style={{ background: chip.colour }}
                aria-pressed={filter === chip.key}
                onClick={() => setFilter(chip.key)}
              >
                {chip.label} {counts[chip.key] ?? 0}
              </button>
            ))}
        </div>
      </div>
      {codes.length === 0 ? (
        <p style={{ margin: 0, color: '#475569' }}>
          No {electionName(election)} Elections codes for {branchName(branch)} yet.
          {step === 'before' && ' Upload the teacher list to make them.'}
        </p>
      ) : shown.length === 0 ? (
        <p style={{ margin: 0, color: '#475569' }}>None.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="codes-table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={column} className={index === columns.length - 1 || column === 'Votes' ? 'codes-right' : undefined}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.label}>
                <tr className="codes-group">
                  <td colSpan={columns.length}>
                    {group.label} ({group.codes.length})
                  </td>
                </tr>
                {group.codes.map(renderRow)}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );

  const stepButton = (value: Step, num: string, title: string, sub: string) => (
    <button
      role="tab"
      aria-selected={step === value}
      className={`codes-step${value === 'more' ? ' more' : ''}`}
      onClick={() => setChosenStep(value)}
    >
      <span className="codes-step-num">{num}</span>
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
    </button>
  );

  return (
    <div className="codes-tab">
      <div className="codes-header">
        <h2 style={{ margin: 0 }}>Polling Officer Codes</h2>
        <div className="codes-pickers">
          <span>
            <span className="codes-picker-label">Election</span>
            <span className="codes-seg" role="group" aria-label="Election">
              {(['school', 'house'] as const).map((type) => (
                <button key={type} aria-pressed={election === type} onClick={() => setElection(type)}>
                  {electionName(type)}
                </button>
              ))}
            </span>
          </span>
          <span>
            <span className="codes-picker-label">Branch</span>
            <span className="codes-seg" role="group" aria-label="Branch">
              {(['dwarka', 'AN'] as const).map((each) => (
                <button key={each} aria-pressed={branch === each} onClick={() => props.onBranchChange(each)}>
                  {branchName(each)}
                </button>
              ))}
            </span>
          </span>
        </div>
      </div>

      <div className="codes-steps" role="tablist" aria-label="Step">
        {stepButton('before', '1', 'Before the election', 'Upload, send, print')}
        {stepButton('day', '2', 'Election day', 'Close, seal, re-poll')}
        {stepButton('more', '…', 'More', 'Rarely needed')}
      </div>

      {step === 'before' && (
        <>
          <p className="codes-note">
            {running ? (
              <>{electionName(election)} Elections are <strong>running now</strong>. Names can still be corrected here.</>
            ) : (
              <>{electionName(election)} Elections are <strong>not running</strong>. Get the codes ready here, then start the election from the Dashboard.</>
            )}
          </p>

          <div className="codes-cards">
            <div className="codes-card">
              <h3><span className="codes-step-num" style={{ background: '#1d4ed8', color: '#ffffff' }}>1</span>Upload the teacher list</h3>
              <p>Every teacher on the list gets a code, with their name and WhatsApp number. One list per branch.</p>
              <p><strong style={{ color: '#111827' }}>{plural(codes.length, 'code')}</strong> in {branchName(branch)} {electionName(election)} Elections</p>
              <button className="button" disabled={busy} onClick={props.onOpenBulkAllot}>Upload Teacher List</button>
            </div>
            <div className="codes-card">
              <h3><span className="codes-step-num" style={{ background: '#1d4ed8', color: '#ffffff' }}>2</span>Send codes on WhatsApp</h3>
              <p>One message per teacher, with all their codes. Picks up where you stopped.</p>
              <div className="codes-progress" aria-hidden="true">
                <div style={{ width: `${named.length ? Math.round((sentCount / named.length) * 100) : 0}%` }} />
              </div>
              <p><strong style={{ color: '#111827' }}>{sentCount} of {named.length}</strong> sent</p>
              <button className="button" disabled={busy} onClick={props.onOpenSendCodes}>Send Codes</button>
            </div>
            <div className="codes-card">
              <h3><span className="codes-step-num" style={{ background: '#1d4ed8', color: '#ffffff' }}>3</span>Print the code list</h3>
              <p>Who has which code, for the {branchName(branch)} Election Head.</p>
              <button
                className="button codes-quiet-btn"
                onClick={() => window.open(`/admin/report/officer-codes/${branch}`, '_blank')}
              >
                Print {branchName(branch)} Code List
              </button>
            </div>
          </div>

          <div className="codes-fresh-start">
            <div style={{ flex: '1 1 340px' }}>
              <strong>Starting a new election?</strong>
              <p>
                Keep the same teachers and just clear last time&apos;s colours, or remove every {electionName(election)} code
                (Dwarka and AN) and upload a fresh list.
                {running && ' Not while this election is running.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button className="button codes-quiet-btn" disabled={busy || running} onClick={() => props.onFreshDuties(election)}>
                Reset Colours to White
              </button>
              <button
                className="button codes-danger-btn"
                disabled={busy || running || allCodesOfElection === 0}
                onClick={() => setRemoveConfirm(removeConfirm === null ? '' : null)}
              >
                Remove All {electionName(election)} Codes
              </button>
            </div>
            {removeConfirm !== null && !running && (
              <div style={{ flex: '1 1 100%', padding: '0.8rem', background: '#fef2f2', border: '2px solid #991b1b', borderRadius: '10px' }}>
                <p style={{ color: '#7f1d1d' }}>
                  This deletes <strong>all {allCodesOfElection}</strong> {electionName(election)} Elections codes, in{' '}
                  <strong>both Dwarka and AN</strong>. Past elections in Election History are not affected.
                </p>
                <label className="form-label" htmlFor="remove-all-confirm" style={{ display: 'block', margin: '0.5rem 0 0.25rem' }}>
                  Type CONFIRM to go ahead
                </label>
                <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    id="remove-all-confirm"
                    className="form-input"
                    autoComplete="off"
                    value={removeConfirm}
                    onChange={(event) => setRemoveConfirm(event.target.value)}
                    style={{ maxWidth: '200px', padding: '0.5rem 0.7rem' }}
                  />
                  <button
                    className="button"
                    style={{ backgroundColor: '#991b1b' }}
                    disabled={busy || removeConfirm.trim() !== 'CONFIRM'}
                    onClick={() => void removeAll()}
                  >
                    Remove All {allCodesOfElection} Codes
                  </button>
                  <button className="codes-link" onClick={() => setRemoveConfirm(null)}>Cancel</button>
                </span>
              </div>
            )}
          </div>

          {renderList(
            `Codes: ${branchName(branch)}, ${electionName(election)} Elections`,
            ['Code', 'Teacher', 'WhatsApp', 'Status', 'Change'],
            renderBeforeRow
          )}
        </>
      )}

      {step === 'day' && (
        <>
          {checklist ? (
            <div className={`codes-checklist${checklist.left === 0 ? ' done' : ''}`} role="status">
              <strong style={{ fontSize: '1.05rem' }}>
                {electionName(election)} Elections running since{' '}
                {new Date(currentRun!.startedAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}
              </strong>
              {checklist.left === 0 ? (
                <span>Every booth is closed and sealed. End of Voting can be pressed on the Dashboard.</span>
              ) : (
                <span>
                  <strong>Before End of Voting (Dwarka and AN together):</strong>{' '}
                  {[
                    checklist.open.length > 0 && `${plural(checklist.open.length, 'booth')} still polling (close, then Verify & Seal)`,
                    checklist.unsealed.length > 0 && `${checklist.unsealed.length} closed waiting for Verify & Seal`,
                    checklist.unallotted.length > 0 && `${plural(checklist.unallotted.length, 'unused code')} to delete`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              <div className="codes-progress" aria-hidden="true">
                <div style={{ width: `${checklist.total ? Math.round(((checklist.total - checklist.left) / checklist.total) * 100) : 100}%` }} />
              </div>
              <small>{checklist.total - checklist.left} of {plural(checklist.total, 'booth')} done (Dwarka and AN)</small>
            </div>
          ) : (
            <p className="codes-note">
              {electionName(election)} Elections are <strong>not running</strong>. This step is for election day. Start the
              election from the Dashboard.
            </p>
          )}
          {renderList(`Booths: ${branchName(branch)}, ${electionName(election)} Elections`, ['Booth', 'Teacher', 'Votes', 'Status', 'Next step'], renderDayRow)}
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            To correct a teacher&apos;s name, use step 1. It can be done at any time.
          </p>
        </>
      )}

      {step === 'more' && (
        <div className="codes-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <div className="codes-card">
            <h3>Make blank codes by hand</h3>
            <p>
              Not normally needed: uploading the teacher list makes and names every code in one go. Use this for a spare
              code, then add the teacher&apos;s name in step 1. Made for {branchName(branch)}, {electionName(election)} Elections.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
              {election === 'house' && (
                <span>
                  <label className="form-label" htmlFor="make-house" style={{ display: 'block' }}>House</label>
                  <select
                    id="make-house"
                    className="form-input"
                    value={makeHouse}
                    onChange={(event) => setMakeHouse(event.target.value as HouseId | 'all')}
                  >
                    <option value="all">All 8 houses</option>
                    {HOUSE_IDS.map((house) => (
                      <option key={house} value={house}>{house}</option>
                    ))}
                  </select>
                </span>
              )}
              <span>
                <label className="form-label" htmlFor="make-count" style={{ display: 'block' }}>
                  {election === 'house' && makeHouse === 'all' ? 'How many each' : 'How many'}
                </label>
                <input
                  id="make-count"
                  className="form-input"
                  type="number"
                  min={1}
                  max={200}
                  value={makeCount}
                  onChange={(event) => setMakeCount(event.target.value)}
                  style={{ width: '90px' }}
                />
              </span>
              <button
                className="button codes-quiet-btn"
                disabled={busy}
                onClick={() => props.onGenerate(election, Number(makeCount), election === 'house' ? makeHouse : undefined)}
              >
                Make Codes
              </button>
            </div>
          </div>
          <div className="codes-card">
            <h3>Clear code lockouts</h3>
            <p>If a device is blocked after too many wrong codes were typed on it, this unblocks every device straight away.</p>
            <button className="button codes-quiet-btn" disabled={busy} onClick={props.onClearLockouts}>
              Clear Code Lockouts
            </button>
          </div>
          <div className="codes-card" style={{ background: '#f8fafc' }}>
            <h3>Moved elsewhere</h3>
            <p>
              <strong>Print Officer Turnout</strong> is now part of the Election Record (Election History tab), in its
              booth-by-booth table.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
