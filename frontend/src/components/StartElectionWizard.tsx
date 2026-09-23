import { useState } from 'react';
import { setElectionType, startRecording, openPoll } from '../services/api';
import type { ElectionType } from '../types/election';
import type { OfficerCode } from '../types/api';

interface StartElectionWizardProps {
  adminSecret: string;
  activeElectionType: ElectionType | null;
  officerCodes: OfficerCode[];
  onClose: () => void;
  // Called once the run has started AND the poll has actually opened --
  // the wizard is one continuous action, not "arm then separately open".
  onStarted: (message: string) => void;
}

// "Name this election" is deliberately the last checklist step, not the
// first -- everything else (type, votes, codes, candidates) is decided
// before the admin commits to naming the record, per feedback that naming
// felt more natural right before the final action than as the opening
// question.
type Step = 'type' | 'votes' | 'codes' | 'allotted' | 'candidates' | 'name' | 'open';
const STEPS: Step[] = ['type', 'votes', 'codes', 'allotted', 'candidates', 'name', 'open'];
const STEP_TITLES: Record<Step, string> = {
  type: 'Select the Election type (School or House)',
  votes: 'Vote counts will reset to zero',
  codes: 'Are polling officer codes ready?',
  allotted: 'Have the codes been allotted to persons?',
  candidates: 'Candidates will be locked',
  name: 'Name this election',
  open: 'Open the poll'
};

