import { randomInt } from 'crypto';

// Lowercase -- easier to type on a phone keyboard, which defaults to
// lowercase, than a code that visually reads as needing capitals (decided
// 2026-09-22). Excludes i, l, o, 0, 1 to avoid characters that are easy to
// confuse when a polling officer copies, reads aloud, or types a code on a
// small screen. Matching is case-insensitive regardless (see
// datastore.ts's codesMatch) so a code typed in caps out of habit, or an
// older code generated before this change (stored uppercase), both still
// work.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;

const generateCode = (): string => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
};

export const generateUniqueCodes = (count: number, existingCodes: string[]): string[] => {
  // Compare case-insensitively: existingCodes may include older
  // uppercase-generated codes, and a new lowercase candidate that only
  // differs from one of those by case must still be treated as a collision
  // -- otherwise two different stored records could both answer to the same
  // code once activation matches case-insensitively.
  const seen = new Set(existingCodes.map((code) => code.toLowerCase()));
  const result: string[] = [];
  while (result.length < count) {
    const candidate = generateCode();
    if (!seen.has(candidate)) {
      seen.add(candidate);
      result.push(candidate);
    }
  }
  return result;
};
