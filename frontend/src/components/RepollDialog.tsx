import { useState } from 'react';
import { orderRepoll } from '../services/api';
import { normalizeIndianPhone } from '../utils/bulkAllot';
import { REPOLL_REASON_LABELS } from '../types/api';
import type { OfficerCode, RepollReason } from '../types/api';

// "Order Re-poll" (Officer Codes tab) -- the Chief Election Commissioner
// cancelling every vote cast at one booth and issuing a fresh code so the
// booth votes again. The votes are set aside, never deleted (see backend
// routes/officerCodes.ts POST /:code/repoll). Deliberately heavy: a reason,
// an explicit vote count in the warning, and typing CONFIRM.

interface RepollDialogProps {
  adminSecret: string;
  entry: OfficerCode;
  onClose: () => void;
  // Called once the re-poll is ordered, with the fresh code.
  onOrdered: (replacement: OfficerCode) => void;
}

const CONFIRM_WORD = 'CONFIRM';

export const RepollDialog = ({ adminSecret, entry, onClose, onOrdered }: RepollDialogProps): JSX.Element => {
  const [reason, setReason] = useState<RepollReason | ''>('');
  const [note, setNote] = useState('');
  const [sameTeacher, setSameTeacher] = useState(true);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const booth = entry.house ? `${entry.house} House` : 'School';
  const votes = entry.voteCount;

  const handleSubmit = async () => {
    if (!reason) {
      setError('Choose a reason.');
      return;
    }
    if (reason === 'other' && !note.trim()) {
      setError('Describe the reason in the note.');
      return;
    }
    let phone: string | undefined;
    if (!sameTeacher) {
      if (!newName.trim()) {
        setError('Enter the name of the teacher who will run the re-poll.');
        return;
      }
      if (newPhone.trim()) {
        phone = normalizeIndianPhone(newPhone);
        if (!phone) {
          setError(`"${newPhone}" doesn't look like a valid 10-digit mobile number.`);
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    try {
      const result = await orderRepoll(
        entry.code,
        { reason, note: note.trim(), ...(sameTeacher ? {} : { officerName: newName.trim(), phone }) },
        adminSecret
      );
      onOrdered(result.replacement);
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : 'Could not order the re-poll');
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="repoll-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 900,
        overflowY: 'auto'
      }}
    >
      <div style={{ backgroundColor: '#ffffff', color: '#111827', borderRadius: '12px', padding: '1.5rem', maxWidth: '520px', width: '100%', border: '3px solid #dc2626', maxHeight: '100%', overflowY: 'auto' }}>
        <h2 id="repoll-title" style={{ marginTop: 0 }}>Order Re-poll</h2>
        <p style={{ margin: '0 0 1rem 0', overflowWrap: 'anywhere' }}>
          Booth <strong style={{ fontFamily: 'monospace' }}>{entry.code}</strong> &mdash; {booth} &mdash;{' '}
          {entry.officerName || <em>unnamed</em>}
        </p>

        <label className="form-label" htmlFor="repoll-reason">Reason</label>
        <select
          id="repoll-reason"
          className="form-input"
          value={reason}
          onChange={(event) => setReason(event.target.value as RepollReason | '')}
          style={{ width: '100%' }}
        >
          <option value="">Choose a reason&hellip;</option>
          {(Object.keys(REPOLL_REASON_LABELS) as RepollReason[]).map((key) => (
            <option key={key} value={key}>{REPOLL_REASON_LABELS[key]}</option>
          ))}
        </select>

        <label className="form-label" htmlFor="repoll-note" style={{ marginTop: '0.75rem', display: 'block' }}>
          Note {reason === 'other' ? '' : '(optional)'}
        </label>
        <textarea
          id="repoll-note"
          className="form-input"
          style={{ width: '100%', minHeight: '70px', fontFamily: 'inherit' }}
          maxLength={500}
          placeholder="What happened? e.g. Register shows 38 voters, app shows 42"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0 0 0' }}>
          <legend className="form-label">Who will run the re-poll?</legend>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="radio" name="repoll-teacher" checked={sameTeacher} onChange={() => setSameTeacher(true)} />
            The same teacher ({entry.officerName || 'unnamed'})
          </label>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="radio" name="repoll-teacher" checked={!sameTeacher} onChange={() => setSameTeacher(false)} />
            A different teacher
          </label>
          {!sameTeacher && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                className="form-input"
                style={{ margin: 0, flex: '1 1 180px' }}
                placeholder="Teacher's name"
                aria-label="New teacher's name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <input
                className="form-input"
                style={{ margin: 0, flex: '1 1 140px' }}
                inputMode="tel"
                placeholder="Mobile (optional)"
                aria-label="New teacher's mobile number"
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value)}
              />
            </div>
          )}
        </fieldset>

        <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>
            This cancels all {votes} vote{votes === 1 ? '' : 's'} cast at booth {entry.code}. This cannot be undone.
          </p>
          <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>
            The votes are kept on record but will no longer count in any result. Code {entry.code} stops working for
            good, and a new code is issued for the re-poll. Everyone who voted at this booth must vote again.
          </p>
        </div>

        <label className="form-label" htmlFor="repoll-confirm" style={{ marginTop: '0.75rem', display: 'block' }}>
          Type {CONFIRM_WORD} to go ahead
        </label>
        <input
          id="repoll-confirm"
          className="form-input"
          autoComplete="off"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          style={{ width: '100%' }}
        />

        {error && <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button
            className="button"
            style={{ backgroundColor: '#dc2626', opacity: saving || confirmText.trim() !== CONFIRM_WORD ? 0.5 : 1 }}
            disabled={saving || confirmText.trim() !== CONFIRM_WORD}
            onClick={() => void handleSubmit()}
          >
            {saving ? 'Ordering...' : `Cancel ${votes} Vote${votes === 1 ? '' : 's'} and Order Re-poll`}
          </button>
          <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} disabled={saving} onClick={onClose}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};
