import type { HouseId } from '../types/election';

export interface HouseColor {
  text: string;
  accent: string;
  stripText: string;
}

// Matches each house's real crest color, confirmed against the school's
// own house crests (mountcarmelschool.com/co-scholastic/) and refined to
// the specific named shades given by school staff. `accent` is the vivid
// crest color, used as the background of the house name's colored strip.
// `text` is a darkened, readable version of the same hue for use as text
// directly on a white background. `stripText` is whichever of black/white
// reads clearly against `accent` -- picked per house rather than computed,
// since a handful (Anand's golden yellow, Kripa's lavender) are light
// enough to need dark text while the rest need white.
export const HOUSE_COLORS: Record<HouseId, HouseColor> = {
  Anand: { text: '#8a6d00', accent: '#ffc800', stripText: '#000000' }, // golden yellow
  Dhiraj: { text: '#c2410c', accent: '#e8650c', stripText: '#ffffff' }, // burnt orange
  Kripa: { text: '#7e22ce', accent: '#c084fc', stripText: '#3b0764' }, // lavender purple
  Namrata: { text: '#0f1f66', accent: '#1a2e8c', stripText: '#ffffff' }, // deep royal blue
  Nishtha: { text: '#6b0f28', accent: '#932145', stripText: '#ffffff' }, // burgundy
  Prem: { text: '#dc2626', accent: '#ef4444', stripText: '#ffffff' }, // scarlet red
  Satya: { text: '#047857', accent: '#10b981', stripText: '#ffffff' }, // emerald green
  Shanti: { text: '#0369a1', accent: '#0ea5e9', stripText: '#ffffff' } // cerulean blue
};
