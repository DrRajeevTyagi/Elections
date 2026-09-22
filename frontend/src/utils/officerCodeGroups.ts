import { HOUSE_IDS } from '../constants/houses';
import type { OfficerCode } from '../types/api';
import type { HouseId } from '../types/election';

export interface OfficerCodeGroup {
  label: string;
  codes: OfficerCode[];
}

// Groups a list of officer codes by house (in a fixed house order), with
// unbound/school codes in their own group at the end -- so it reads as "n
// codes for Anand House, then n for Dhiraj House, etc." rather than
// whatever order they happened to be generated in. Shared by the Polling
// Officer Codes admin tab and the printable code-allotment roster.
export const groupOfficerCodesByHouse = (codes: OfficerCode[]): OfficerCodeGroup[] => {
  const byHouse = new Map<HouseId, OfficerCode[]>();
  const unbound: OfficerCode[] = [];
  for (const entry of codes) {
    if (entry.house) {
      const list = byHouse.get(entry.house) ?? [];
      list.push(entry);
      byHouse.set(entry.house, list);
    } else {
      unbound.push(entry);
    }
  }

  const groups: OfficerCodeGroup[] = [];
  for (const houseId of HOUSE_IDS) {
    const houseCodes = byHouse.get(houseId);
    if (houseCodes && houseCodes.length > 0) {
      groups.push({ label: `${houseId} House`, codes: [...houseCodes].sort((a, b) => a.createdAt - b.createdAt) });
    }
  }
  if (unbound.length > 0) {
    groups.push({ label: 'School Posts', codes: [...unbound].sort((a, b) => a.createdAt - b.createdAt) });
  }
  return groups;
};
