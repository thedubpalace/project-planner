// Deterministic skill-tag → color mapping.
// Shared pure function used for task required-skill chips AND resource skill chips,
// so the same tag string always renders the same color everywhere (design note 5).

export const TAG_HUES = [
  "violet",
  "blue",
  "cyan",
  "teal",
  "pink",
  "lime",
] as const;

export type TagHue = (typeof TAG_HUES)[number];

// Simple stable string hash (djb2-ish), always non-negative.
export function tagColorIndex(tag: string): number {
  let h = 5381;
  const s = tag.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % TAG_HUES.length;
}

export function tagHue(tag: string): TagHue {
  return TAG_HUES[tagColorIndex(tag)];
}
