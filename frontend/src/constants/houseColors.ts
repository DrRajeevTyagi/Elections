import type { HouseId } from '../types/election';

export interface HouseColor {
  text: string;
  accent: string;
}

// Matches each house's real crest color, confirmed against the school's
// own house crests (mountcarmelschool.com/co-scholastic/) and refined to
// the specific named shades given by school staff. `accent` is the vivid
// crest color, used for a decorative border/dot where contrast with text
// doesn't matter. `text` is a darkened, readable version of the same hue
// for use as actual text on a white card -- several crest colors (e.g.
// Anand's golden yellow, Shanti's cerulean blue) are too light for that
// on their own.
export const HOUSE_COLORS: Record<HouseId, HouseColor> = {
  Anand: { text: '#8a6d00', accent: '#f5c400' }, // golden yellow
  Dhiraj: { text: '#c2410c', accent: '#e8650c' }, // burnt orange
  Kripa: { text: '#7e22ce', accent: '#c084fc' }, // lavender purple
  Namrata: { text: '#1e3a8a', accent: '#2563eb' }, // deep royal blue
  Nishtha: { text: '#6b0f28', accent: '#932145' }, // burgundy
  Prem: { text: '#dc2626', accent: '#ef4444' }, // scarlet red
  Satya: { text: '#047857', accent: '#10b981' }, // emerald green
  Shanti: { text: '#0e7490', accent: '#06b6d4' } // cerulean blue
};
