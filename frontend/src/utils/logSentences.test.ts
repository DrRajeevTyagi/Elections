import { describe, expect, it } from 'vitest';
import { describeLogEntry, isRoutineLogEntry, summarizeRoutineEntries } from './logSentences';
import type { LogEntry } from '../types/api';

const entry = (action: string, details?: Record<string, unknown>, actor = 'Rajeev'): LogEntry => ({
  id: action,
  timestamp: 1,
  runId: 'run-1',
  actor,
  action,
  details
});

describe('describeLogEntry', () => {
  it('reads a re-poll as a plain sentence', () => {
    expect(
      describeLogEntry(
        entry('officerCode.repoll', {
          code: 'abc123',
          officerName: 'Mrs. Sharma',
          house: 'Anand',
          reason: 'count-mismatch',
          note: 'Register says 38',
          cancelledVoteCount: 42,
          replacementCode: 'new999',
          replacementOfficerName: 'Mrs. Sharma'
        })
      )
    ).toBe(
      'Rajeev ordered a re-poll at booth abc123 (Mrs. Sharma), Anand House. 42 votes cancelled. Reason: Vote count mismatch (Register says 38). New code: new999, for Mrs. Sharma.'
    );
  });

  it('reads a seal, a start and an end', () => {
    expect(describeLogEntry(entry('officerCode.seal', { code: 'abc123', officerName: 'Jane', paperListCount: 38, appCount: 38 }))).toBe(
      'Rajeev verified booth abc123 (Jane) against the Paper List and sealed it: Paper List 38, app 38.'
    );
    expect(describeLogEntry(entry('run.start', { name: 'House Elections 2026', votesCleared: 0 }))).toBe(
      'Rajeev started the election "House Elections 2026".'
    );
    expect(describeLogEntry(entry('run.close', { totalVotes: 1 }))).toBe(
      'Rajeev pressed End of Voting. Final count: 1 vote. The results were saved to Election History.'
    );
  });

  it('names a polling officer acting from a kiosk', () => {
    expect(describeLogEntry(entry('officerCode.close', { code: 'abc123' }, 'officer:Mrs. Sharma'))).toBe(
      'Polling officer Mrs. Sharma closed booth abc123.'
    );
  });

  it('still says something for an action it does not know', () => {
    expect(describeLogEntry(entry('something.new'))).toBe('Rajeev: something.new');
  });
});

describe('routine steps', () => {
  it('are counted rather than listed', () => {
    const entries = [
      entry('officerCode.bulkAllot', { count: 3 }),
      entry('officerCode.name', { code: 'a', officerName: 'A' }),
      entry('officerCode.name', { code: 'b', officerName: 'B' }),
      entry('officerCode.markSent', { code: 'a' }),
      entry('officerCode.markSent', { code: 'b' }),
      entry('officerCode.unmarkSent', { code: 'b' }),
      entry('officerCode.seal', { code: 'a' })
    ];
    expect(entries.filter(isRoutineLogEntry)).toHaveLength(6);
    expect(summarizeRoutineEntries(entries)).toEqual(['3 codes made', '2 codes allotted to teachers', '1 code sent on WhatsApp']);
  });
});
