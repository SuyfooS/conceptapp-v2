/**
 * Accent colour rules. Each business picks one accent; these functions keep
 * any pick readable, in light and in dark:
 *
 * 1. The accent must reach 3:1 against every surface it sits on (WCAG non-text
 *    contrast), so buttons and selected states stay visible.
 * 2. The text drawn on the accent (white or near-black ink, whichever reads
 *    better) must reach 4.5:1 (WCAG AA for normal text).
 *
 * If a pick fails either rule, it is darkened step by step until both pass,
 * and the admin console tells the admin it was adjusted. The dark appearance
 * starts from that result and lifts its lightness, keeping hue and chroma, so
 * a business's colour stays recognisable on a dark screen.
 */

export const WHITE = "#ffffff";
export const INK = "#101114";

/** ConceptApp's own colour, for the admin console and marketing. */
export const BRAND = "#9000ff";

/**
 * The surfaces an accent sits on in each appearance: bg, surface and elevated
 * from app/globals.css. tooling/tokens.test.ts keeps them in step.
 */
export const LIGHT_SURFACES = ["#eeeff2", "#ffffff"] as const;
export const DARK_SURFACES = ["#08090b", "#17181b", "#202125"] as const;

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

function rgbOf(hex: string): Rgb {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Not a hex colour: ${hex}`);
  return rgb;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = rgbOf(hex);
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
  const rgb = rgbOf(hex);
  return toHex([
    rgb[0] * (1 - amount),
    rgb[1] * (1 - amount),
    rgb[2] * (1 - amount),
  ]);
}

function toOklab(hex: string): Rgb {
  const [r, g, b] = rgbOf(hex).map(channel) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([lightness, a, b]: Rgb): string {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const gamma = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4);
    const encoded = c <= 0.0031308 ? v : v - 0.055;
    return Math.min(1, Math.max(0, encoded)) * 255;
  };
  return toHex([
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

export type AccentTokens = {
  /** The accent to store and render in light, possibly darkened. */
  accent: string;
  /** Text colour to draw on the accent in light. */
  accentInk: typeof WHITE | typeof INK;
  /** The accent to render in dark, possibly lifted. */
  accentDark: string;
  /** Text colour to draw on the accent in dark. */
  accentDarkInk: typeof WHITE | typeof INK;
  /** True when the requested colour had to be darkened to stay readable. */
  adjusted: boolean;
};

function passes(accent: string, surfaces: readonly string[]): boolean {
  const ink = readableInk(accent);
  return (
    surfaces.every((surface) => contrastRatio(accent, surface) >= 3) &&
    contrastRatio(accent, ink) >= 4.5
  );
}

function liftForDark(accent: string): string {
  if (passes(accent, DARK_SURFACES)) return accent;
  const [lightness, a, b] = toOklab(accent);
  for (let step = 1; step <= 350; step++) {
    const candidate = fromOklab([lightness + step * 0.002, a, b]);
    if (passes(candidate, DARK_SURFACES)) return candidate;
  }
  return WHITE;
}

function tokensFor(accent: string, adjusted: boolean): AccentTokens {
  const accentDark = liftForDark(accent);
  return {
    accent,
    accentInk: readableInk(accent),
    accentDark,
    accentDarkInk: readableInk(accentDark),
    adjusted,
  };
}

/** Turn a requested accent into tokens that are guaranteed readable. */
export function accentTokens(requested: string): AccentTokens {
  const base = toHex(rgbOf(requested));
  if (passes(base, LIGHT_SURFACES)) return tokensFor(base, false);

  for (let step = 1; step <= 20; step++) {
    const candidate = mixTowardBlack(base, step * 0.05);
    if (passes(candidate, LIGHT_SURFACES)) return tokensFor(candidate, true);
  }
  return tokensFor(INK, true);
}

/**
 * Accents the new-business wizard offers in one tap (any other colour can
 * still be picked). Each already passes the rules above, so none is
 * adjusted. The first is the database default. There is no red: it would read
 * as the danger colour on every button.
 */
export const ACCENT_PRESETS = [
  { key: "blue", hex: "#2563eb" },
  { key: "teal", hex: "#0f766e" },
  { key: "green", hex: "#15803d" },
  { key: "orange", hex: "#c2410c" },
  { key: "burgundy", hex: "#8b2635" },
  { key: "pink", hex: "#be185d" },
  { key: "purple", hex: "#7c3aed" },
  { key: "brown", hex: "#92400e" },
] as const;

export type AccentPresetKey = (typeof ACCENT_PRESETS)[number]["key"];
