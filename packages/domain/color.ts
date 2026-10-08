/**
 * Accent colour rules. Each business picks one accent; these functions keep
 * any pick readable:
 *
 * 1. The accent must reach 3:1 against the white surface (WCAG non-text
 *    contrast), so buttons and selected states stay visible.
 * 2. The text drawn on the accent (white or near-black ink, whichever reads
 *    better) must reach 4.5:1 (WCAG AA for normal text).
 *
 * If a pick fails either rule, it is darkened step by step until both pass,
 * and the admin console tells the admin it was adjusted.
 */

export const WHITE = "#ffffff";
export const INK = "#1c1b19";

type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Not a hex colour: ${hex}`);
  return (
    0.2126 * channel(rgb[0]) +
    0.7152 * channel(rgb[1]) +
    0.0722 * channel(rgb[2])
  );
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black ink, whichever contrasts more with the accent. */
export function readableInk(accent: string): typeof WHITE | typeof INK {
  return contrastRatio(accent, WHITE) >= contrastRatio(accent, INK)
    ? WHITE
    : INK;
}

function mixTowardBlack(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Not a hex colour: ${hex}`);
  return toHex([
    rgb[0] * (1 - amount),
    rgb[1] * (1 - amount),
    rgb[2] * (1 - amount),
  ]);
}

export type AccentTokens = {
  /** The accent to store and render, possibly darkened. */
  accent: string;
  /** Text colour to draw on the accent. */
  accentInk: typeof WHITE | typeof INK;
  /** True when the requested colour had to be darkened to stay readable. */
  adjusted: boolean;
};

function passes(accent: string): boolean {
  const ink = readableInk(accent);
  return contrastRatio(accent, WHITE) >= 3 && contrastRatio(accent, ink) >= 4.5;
}

/** Turn a requested accent into tokens that are guaranteed readable. */
export function accentTokens(requested: string): AccentTokens {
  const rgb = parseHex(requested);
  if (!rgb) throw new Error(`Not a hex colour: ${requested}`);
  const base = toHex(rgb);
  if (passes(base))
    return { accent: base, accentInk: readableInk(base), adjusted: false };

  for (let step = 1; step <= 20; step++) {
    const candidate = mixTowardBlack(base, step * 0.05);
    if (passes(candidate)) {
      return {
        accent: candidate,
        accentInk: readableInk(candidate),
        adjusted: true,
      };
    }
  }
  return { accent: INK, accentInk: WHITE, adjusted: true };
}
