import { describe, expect, it } from 'vitest';
import { generateUniqueCodes } from './officerCode.js';

describe('generateUniqueCodes', () => {
  it('never generates a code that differs from an existing one only by case', () => {
    // Regression guard: codes now match case-insensitively everywhere they're
    // looked up (see datastore.ts's codesMatch), so two stored codes that
    // differ only by case would be indistinguishable to a polling officer
    // typing one of them -- generation must treat that as a real collision,
    // not just an exact-string one.
    const existing = ['ABCDEF', 'ghjkmn']; // mixed case, as real data could be post-migration
    const generated = generateUniqueCodes(500, existing);

    const allLower = generated.map((c) => c.toLowerCase());
    expect(new Set(allLower).size).toBe(allLower.length); // no duplicates among themselves
    expect(allLower).not.toContain('abcdef');
    expect(allLower).not.toContain('ghjkmn');
  });

  it('only uses the lowercase, ambiguous-character-free alphabet', () => {
    const generated = generateUniqueCodes(200, []);
    for (const code of generated) {
      expect(code).toMatch(/^[a-z2-9]{6}$/);
      expect(code).not.toMatch(/[ilo01]/);
    }
  });
});
