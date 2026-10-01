import { describe, expect, it } from 'vitest';
import {
  guessColumnMapping,
  normalizeIndianPhone,
  matchHouseName,
  parseTeacherRows,
  buildAllotments,
  buildWhatsAppLink,
  fillMessageTemplate,
  groupCodesForSending,
  buildGroupMessage,
  DEFAULT_MESSAGE_TEMPLATE
} from './bulkAllot';

describe('guessColumnMapping', () => {
  it('matches columns by fuzzy header name, case-insensitively', () => {
    const mapping = guessColumnMapping(['Teacher Name', 'WhatsApp Number', 'School Election (Yes/Blank)', 'House Duty']);
    expect(mapping).toEqual({
      name: 'Teacher Name',
      phone: 'WhatsApp Number',
      school: 'School Election (Yes/Blank)',
      house: 'House Duty'
    });
  });

  it('does not let "School Name" or "House Name" steal the Name slot', () => {
    const mapping = guessColumnMapping(['School Name', 'House Name', 'Name', 'Mobile']);
    expect(mapping.name).toBe('Name');
  });

  it('leaves a field undefined rather than guessing wrong when nothing matches', () => {
    const mapping = guessColumnMapping(['Column A', 'Column B']);
    expect(mapping.name).toBeUndefined();
    expect(mapping.phone).toBeUndefined();
  });
});

describe('normalizeIndianPhone', () => {
  it('prepends 91 to a bare 10-digit number', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('919876543210');
  });

  it('strips spaces, dashes and a leading 0', () => {
    expect(normalizeIndianPhone('098765-43210')).toBe('919876543210');
    expect(normalizeIndianPhone('98765 43210')).toBe('919876543210');
  });

  it('keeps an already-prefixed 91xxxxxxxxxx number as-is', () => {
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('919876543210');
  });

  it('returns undefined for something that is not a real number', () => {
    expect(normalizeIndianPhone('12345')).toBeUndefined();
    expect(normalizeIndianPhone('')).toBeUndefined();
    expect(normalizeIndianPhone(undefined)).toBeUndefined();
  });
});

describe('matchHouseName', () => {
  it('matches case- and whitespace-insensitively', () => {
    expect(matchHouseName('anand')).toBe('Anand');
    expect(matchHouseName(' SATYA ')).toBe('Satya');
  });

  it('returns undefined for an unrecognized name', () => {
    expect(matchHouseName('Gryffindor')).toBeUndefined();
  });
});

describe('parseTeacherRows', () => {
  const mapping = { name: 'Name', phone: 'WhatsApp', school: 'School', house: 'House' };

  it('flags school duty only when the column literally says Yes', () => {
    const rows = parseTeacherRows(
      [{ Name: 'A', WhatsApp: '9876543210', School: 'Yes', House: '' }],
      mapping
    );
    expect(rows[0].schoolDuty).toBe(true);
    expect(rows[0].house).toBeUndefined();
    expect(rows[0].errors).toEqual([]);
  });

  it('parses a teacher with both School and House duty cleanly', () => {
    const rows = parseTeacherRows(
      [{ Name: 'B', WhatsApp: '9876543210', School: 'Yes', House: 'Dhiraj' }],
      mapping
    );
    expect(rows[0].schoolDuty).toBe(true);
    expect(rows[0].house).toBe('Dhiraj');
    expect(rows[0].errors).toEqual([]);
  });

  it('flags a row with no name', () => {
    const rows = parseTeacherRows([{ Name: '', WhatsApp: '9876543210', School: 'Yes', House: '' }], mapping);
    expect(rows[0].errors).toContain('Missing name');
  });

  it('flags a row with neither School nor House duty marked', () => {
    const rows = parseTeacherRows([{ Name: 'C', WhatsApp: '9876543210', School: '', House: '' }], mapping);
    expect(rows[0].errors).toContain('No duty marked (School/House both blank)');
  });

  it('flags an unrecognized house name but still parses the rest of the row', () => {
    const rows = parseTeacherRows([{ Name: 'D', WhatsApp: '9876543210', School: '', House: 'Gryffindor' }], mapping);
    expect(rows[0].errors).toEqual([expect.stringContaining('Gryffindor')]);
  });

  it('does not block a row on a bad phone number -- that is a warning, not an error', () => {
    const rows = parseTeacherRows([{ Name: 'E', WhatsApp: '123', School: 'Yes', House: '' }], mapping);
    expect(rows[0].phone).toBeUndefined();
    expect(rows[0].errors).toEqual([]);
  });

  it('numbers rows starting at 2 (the header is row 1)', () => {
    const rows = parseTeacherRows(
      [
        { Name: 'A', WhatsApp: '9876543210', School: 'Yes', House: '' },
        { Name: 'B', WhatsApp: '9876543211', School: 'Yes', House: '' }
      ],
      mapping
    );
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });
});

