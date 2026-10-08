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
