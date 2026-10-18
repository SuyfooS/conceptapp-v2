import type { AccentTokens } from "@domain/color";
import type { CSSProperties } from "react";

/**
 * Inline style that applies a business accent to everything inside an
 * element. Pair with `accentTokens()` from @domain/color, which guarantees
 * the colours are readable.
 */
export function accentStyle(
  tokens: Pick<AccentTokens, "accent" | "accentInk">,
): CSSProperties {
  return {
    "--accent": tokens.accent,
    "--accent-ink": tokens.accentInk,
  } as CSSProperties;
}

/**
 * ConceptApp's own colour in the accent's place, for the admin console:
 * buttons, selected nav items and soft tints there use the brand.
 */
export const brandStyle = {
  "--accent": "var(--brand)",
  "--accent-ink": "var(--brand-ink)",
} as CSSProperties;
