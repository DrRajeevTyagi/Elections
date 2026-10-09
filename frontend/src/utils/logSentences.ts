import { REPOLL_REASON_LABELS } from '../types/api';
import type { LogEntry, RepollReason } from '../types/api';

// Turns one Activity Log entry into a plain sentence for people, e.g.
// "Rajeev sealed booth abc123 (Mrs. Sharma): Paper List 38, app 38." --
// instead of the stored "officerCode.seal code=..." form. Used by the
// Election Record and the Activity Log tab. Anything not listed here (an
// action added later) still reads sensibly, just less nicely.

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
const electionName = (value: unknown): string => (value === 'house' ? 'House' : 'School');
const branchName = (value: unknown): string => (value === 'AN' ? 'AN' : 'Dwarka');

// A polling officer's own action from a kiosk is logged as "officer:<name>".
export const describeActor = (actor: string): string =>
  actor.startsWith('officer:') ? `Polling officer ${actor.slice('officer:'.length)}` : actor;

const booth = (details: Record<string, unknown>): string => {
  const name = text(details.officerName).trim();
  return `booth ${text(details.code)}${name ? ` (${name})` : ''}`;
};

export const describeLogEntry = (entry: LogEntry): string => {
  const who = describeActor(entry.actor);
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'run.start':
      return `${who} started the election${text(d.name) ? ` "${text(d.name)}"` : ''}.${num(d.votesCleared) > 0 ? ` ${plural(num(d.votesCleared), 'vote')} left from the previous election were cleared.` : ''}`;
    case 'run.close':
      return `${who} pressed End of Voting. Final count: ${plural(num(d.totalVotes), 'vote')}. The results were saved to Election History.`;
    case 'poll.open':
      return `${who} opened voting.`;
    case 'poll.close':
      return `${who} paused voting.`;
    case 'poll.reset':
      return `${who} reset the poll, clearing the votes.`;
    case 'officerCode.generate':
      return `${who} made ${plural(num(d.count), 'new code')} for ${d.house ? `${text(d.house)} House` : 'School Elections'} (${branchName(d.branch)}).`;
    case 'officerCode.bulkAllot':
      return `${who} loaded a teacher list: ${plural(num(d.count), 'code')} made and allotted.`;
    case 'officerCode.name':
      return text(d.officerName).trim()
        ? `${who} allotted code ${text(d.code)} to ${text(d.officerName).trim()}.`
        : `${who} removed the teacher's name from code ${text(d.code)}.`;
    case 'officerCode.phone':
      return `${who} updated the WhatsApp number for code ${text(d.code)}.`;
    case 'officerCode.markSent':
      return `${who} sent code ${text(d.code)}${text(d.officerName).trim() ? ` to ${text(d.officerName).trim()}` : ''} on WhatsApp.`;
    case 'officerCode.unmarkSent':
      return `${who} marked code ${text(d.code)} as not sent.`;
    case 'officerCode.freshDuties':
      return `${who} reset ${plural(num(d.count), `${electionName(d.electionType)} Elections code`)} to white for a fresh election.`;
    case 'officerCode.removeAll':
      return `${who} removed all ${plural(num(d.count), `${electionName(d.electionType)} Elections code`)} (Dwarka and AN).`;
    case 'officerCode.close':
      return `${who} closed ${booth(d)}.`;
    case 'officerCode.reopen':
      return `${who} reopened ${booth(d)}.`;
    case 'officerCode.delete':
      return `${who} deleted code ${text(d.code)}.`;
    case 'officerCode.seal':
      return `${who} verified ${booth(d)} against the Paper List and sealed it: Paper List ${num(d.paperListCount)}, app ${num(d.appCount)}.`;
    case 'officerCode.repoll': {
      const reason = REPOLL_REASON_LABELS[d.reason as RepollReason] ?? 'no reason given';
      const note = text(d.note).trim();
      const newTeacher = text(d.replacementOfficerName).trim();
      return (
        `${who} ordered a re-poll at ${booth(d)}${d.house ? `, ${text(d.house)} House` : ''}. ` +
        `${plural(num(d.cancelledVoteCount), 'vote')} cancelled. Reason: ${reason}${note ? ` (${note})` : ''}. ` +
        `New code: ${text(d.replacementCode)}${newTeacher ? `, for ${newTeacher}` : ''}.`
      );
    }
    case 'archive.create':
      return `${who} saved the current results to Election History${text(d.name) ? ` as "${text(d.name)}"` : ''}.`;
    case 'archive.rename':
      return `${who} renamed an Election History entry to "${text(d.name)}".`;
    case 'archive.delete':
      return `${who} deleted an Election History entry.`;
    case 'admin.session.claim':
      return `${who} logged in to the admin console.`;
    case 'admin.session.takeover':
      return `${who} took control of the admin console${text(d.evicted) ? ` from ${text(d.evicted)}` : ''}${text(d.reason) ? ` (${text(d.reason)})` : ''}.`;
    case 'admin.session.takeoverRequested':
      return `${text(d.requester) || who} asked ${text(d.holder) || 'the device in control'} for control of the admin console.`;
    case 'admin.session.takeoverDenied':
      return `${text(d.holder) || who} refused ${text(d.requester) || 'a'} request for control of the admin console.`;
    case 'admin.session.takeoverExpired':
      return `${text(d.requester) || who}'s request for control of the admin console expired with no answer.`;
    case 'admin.rateLimit.reset':
      return `${who} cleared the wrong-code lockouts on all devices.`;
    default:
      return `${who}: ${entry.action}`;
  }
};

// Everyday preparation steps -- one per teacher, so there can be hundreds.
// The Election Record counts these instead of listing each one (they are
// all still in the log, and can be shown on request).
const ROUTINE_ACTIONS = new Set([
  'officerCode.name',
  'officerCode.phone',
  'officerCode.markSent',
  'officerCode.unmarkSent',
  'officerCode.generate',
  'officerCode.bulkAllot',
  'admin.session.claim'
]);

export const isRoutineLogEntry = (entry: LogEntry): boolean => ROUTINE_ACTIONS.has(entry.action);

// "160 codes allotted to teachers, 152 sent on WhatsApp, 3 logins" -- what
// the routine steps that aren't listed one by one add up to.
export const summarizeRoutineEntries = (entries: LogEntry[]): string[] => {
  const count = (action: string) => entries.filter((entry) => entry.action === action).length;
  const lines: string[] = [];
  const named = count('officerCode.name');
  const sent = count('officerCode.markSent') - count('officerCode.unmarkSent');
  const made = entries
    .filter((entry) => entry.action === 'officerCode.generate' || entry.action === 'officerCode.bulkAllot')
    .reduce((sum, entry) => sum + num(entry.details?.count), 0);
  if (made > 0) lines.push(`${plural(made, 'code')} made`);
  if (named > 0) lines.push(`${plural(named, 'code')} allotted to teachers`);
  if (sent > 0) lines.push(`${plural(sent, 'code')} sent on WhatsApp`);
  if (count('officerCode.phone') > 0) lines.push(`${plural(count('officerCode.phone'), 'WhatsApp number')} updated`);
  if (count('admin.session.claim') > 0) lines.push(`${plural(count('admin.session.claim'), 'admin login')}`);
  return lines;
};
