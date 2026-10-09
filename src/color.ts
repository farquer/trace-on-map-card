import { ENTITY_COLORS } from './utils.js';

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1(?:\.0)?))?\s*\)$/i;

/**
 * Allow only safe CSS color literals for inline styles.
 * Returns fallback when input is missing or unsafe.
 */
export function sanitizeCssColor(
  raw: string | undefined | null,
  fallback: string = ENTITY_COLORS[0]
): string {
  if (raw == null) return fallback;
  const s = String(raw).trim();
  if (!s || s.length > 64) return fallback;
  if (HEX_RE.test(s)) return s;
  const m = s.match(RGB_RE);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if ([r, g, b].some((c) => c > 255)) return fallback;
    if (m[4] !== undefined) {
      return `rgba(${r}, ${g}, ${b}, ${m[4]})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }
  return fallback;
}
