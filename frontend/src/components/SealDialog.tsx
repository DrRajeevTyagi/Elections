import { useState } from 'react';
import { sealOfficerCode } from '../services/api';
import type { OfficerCode } from '../types/api';

// "Verify & Seal" (Officer Codes tab) -- after polling closes at a booth,
// the Chief Election Commissioner counts the voters on the printed Paper
// List and types that number here. If it matches the app's count, the booth
// is sealed for good; if not, the remedy is Order Re-poll. The server checks
// the match too (routes/officerCodes.ts POST /:code/seal) -- this screen
// only makes the mismatch visible before anything is sent.

interface SealDialogProps {
  adminSecret: string;
  entry: OfficerCode;
  onClose: () => void;
  onSealed: () => void;
  // The counts don't match -- switch to the re-poll window for this booth.
  onOrderRepoll: () => void;
}

export const SealDialog = ({ adminSecret, entry, onClose, onSealed, onOrderRepoll }: SealDialogProps): JSX.Element => {
  const [paperList, setPaperList] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const booth = entry.house ? `${entry.house} House` : 'School';
  const appCount = entry.voteCount;
  const typed = paperList.trim() === '' ? null : Number(paperList.trim());
  const typedIsValid = typed !== null && Number.isInteger(typed) && typed >= 0;
  const matches = typedIsValid && typed === appCount;
  const mismatch = typedIsValid && typed !== appCount;

  const handleSeal = async () => {
    if (!matches) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await sealOfficerCode(entry.code, appCount, adminSecret);
      onSealed();
    } catch (sealError) {
      setError(sealError instanceof Error ? sealError.message : 'Could not seal this booth');
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="seal-title"
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
      <div style={{ backgroundColor: '#ffffff', color: '#111827', borderRadius: '12px', padding: '1.5rem', maxWidth: '460px', width: '100%', border: '3px solid #1e293b' }}>
        <h2 id="seal-title" style={{ marginTop: 0 }}>🔒 Verify &amp; Seal</h2>
        <p style={{ margin: '0 0 1rem 0', overflowWrap: 'anywhere' }}>
          Booth <strong style={{ fontFamily: 'monospace' }}>{entry.code}</strong> &mdash; {booth} &mdash;{' '}
          {entry.officerName || <em>unnamed</em>}
        </p>

        <div style={{ padding: '0.75rem', backgroundColor: '#f1f5f9', borderRadius: '6px', marginBottom: '1rem' }}>
          Votes counted by the app at this booth:{' '}
          <strong style={{ fontSize: '1.4rem' }}>{appCount}</strong>
        </div>

        <label className="form-label" htmlFor="seal-paper-list">
          Number of voters on the Paper List
        </label>
        <input
          id="seal-paper-list"
          className="form-input"
          inputMode="numeric"
          autoComplete="off"
          value={paperList}
          onChange={(event) => setPaperList(event.target.value.replace(/[^\d]/g, ''))}
          style={{ width: '100%', fontSize: '1.2rem' }}
        />

        {matches && (
          <p role="status" style={{ color: '#166534', fontWeight: 700 }}>
            ✓ The counts match. Sealing makes this booth final &mdash; it can no longer be reopened or re-polled.
          </p>
        )}
        {mismatch && (
          <div role="alert" style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              The counts don&apos;t match: the app has {appCount}, the Paper List has {typed}.
            </p>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>
              Count the Paper List again. If it still doesn&apos;t match, order a re-poll at this booth.
            </p>
          </div>
        )}
        {error && <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button
            className="button"
            style={{ backgroundColor: '#1e293b', opacity: saving || !matches ? 0.5 : 1 }}
            disabled={saving || !matches}
            onClick={() => void handleSeal()}
          >
            {saving ? 'Sealing...' : '🔒 Verify & Seal'}
          </button>
          {mismatch && (
            <button className="button" style={{ backgroundColor: '#7c3aed' }} disabled={saving} onClick={onOrderRepoll}>
              Order Re-poll
            </button>
          )}
          <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} disabled={saving} onClick={onClose}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};
