import { HOUSE_IDS } from '../constants/houses';
import type { ElectionType, HouseId } from '../types/election';

// "Bulk Allot from List" (Officer Codes tab) -- turns a teacher spreadsheet
// (Name, WhatsApp Number, School duty Yes/blank, House duty house-name) into
// the officer-code allotments the bulk-allot API expects. Kept as pure
// functions, independent of the modal component, so the parsing/validation
// logic can be unit-tested without mounting any UI.

export interface ColumnMapping {
  name: string;
  phone: string;
  school: string;
  house: string;
}

// Fuzzy-matches spreadsheet header names to the four fields this feature
// needs -- never blocks on a wrong guess, the modal shows these in editable
// dropdowns listing every header actually found in the file.
export const guessColumnMapping = (headers: string[]): Partial<ColumnMapping> => {
  const find = (predicate: (lower: string) => boolean): string | undefined =>
    headers.find((header) => predicate(header.trim().toLowerCase()));

  return {
    phone: find((h) => h.includes('whatsapp') || h.includes('phone') || h.includes('mobile') || h.includes('number')),
    house: find((h) => h.includes('house')),
    school: find((h) => h.includes('school')),
    name: find((h) => h.includes('name') && !h.includes('house') && !h.includes('school'))
  };
};

// Best-effort normalization for an Indian mobile number into the digits-only,
// country-code-prefixed form wa.me links need (e.g. "919876543210"). Returns
// undefined -- not a guess -- when the input doesn't look like a real number,
// so the caller can flag it instead of silently building a broken link.
export const normalizeIndianPhone = (raw: string | undefined): string | undefined => {
  if (!raw) {
    return undefined;
  }
  let digits = String(raw).replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return undefined;
};

// Case/whitespace-tolerant match against the known house names -- so
// "anand", " Anand ", "ANAND" all resolve the same way.
export const matchHouseName = (raw: string | undefined): HouseId | undefined => {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  return HOUSE_IDS.find((house) => house.toLowerCase() === normalized);
};

export interface ParsedTeacherRow {
  rowNumber: number; // 1-based, matches the spreadsheet's own row numbering (header = row 1)
  name: string;
  rawPhone: string;
  phone?: string;
  schoolDuty: boolean;
  rawHouse: string;
  house?: HouseId;
  // Blocks this row from being allotted at all (e.g. no name, no duty,
  // unrecognized house). A bad/missing phone is NOT included here -- that
  // row still gets a code, just with its WhatsApp link disabled.
  errors: string[];
}

const cellText = (row: Record<string, unknown>, header: string | undefined): string => {
  if (!header) {
    return '';
  }
  const value = row[header];
  return value === undefined || value === null ? '' : String(value).trim();
};

export const parseTeacherRows = (rows: Array<Record<string, unknown>>, mapping: ColumnMapping): ParsedTeacherRow[] =>
  rows.map((row, index) => {
    const name = cellText(row, mapping.name);
    const rawPhone = cellText(row, mapping.phone);
    const rawSchool = cellText(row, mapping.school);
    const rawHouse = cellText(row, mapping.house);

    const schoolDuty = /^yes$/i.test(rawSchool);
    const house = rawHouse ? matchHouseName(rawHouse) : undefined;
    const houseDuty = Boolean(rawHouse);

    const errors: string[] = [];
    if (!name) {
      errors.push('Missing name');
    }
    if (!schoolDuty && !houseDuty) {
      errors.push('No duty marked (School/House both blank)');
    }
    if (houseDuty && !house) {
      errors.push(`Unrecognized house name "${rawHouse}"`);
    }

    return {
      rowNumber: index + 2, // header row is row 1
      name,
      rawPhone,
      phone: normalizeIndianPhone(rawPhone),
      schoolDuty,
      rawHouse,
      house,
      errors
    };
  });

export interface Allotment {
  officerName: string;
  electionType: ElectionType;
  house?: HouseId;
  // Saved with the code so the Send Codes screen can send it later.
  phone?: string;
}

