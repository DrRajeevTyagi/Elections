import { describe, expect, it } from 'vitest';
import {
  guessColumnMapping,
  normalizeIndianPhone,
  matchHouseName,
  parseTeacherRows,
  buildAllotments,
  buildWhatsAppLink,
  fillMessageTemplate,
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
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the message URL-encoded', () => {
    const link = buildWhatsAppLink('919876543210', 'Your code: abc123');
    expect(link).toBe('https://wa.me/919876543210?text=Your%20code%3A%20abc123');
  });
});

describe('fillMessageTemplate', () => {
  it('substitutes every placeholder, including repeats', () => {
    const filled = fillMessageTemplate('Hi {name}, code {code} for {duty} at {branch}. Again: {name}.', {
      name: 'Mrs. Sharma',
      code: 'ab2k7m',
      duty: 'Anand House',
      branch: 'Dwarka'
    });
    expect(filled).toBe('Hi Mrs. Sharma, code ab2k7m for Anand House at Dwarka. Again: Mrs. Sharma.');
  });

  it('the default template only uses known placeholders', () => {
    const filled = fillMessageTemplate(DEFAULT_MESSAGE_TEMPLATE, {
      name: 'A',
      code: 'B',
      duty: 'C',
      branch: 'D'
    });
    expect(filled).not.toContain('{');
  });
});