// A guided, step-by-step replacement for the old one-click "Start
// Recording" button -- walks the admin through everything that matters
// before voting opens, and can be abandoned with zero effect at any point
// before the final step. Nothing hits the backend until "Open the Poll" is
// clicked, except an inline election-type change on the Confirm step (the
// same real change the old standalone Election Type control made).
export const StartElectionWizard = ({
  adminSecret,
  activeElectionType,
  officerCodes,
  onClose,
  onStarted
}: StartElectionWizardProps): JSX.Element => {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [electionType, setLocalElectionType] = useState<ElectionType>(activeElectionType ?? 'school');
  const [typeChangeLoading, setTypeChangeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wizError, setWizError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const goNext = () => {
    setWizError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setWizError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  // Kept right next to whichever buttons move the flow forward on each
  // step -- not tucked away in a corner -- so the "get out of this" option
  // is always where the admin is already looking.
  const AbortButton = () => (
    <button
      type="button"
      className="button"
      style={{ backgroundColor: '#6b7280' }}
      onClick={onClose}
      disabled={submitting || typeChangeLoading}
    >
      Abort
    </button>
  );

  const handleSelectType = async (chosen: ElectionType) => {
    if (chosen === activeElectionType) {
      setLocalElectionType(chosen);
      goNext();
      return;
    }
    try {
      setTypeChangeLoading(true);
      setWizError(null);
      await setElectionType(chosen, adminSecret);
      setLocalElectionType(chosen);
      goNext();
    } catch (typeError) {
      setWizError(typeError instanceof Error ? typeError.message : 'Failed to change election type');
    } finally {
      setTypeChangeLoading(false);
    }
  };

  // Codes are prep work now (generated any time, not gated on a run) -- see
  // ROADMAP.md. This just reports what's already there so the admin isn't
  // taking that on faith; it's a checklist, not a live gate.
  const relevantCodes = officerCodes.filter((entry) => (electionType === 'house' ? Boolean(entry.house) : !entry.house));
  const dwarkaCount = relevantCodes.filter((entry) => (entry.branch ?? 'dwarka') === 'dwarka').length;
  const anCount = relevantCodes.filter((entry) => entry.branch === 'AN').length;
  const unnamedCount = relevantCodes.filter((entry) => !entry.officerName).length;

  const handleOpenPoll = async () => {
    try {
      setSubmitting(true);
      setWizError(null);
      const run = await startRecording(electionType, name.trim(), adminSecret);
      await openPoll(adminSecret);
      onStarted(
        `Voting is now open for ${run.electionType === 'house' ? 'House' : 'School'} Elections -- recorded as "${run.name}".`
      );
    } catch (submitError) {
      setWizError(submitError instanceof Error ? submitError.message : 'Failed to open the poll');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '1.25rem', backgroundColor: '#f3f4f6', borderRadius: '8px', border: '2px solid #3b82f6' }}>
      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <h3 style={{ margin: '0 0 0.75rem 0' }}>{STEP_TITLES[step]}</h3>

      {step === 'type' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="button"
              style={{ backgroundColor: electionType === 'school' ? '#16a34a' : '#6b7280' }}
              onClick={() => handleSelectType('school')}
              disabled={typeChangeLoading}
            >
              🏫 School
            </button>
            <button
              className="button"
              style={{ backgroundColor: electionType === 'house' ? '#16a34a' : '#6b7280' }}
              onClick={() => handleSelectType('house')}
              disabled={typeChangeLoading}
            >
              🏠 House
            </button>
            <AbortButton />
          </div>
        </div>
      )}

      {step === 'votes' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Starting this election resets all {electionType === 'house' ? 'House' : 'School'} Elections vote counts
            to zero, across both branches. Candidates are left untouched.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={goNext}>Proceed</button>
            <AbortButton />
          </div>
        </div>
      )}

      {step === 'codes' && (
        <div>
          {relevantCodes.length === 0 ? (
            <p style={{ margin: '0 0 0.75rem 0', color: '#92400e' }}>
              No {electionType === 'house' ? 'House' : 'School'} codes have been generated yet.
            </p>
          ) : (
            <p style={{ margin: '0 0 0.75rem 0' }}>
              {dwarkaCount} code{dwarkaCount === 1 ? '' : 's'} generated for Dwarka, {anCount} for AN
              {unnamedCount > 0 ? ` -- ${unnamedCount} not yet named` : ''}.
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="button" onClick={goNext}>Proceed</button>
            <AbortButton />
          </div>
        </div>
      )}

      {step === 'allotted' && (
        <div>
          <p style={{ margin: '0 0 0.5rem 0' }}>
            Confirm every polling officer has been allotted their code.
          </p>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.75rem 0' }}>
            Note: a code cannot be used to cast votes without allotting it to a person.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={goNext}>Yes, allotted -- proceed</button>
            <AbortButton />
          </div>
        </div>
      )}

      {step === 'candidates' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Candidates cannot be changed once voting starts.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={goNext}>Proceed</button>
            <AbortButton />
          </div>
        </div>
      )}

      {step === 'name' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}
        >
          <label className="form-label" htmlFor="wizard-election-name" style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Election name
          </label>
          <input
            id="wizard-election-name"
            className="form-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. School Elections -- Term 1 2026"
            autoFocus
            style={{ fontSize: '1.05rem', padding: '0.65rem 0.75rem' }}
          />
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0.5rem 0 1rem 0' }}>
            This name identifies this election in the Election History and Activity Log tabs.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={goNext} disabled={!name.trim()}>
              Continue
            </button>
            <AbortButton />
          </div>
        </div>
      )}

      {step === 'open' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Ready to open <strong>{electionType === 'house' ? 'House' : 'School'} Elections</strong>
            {name.trim() ? <> &mdash; "{name.trim()}"</> : null}. All activities related to this election will be
            found under the Activity Log tab, and under Election History once it closes.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="button" onClick={handleOpenPoll} disabled={submitting}>
              {submitting ? 'Opening...' : '🗳️ Open the Poll -- Start Voting'}
            </button>
            <AbortButton />
          </div>
        </div>
      )}

      {wizError && <p style={{ color: '#dc2626', fontWeight: 600, marginTop: '0.75rem' }}>{wizError}</p>}

      {stepIndex > 0 && step !== 'open' && (
        <button
          type="button"
          className="button"
          style={{ backgroundColor: 'transparent', color: '#6b7280', boxShadow: 'none', marginTop: '0.75rem', padding: '0.2rem 0' }}
          onClick={goBack}
          disabled={submitting || typeChangeLoading}
        >
          &larr; Back
        </button>
      )}
    </div>
  );
};
