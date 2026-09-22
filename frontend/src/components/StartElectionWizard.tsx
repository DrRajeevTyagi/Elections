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

type Step = 'name' | 'type' | 'votes' | 'codes' | 'distributed' | 'candidates' | 'open';
const STEPS: Step[] = ['name', 'type', 'votes', 'codes', 'distributed', 'candidates', 'open'];
const STEP_TITLES: Record<Step, string> = {
  name: 'Name this election',
  type: 'Confirm the election type',
  votes: 'Vote counts will reset to zero',
  codes: 'Are polling officer codes ready?',
  distributed: 'Have codes been distributed?',
  candidates: 'Candidates will be locked',
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
  const [changingType, setChangingType] = useState(false);
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

  const handleConfirmType = async (chosen: ElectionType) => {
    if (chosen === electionType && !changingType) {
      goNext();
      return;
    }
    if (chosen === activeElectionType) {
      setLocalElectionType(chosen);
      setChangingType(false);
      goNext();
      return;
    }
    try {
      setTypeChangeLoading(true);
      setWizError(null);
      await setElectionType(chosen, adminSecret);
      setLocalElectionType(chosen);
      setChangingType(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <button
          type="button"
          className="button"
          style={{ backgroundColor: '#6b7280', padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
          onClick={onClose}
          disabled={submitting}
        >
          Abort
        </button>
      </div>
      <h3 style={{ margin: '0 0 0.75rem 0' }}>{STEP_TITLES[step]}</h3>

      {step === 'name' && (
        <div>
          <label className="form-label" htmlFor="wizard-election-name">Election name</label>
          <input
            id="wizard-election-name"
            className="form-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. School Elections -- Term 1 2026"
            autoFocus
          />
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0.5rem 0 0.75rem 0' }}>
            This name identifies this election in the Election History and Activity Log tabs.
          </p>
          <button className="button" onClick={goNext} disabled={!name.trim()}>
            Continue
          </button>
        </div>
      )}

      {step === 'type' && (
        <div>
          {!changingType ? (
            <>
              <p style={{ margin: '0 0 0.75rem 0' }}>
                This election is currently set for <strong>{electionType === 'house' ? 'House' : 'School'} Elections</strong>.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="button" onClick={() => handleConfirmType(electionType)}>
                  Yes, proceed
                </button>
                <button
                  type="button"
                  className="button"
                  style={{ backgroundColor: '#6b7280' }}
                  onClick={() => setChangingType(true)}
                >
                  No, change it
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="button"
                style={{ backgroundColor: electionType === 'school' ? '#16a34a' : '#6b7280' }}
                onClick={() => handleConfirmType('school')}
                disabled={typeChangeLoading}
              >
                🏫 School
              </button>
              <button
                className="button"
                style={{ backgroundColor: electionType === 'house' ? '#16a34a' : '#6b7280' }}
                onClick={() => handleConfirmType('house')}
                disabled={typeChangeLoading}
              >
                🏠 House
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'votes' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Starting this election resets all {electionType === 'house' ? 'House' : 'School'} Elections vote counts
            to zero, across both branches. Candidates are left untouched.
          </p>
          <button className="button" onClick={goNext}>Proceed</button>
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
            <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={onClose}>
              Go generate codes first
            </button>
          </div>
        </div>
      )}

      {step === 'distributed' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Confirm every polling officer has received their code before voting opens.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={goNext}>Yes, distributed -- proceed</button>
            <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={onClose}>
              Not yet -- abort
            </button>
          </div>
        </div>
      )}

      {step === 'candidates' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Candidates cannot be changed once voting starts.
          </p>
          <button className="button" onClick={goNext}>Proceed</button>
        </div>
      )}

      {step === 'open' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Ready to open <strong>{electionType === 'house' ? 'House' : 'School'} Elections</strong>
            {name.trim() ? <> &mdash; "{name.trim()}"</> : null}. All activities related to this election will be
            found under the Activity Log tab, and under Election History once it closes.
          </p>
          <button className="button" onClick={handleOpenPoll} disabled={submitting}>
            {submitting ? 'Opening...' : '🗳️ Open the Poll -- Start Voting'}
          </button>
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
