import { describe, expect, it } from 'vitest';
import { countDutyStatuses, dutyStatus } from './dutyStatus';
import type { OfficerCode } from '../types/api';

const code = (overrides: Partial<OfficerCode>): OfficerCode => ({ code: 'abc123', officerName: 'A', createdAt: 1, voteCount: 0, ...overrides });

const repoll = { orderedAt: 1, orderedBy: 'x', reason: 'disruption' as const, note: '', cancelledVoteCount: 0, replacementCode: 'new999' };

describe('dutyStatus', () => {
  it('goes white -> yellow -> green -> red as the duty progresses', () => {
    expect(dutyStatus(code({}))).toBe('fresh');
    expect(dutyStatus(code({ sentAt: 1 }))).toBe('sent');
    expect(dutyStatus(code({ sentAt: 1, readyAt: 2 }))).toBe('ready');
    expect(dutyStatus(code({ sentAt: 1, readyAt: 2, closedAt: 3 }))).toBe('over');
  });

  it('counts a teacher who entered the code as ready even if it was never marked sent', () => {
    expect(dutyStatus(code({ readyAt: 2 }))).toBe('ready');
  });

  it('shows a re-polled code as re-polled, even though it is also closed', () => {
    expect(dutyStatus(code({ closedAt: 3, repoll }))).toBe('repolled');
  });

  it('a closed booth checked against the Paper List is sealed', () => {
    expect(dutyStatus(code({ readyAt: 2, closedAt: 3, seal: { sealedAt: 4, sealedBy: 'x', paperListCount: 9, appCount: 9 } }))).toBe('sealed');
  });

  it('counts each colour', () => {
    expect(
      countDutyStatuses([code({}), code({ sentAt: 1 }), code({ readyAt: 1 }), code({ readyAt: 1 }), code({ closedAt: 1 })])
    ).toEqual({ fresh: 1, sent: 1, ready: 2, over: 1, sealed: 0, repolled: 0 });
  });
});
