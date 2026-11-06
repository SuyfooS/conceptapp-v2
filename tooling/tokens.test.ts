import { readFileSync } from "node:fs";
import {
  ACCENT_PRESETS,
  accentTokens,
  BRAND,
  contrastRatio,
  DARK_SURFACES,
  INK,
  LIGHT_SURFACES,
} from "@domain/color";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

/** The custom properties set in the first block that follows `selector`. */
function block(selector: string): Map<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`No block for ${selector}`);
  const open = css.indexOf("{", at + selector.length - 1);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      (m) => [m[1], m[2]?.trim().replace(/\s+/g, " ")] as [string, string],
    ),
  );
}

function hex(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(`--${name}`);
  if (!value) throw new Error(`No token ${name}`);
  return value;
}

/** A colour at `amount` over a surface, in sRGB, as browsers draw the tints. */
function over(color: string, amount: number, surface: string): string {
  const parts = (h: string) =>
    [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [c, s] = [parts(color), parts(surface)];
  const mixed = c.map((v, i) => v * amount + (s[i] ?? 0) * (1 - amount));
  return `#${mixed.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

const light = block(":root,\n.appearance-light {");
const darkMedia = block("@media (prefers-color-scheme: dark) {\n  :root {");
const darkClass = block(".appearance-dark {");

describe("design tokens", () => {
  it("are the same in the dark media query and the dark class", () => {
    expect([...darkMedia.entries()].sort()).toEqual(
      [...darkClass.entries()].sort(),
    );
  });

  it("override every light name in dark", () => {
    expect([...darkClass.keys()].sort()).toEqual([...light.keys()].sort());
  });

  it("match the surfaces and brand the accent rules are checked against", () => {
    expect(LIGHT_SURFACES).toEqual([hex(light, "bg"), hex(light, "surface")]);
    expect(DARK_SURFACES).toEqual([
      hex(darkClass, "bg"),
      hex(darkClass, "surface"),
      hex(darkClass, "elevated"),
    ]);
    expect(hex(light, "brand")).toBe(BRAND);
    expect(hex(light, "ink")).toBe(INK);
    expect(hex(darkClass, "brand")).toBe(accentTokens(BRAND).accentDark);
  });

  describe.each([
    ["light", light, 0.11],
    ["dark", darkClass, 0.16],
  ] as const)("%s", (_name, tokens, tint) => {
    const surfaces = ["bg", "surface", "elevated"].map((s) => hex(tokens, s));

    it.each(["ink", "ink-2"])("%s reads on page, groups and fills", (name) => {
      for (const surface of [...surfaces, hex(tokens, "surface-2")]) {
        expect(
          contrastRatio(hex(tokens, name), surface),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("placeholders read on page and groups", () => {
      for (const surface of surfaces) {
        expect(
          contrastRatio(hex(tokens, "ink-3"), surface),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it.each(["success", "warning", "danger"])(
      "%s reads on surfaces and on its own tint",
      (name) => {
        const color = hex(tokens, name);
        for (const surface of surfaces) {
          expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
          expect(
            contrastRatio(color, over(color, tint, surface)),
          ).toBeGreaterThanOrEqual(4.5);
        }
      },
    );

    it("control edges reach 3:1 on page, groups and fills", () => {
      for (const surface of [...surfaces, hex(tokens, "surface-2")]) {
        expect(
          contrastRatio(hex(tokens, "edge"), surface),
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it("danger ink reads on danger", () => {
      expect(
        contrastRatio(hex(tokens, "danger-ink"), hex(tokens, "danger")),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it("fills stand apart from the cards they sit on", () => {
      expect(
        contrastRatio(hex(tokens, "surface-2"), hex(tokens, "surface")),
      ).toBeGreaterThanOrEqual(1.15);
    });
  });

  it("keep ink readable on every preset's soft tint", () => {
    for (const preset of ACCENT_PRESETS) {
      const t = accentTokens(preset.hex);
      expect(
        contrastRatio(INK, over(t.accent, 0.13, hex(light, "surface"))),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          hex(darkClass, "ink"),
          over(t.accentDark, 0.22, hex(darkClass, "surface")),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