// Expands every error-free row into one allotment per duty -- a teacher with
// both School and House duty produces two separate codes.
export const buildAllotments = (rows: ParsedTeacherRow[]): Allotment[] => {
  const allotments: Allotment[] = [];
  for (const row of rows) {
    if (row.errors.length > 0) {
      continue;
    }
    if (row.schoolDuty) {
      allotments.push({ officerName: row.name, electionType: 'school', phone: row.phone });
    }
    if (row.house) {
      allotments.push({ officerName: row.name, electionType: 'house', house: row.house, phone: row.phone });
    }
  }
  return allotments;
};

// Two ways to open a ready-to-send message: 'app' opens the WhatsApp app
// installed on this computer directly (no new browser window per message);
// 'web' is the wa.me link, which goes through the browser / WhatsApp Web --
// the fallback for a computer without the app.
export type WhatsAppMode = 'app' | 'web';

export const buildWhatsAppLink = (phone: string, message: string, mode: WhatsAppMode = 'web'): string =>
  mode === 'app'
    ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`
    : `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

export interface MessageTemplateVars {
  name: string;
  // One line per code, e.g. "School Elections: abc123" -- a teacher with
  // both duties gets both codes in a single message.
  codes: string;
  code: string; // the bare code(s), comma-separated
  duty: string; // "School" or "Anand House" (joined with "and" for several)
  branch: string; // "Dwarka" or "AN"
}

// "House/School" is left for the sender to trim to one before sending.
export const DEFAULT_MESSAGE_TEMPLATE = `Dear {name},
Your Polling Officer Code for the {branch} branch House/School Elections:

{codes}

Please keep this code confidential. Use it only to activate the voting kiosk for voting.

- Mount Carmel School
visit https://elections.anytimeteacher.com/`;

// Earlier standard messages. A device that saved one of these unchanged
// is moved on to the current one; a message someone edited is kept.
export const PREVIOUS_DEFAULT_MESSAGE_TEMPLATES = [
  `Dear {name}, your Polling Officer Code for the {branch} branch elections:

{codes}

Please keep this code confidential. Use it only to activate the voting kiosk on election day.

- Election Commission, Mount Carmel School`
];

export const fillMessageTemplate = (template: string, vars: MessageTemplateVars): string =>
  template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{codes\}/g, vars.codes)
    .replace(/\{code\}/g, vars.code)
    .replace(/\{duty\}/g, vars.duty)
    .replace(/\{branch\}/g, vars.branch);

// The minimum the Send Codes screen needs from each officer code.
export interface SendableCode {
  code: string;
  officerName: string;
  electionType?: ElectionType;
  house?: HouseId;
  phone?: string;
  sentAt?: number;
}

// One WhatsApp message: everything going to one teacher (same name and
// number). `pending` is what still needs sending; once that's empty the
// group is done, and re-sending repeats all of its codes.
export interface SendGroup {
  key: string;
  officerName: string;
  phone?: string;
  codes: SendableCode[];
  pending: SendableCode[];
  lastSentAt?: number;
}

export const dutyLabel = (entry: Pick<SendableCode, 'electionType' | 'house'>): string =>
  entry.electionType === 'house' || entry.house ? `${entry.house} House` : 'School';

// Groups named codes into one message per teacher, in first-seen order.
// Codes with no officer name are left out -- there is nobody to send them to.
export const groupCodesForSending = (codes: SendableCode[]): SendGroup[] => {
  const groups = new Map<string, SendGroup>();
  for (const entry of codes) {
    const officerName = entry.officerName.trim();
    if (!officerName) {
      continue;
    }
    const key = `${officerName.toLowerCase()}|${entry.phone ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, officerName, phone: entry.phone, codes: [], pending: [] };
      groups.set(key, group);
    }
    group.codes.push(entry);
    if (entry.sentAt) {
      group.lastSentAt = Math.max(group.lastSentAt ?? 0, entry.sentAt);
    } else {
      group.pending.push(entry);
    }
  }
  return [...groups.values()];
};

export const buildGroupMessage = (template: string, codes: SendableCode[], officerName: string, branch: string): string =>
  fillMessageTemplate(template, {
    name: officerName,
    codes: codes.map((entry) => `${dutyLabel(entry)} Elections: ${entry.code}`).join('\n'),
    code: codes.map((entry) => entry.code).join(', '),
    duty: codes.map(dutyLabel).join(' and '),
    branch
  });