describe('buildAllotments', () => {
  it('produces one allotment for a School-only teacher', () => {
    const allotments = buildAllotments([
      { rowNumber: 2, name: 'A', rawPhone: '', schoolDuty: true, rawHouse: '', errors: [] }
    ]);
    expect(allotments).toEqual([{ officerName: 'A', electionType: 'school' }]);
  });

  it('produces two allotments for a teacher with both duties', () => {
    const allotments = buildAllotments([
      { rowNumber: 2, name: 'B', rawPhone: '', schoolDuty: true, rawHouse: 'Anand', house: 'Anand', errors: [] }
    ]);
    expect(allotments).toEqual([
      { officerName: 'B', electionType: 'school' },
      { officerName: 'B', electionType: 'house', house: 'Anand' }
    ]);
  });

  it('skips rows that have errors', () => {
    const allotments = buildAllotments([
      { rowNumber: 2, name: '', rawPhone: '', schoolDuty: true, rawHouse: '', errors: ['Missing name'] }
    ]);
    expect(allotments).toEqual([]);
  });

  it('carries the teacher\'s normalized phone onto every one of their allotments', () => {
    const allotments = buildAllotments([
      { rowNumber: 2, name: 'B', rawPhone: '98765 43210', phone: '919876543210', schoolDuty: true, rawHouse: 'Anand', house: 'Anand', errors: [] }
    ]);
    expect(allotments.map((a) => a.phone)).toEqual(['919876543210', '919876543210']);
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the message URL-encoded', () => {
    const link = buildWhatsAppLink('919876543210', 'Your code: abc123');
    expect(link).toBe('https://wa.me/919876543210?text=Your%20code%3A%20abc123');
  });

  it('builds a link that opens the installed WhatsApp app directly in app mode', () => {
    const link = buildWhatsAppLink('919876543210', 'Line 1\nLine 2', 'app');
    expect(link).toBe('whatsapp://send?phone=919876543210&text=Line%201%0ALine%202');
  });
});

describe('fillMessageTemplate', () => {
  it('substitutes every placeholder, including repeats', () => {
    const filled = fillMessageTemplate('Hi {name}, code {code} for {duty} at {branch}. Again: {name}. {codes}', {
      name: 'Mrs. Sharma',
      codes: 'Anand House Elections: ab2k7m',
      code: 'ab2k7m',
      duty: 'Anand House',
      branch: 'Dwarka'
    });
    expect(filled).toBe('Hi Mrs. Sharma, code ab2k7m for Anand House at Dwarka. Again: Mrs. Sharma. Anand House Elections: ab2k7m');
  });

  it('the default template only uses known placeholders', () => {
    const filled = fillMessageTemplate(DEFAULT_MESSAGE_TEMPLATE, {
      name: 'A',
      codes: 'E',
      code: 'B',
      duty: 'C',
      branch: 'D'
    });
    expect(filled).not.toContain('{');
  });
});

describe('groupCodesForSending', () => {
  it('puts a teacher\'s School and House codes into one message, and skips unnamed codes', () => {
    const groups = groupCodesForSending([
      { code: 'aaa111', officerName: 'Mrs. Sharma', electionType: 'school', phone: '919876543210' },
      { code: 'zzz999', officerName: '' },
      { code: 'bbb222', officerName: 'Mr. Rao', electionType: 'school', phone: '919800000000' },
      { code: 'ccc333', officerName: 'mrs. sharma ', electionType: 'house', house: 'Anand', phone: '919876543210' }
    ]);
    expect(groups.map((g) => [g.officerName, g.codes.map((c) => c.code)])).toEqual([
      ['Mrs. Sharma', ['aaa111', 'ccc333']],
      ['Mr. Rao', ['bbb222']]
    ]);
  });

  it('keeps two teachers with the same name but different numbers apart', () => {
    const groups = groupCodesForSending([
      { code: 'aaa111', officerName: 'A. Kumar', phone: '919876543210' },
      { code: 'bbb222', officerName: 'A. Kumar', phone: '919800000000' }
    ]);
    expect(groups).toHaveLength(2);
  });

  it('tracks which codes are still unsent, so a later code goes out on its own', () => {
    const [group] = groupCodesForSending([
      { code: 'aaa111', officerName: 'A', phone: '919876543210', sentAt: 1000 },
      { code: 'bbb222', officerName: 'A', phone: '919876543210' }
    ]);
    expect(group.pending.map((c) => c.code)).toEqual(['bbb222']);
    expect(group.lastSentAt).toBe(1000);
  });
});

describe('buildGroupMessage', () => {
  it('lists every code on its own line with its election', () => {
    const message = buildGroupMessage(
      '{name} ({branch}):\n{codes}',
      [
        { code: 'aaa111', officerName: 'A', electionType: 'school' },
        { code: 'ccc333', officerName: 'A', electionType: 'house', house: 'Anand' }
      ],
      'Mrs. Sharma',
      'AN'
    );
    expect(message).toBe('Mrs. Sharma (AN):\nSchool Elections: aaa111\nAnand House Elections: ccc333');
  });
});
