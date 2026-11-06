import { type AccentTokens, accentTokens, BRAND } from "@domain/color";
import type { CSSProperties } from "react";

/**
 * Props that apply a business accent to everything inside an element, in light
 * and in dark. Pair with `accentTokens()` from @domain/color, which guarantees
 * the colours are readable. The [data-accent] rules in globals.css choose the
 * pair for the current appearance.
 */
export function accentProps(
  tokens: Pick<
    AccentTokens,
    "accent" | "accentInk" | "accentDark" | "accentDarkInk"
  >,
) {
  return {
    "data-accent": "",
    style: {
      "--accent-light": tokens.accent,
      "--accent-ink-light": tokens.accentInk,
      "--accent-dark": tokens.accentDark,
      "--accent-ink-dark": tokens.accentDarkInk,
    } as CSSProperties,
  };
}

/**
 * ConceptApp's own colour in the accent's place, for the admin console:
 * buttons, selected nav items and soft tints there use the brand.
 */
export const brandProps = accentProps(accentTokens(BRAND));
