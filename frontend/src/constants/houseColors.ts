import type { HouseId } from '../types/election';

export interface HouseColor {
  text: string;
  accent: string;
}

// Matches each house's real crest color, confirmed directly against the
// school's own house crests (mountcarmelschool.com/co-scholastic/), cross-
// checked with the colors the admin described. `accent` is the vivid
// crest color, used for a decorative border/dot where contrast with text
// doesn't matter. `text` is a darkened, readable version of the same hue
// for use as actual text on a white card -- several crest colors (e.g.
// Anand's golden yellow, Shanti's sky blue) are too light for that on
// their own.
export const HOUSE_COLORS: Record<HouseId, HouseColor> = {
  Anand: { text: '#8a6d00', accent: '#f5c400' }, // golden yellow
  Dhiraj: { text: '#c2410c', accent: '#e8650c' }, // burnt orange
  Kripa: { text: '#7c3aed', accent: '#a78bfa' }, // light violet
  Namrata: { text: '#312a7e', accent: '#3730a3' }, // blue
  Nishtha: { text: '#5b1a40', accent: '#7a2455' }, // jaamuni (deep purple-maroon)
  Prem: { text: '#dc2626', accent: '#ef4444' }, // red
  Satya: { text: '#16a34a', accent: '#22c55e' }, // green
  Shanti: { text: '#0284c7', accent: '#38bdf8' } // sky blue
};
