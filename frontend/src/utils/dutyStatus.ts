import type { OfficerCode } from '../types/api';

// Duty colours on the Officer Codes tab -- one look tells the Election
// Commissioner where each polling officer stands:
//   white  -> fresh duty, code not sent yet
//   yellow -> sent on WhatsApp, teacher hasn't entered it yet
//   green  -> ready: teacher typed the code on a kiosk (backend readyAt)
//   red    -> duty over: End of Voting, or that booth was closed
//   grey   -> re-polled booth, code dead for good
// Order matters: a re-polled code is also closed, and a closed code may
// still carry an old ready/sent mark.

export type DutyStatus = 'repolled' | 'over' | 'ready' | 'sent' | 'fresh';

export const dutyStatus = (entry: Pick<OfficerCode, 'repoll' | 'closedAt' | 'readyAt' | 'sentAt'>): DutyStatus => {
  if (entry.repoll) return 'repolled';
  if (entry.closedAt) return 'over';
  if (entry.readyAt) return 'ready';
  if (entry.sentAt) return 'sent';
  return 'fresh';
};

export const DUTY_STYLES: Record<DutyStatus, { background: string; border: string; text: string; label: string }> = {
  fresh: { background: '#ffffff', border: '#d1d5db', text: '#374151', label: 'Not sent' },
  sent: { background: '#fef9c3', border: '#facc15', text: '#854d0e', label: 'Sent -- not ready yet' },
  ready: { background: '#dcfce7', border: '#22c55e', text: '#166534', label: 'Ready' },
  over: { background: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'Duty over' },
  repolled: { background: '#f3f4f6', border: '#9ca3af', text: '#6b7280', label: 'Re-polled' }
};

export const countDutyStatuses = (codes: OfficerCode[]): Record<DutyStatus, number> => {
  const counts: Record<DutyStatus, number> = { fresh: 0, sent: 0, ready: 0, over: 0, repolled: 0 };
  for (const entry of codes) {
    counts[dutyStatus(entry)] += 1;
  }
  return counts;
};
