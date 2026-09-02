import { randomInt } from 'crypto';

// Excludes I, O, 0, 1 to avoid characters that are easy to confuse when a
// polling officer copies or reads the code aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const generateCode = (): string => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
};

export const generateUniqueCodes = (count: number, existingCodes: string[]): string[] => {
  const seen = new Set(existingCodes);
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
