import type { OfficerCode } from '../types/api';

// Duty colours on the Officer Codes tab -- one look tells the Election
// Commissioner where each polling officer stands:
//   white  -> fresh duty, code not sent yet
//   yellow -> sent on WhatsApp, teacher hasn't entered it yet
//   green  -> ready: teacher typed the code on a kiosk (backend readyAt)
//   red    -> polling closed at this booth (or End of Voting) -- waiting
//             for the Paper List check
//   white with a lock -> verified against the Paper List and sealed
//   grey   -> re-polled booth, code dead for good
// Order matters: re-polled and sealed codes are also closed, and a closed
// code may still carry an old ready/sent mark.

export type DutyStatus = 'repolled' | 'sealed' | 'over' | 'ready' | 'sent' | 'fresh';

export const dutyStatus = (entry: Pick<OfficerCode, 'repoll' | 'seal' | 'closedAt' | 'readyAt' | 'sentAt'>): DutyStatus => {
  if (entry.repoll) return 'repolled';
  if (entry.seal) return 'sealed';
  if (entry.closedAt) return 'over';
  if (entry.readyAt) return 'ready';
  if (entry.sentAt) return 'sent';
  return 'fresh';
};

export const DUTY_STYLES: Record<DutyStatus, { background: string; border: string; text: string; label: string }> = {
  fresh: { background: '#ffffff', border: '#d1d5db', text: '#374151', label: 'Not sent' },
  sent: { background: '#fef9c3', border: '#facc15', text: '#854d0e', label: 'Sent -- not ready yet' },
  ready: { background: '#dcfce7', border: '#22c55e', text: '#166534', label: 'Ready' },
  over: { background: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'Polling closed' },
  sealed: { background: '#ffffff', border: '#1e293b', text: '#1e293b', label: '🔒 Sealed' },
  repolled: { background: '#f3f4f6', border: '#9ca3af', text: '#6b7280', label: 'Re-polled' }
};

// What still stands between an election and End of Voting -- mirrors the
// server's own check (backend services/runService.ts endOfVotingBlockers),
// which is what actually enforces it. One rule: every code of the election,
// both branches, is either deleted, or closed AND verified & sealed. A
// re-polled code doesn't count (it's dead for good; its fresh code does).
export interface EndOfVotingChecklist {
  unallotted: OfficerCode[]; // delete
  open: OfficerCode[]; // close, then Verify & Seal
  unsealed: OfficerCode[]; // Verify & Seal
}

export const endOfVotingChecklist = (codes: OfficerCode[], electionType: 'school' | 'house'): EndOfVotingChecklist => {
  const relevant = codes.filter(
    (entry) => (entry.electionType ?? (entry.house ? 'house' : 'school')) === electionType && !entry.repoll
  );
  return {
    unallotted: relevant.filter((entry) => !entry.officerName.trim()),
    open: relevant.filter((entry) => entry.officerName.trim() && !entry.closedAt),
    unsealed: relevant.filter((entry) => entry.officerName.trim() && entry.closedAt && !entry.seal)
  };
};

export const countDutyStatuses =(codes: OfficerCode[]): Record<DutyStatus, number> => {
  const counts: Record<DutyStatus, number> = { fresh: 0, sent: 0, ready: 0, over: 0, sealed: 0, repolled: 0 };
  for (const entry of codes) {
    counts[dutyStatus(entry)] += 1;
  }
  return counts;
};
