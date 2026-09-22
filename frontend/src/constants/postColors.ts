import type { PostId } from '../types/election';

export interface PostColor {
  background: string;
  text: string;
  accent: string;
}

// One distinct color per post so a results screen full of posts reads at a
// glance instead of as a wall of identical black-on-white headings. Chosen
// to stay clearly distinguishable from each other, with enough contrast
// between `text` and `background` for a bold heading at ~14px (WCAG AA).
export const POST_COLORS: Record<PostId, PostColor> = {
  HB: { background: '#dbeafe', text: '#1d4ed8', accent: '#2563eb' },
  HG: { background: '#fce7f3', text: '#be185d', accent: '#db2777' },
  SSC: { background: '#dcfce7', text: '#15803d', accent: '#16a34a' },
  SRC: { background: '#ffedd5', text: '#c2410c', accent: '#ea580c' },
  SCC: { background: '#ede9fe', text: '#6d28d9', accent: '#7c3aed' },
  HC: { background: '#cffafe', text: '#0e7490', accent: '#06b6d4' },
  HCC: { background: '#e0e7ff', text: '#4338ca', accent: '#6366f1' },
  HSC: { background: '#d1fae5', text: '#047857', accent: '#10b981' }
};
