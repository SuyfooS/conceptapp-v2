import { existsSync, readFileSync } from "node:fs";
import { OLD_BROWSER_ATTRIBUTE } from "@ui/old-browser-notice";
import { getSupportedBrowsers } from "next/dist/build/get-supported-browsers";
import MODERN_BROWSERSLIST_TARGET from "next/dist/shared/lib/modern-browserslist-target";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OldBrowser } from "../app/old-browser";
import en from "../messages/en.json";
import he from "../messages/he.json";

/*
 * A browser older than the app needs says so (closing the pilot, PR 26),
 * with CSS only: the notice is drawn hidden on every page by the root layout,
 * and one rule in app/globals.css, outside any cascade layer, shows it where
 * relative colours are missing (Chrome 119, Safari 16.4, Firefox 128: the
 * rule's comment says why that is the floor). The browser's side, hidden in
 * the Chromium the e2e runs and shown as an old browser would show it, is
 * e2e/old-browser.spec.ts.
 */

const css = readFileSync("app/globals.css", "utf8");
const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, "");
const CONDITION = "@supports not (color: rgb(from red r g b))";
const SELECTOR = `[${OLD_BROWSER_ATTRIBUTE}]`;

/** How deep in braces `at` is in `text`. */
function depthAt(text: string, at: number): number {
  let depth = 0;
  for (let i = 0; i < at; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
  }
  return depth;
}

/** The body of the block that opens after `start`, braces matched. */
function blockAfter(text: string, start: number): string {
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`No end to the block after ${start}`);
}

/** The custom properties a block sets, by name. */
function properties(body: string): Map<string, string> {
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      (m) => [m[1], m[2]?.replace(/\s+/g, " ").trim()] as [string, string],
    ),
  );
}

const theme = properties(
  blockAfter(uncommented, uncommented.indexOf("@theme inline")),
);
const light = properties(
  blockAfter(uncommented, uncommented.indexOf(":root,\n.appearance-light")),
);
const dark = properties(
  blockAfter(uncommented, uncommented.indexOf(".appearance-dark {")),
);

/** The words next-intl could not find while drawing. */
const missing: string[] = [];

/** The notice as the root layout draws it, in Hebrew. */
const drawn = renderToString(
  createElement(
    NextIntlClientProvider,
    {
      locale: "he",
      timeZone: "Asia/Jerusalem",
      messages: he,
      onError: (error: Error) => {
        missing.push(error.message);
      },
    } as unknown as Parameters<typeof NextIntlClientProvider>[0],
    createElement(OldBrowser),
  ),
);

describe("the notice for an old browser", () => {
  it("is shown by one rule, outside any layer, where relative colours are missing", () => {
    const at = uncommented.indexOf(CONDITION);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(uncommented.indexOf(CONDITION, at + 1)).toBe(-1);
    // At the top level: inside a layer it would lose to `hidden`, which
    // sits in Tailwind's utilities layer, and nested in any other block it
    // would ask more than the floor.
    expect(depthAt(uncommented, at)).toBe(0);
    expect(blockAfter(uncommented, at).replace(/\s+/g, " ").trim()).toBe(
      `${SELECTOR} { display: block; }`,
    );
  });

  it("is shown by nothing else in the stylesheet", () => {
    expect(uncommented.split(SELECTOR)).toHaveLength(2);
  });

  it("rests on a floor the app really has: its accent is made with relative colours", () => {
    // If the hover and press stop using rgb(from …), the floor falls to
    // color-mix() and the condition should follow (app/globals.css).
    expect(theme.get("--color-accent-hover")).toContain("rgb(from ");
    expect(theme.get("--color-accent-press")).toContain("rgb(from ");
  });

  it("keeps the targets that turn :dir() into :lang(), which the floor counts on", () => {
    // Next's default targets (Chrome 111) make the build's Lightning CSS
    // rewrite every rtl:/ltr: from :dir() to :lang(), so the served CSS
    // needs no :dir() (Chrome 120). Keeping :dir() raises the floor: the
    // condition in app/globals.css gains `or (not selector(:dir(rtl)))`
    // in the same change, and this test with it.
    const checkedOn = ["chrome 111", "edge 111", "firefox 111", "safari 16.4"];
    // Next's own default, which it regenerates from "baseline widely
    // available": an update that raises it to Chrome 120 keeps :dir().
    expect(MODERN_BROWSERSLIST_TARGET).toEqual(checkedOn);
    // What the build takes, read as Next reads it: a browserslist anywhere
    // up the tree, or BROWSERSLIST in the environment, wins over the
    // default. One set only where the site is built (Vercel) is seen by no
    // test here; the e2e finds no :dir() in the CSS CI's build serves.
    expect(getSupportedBrowsers(process.cwd(), false)).toEqual(checkedOn);
    expect(readFileSync("next.config.ts", "utf8")).not.toMatch(
      /lightningCssFeatures|dir-selector|browserslist/,
    );
    expect(JSON.parse(readFileSync("package.json", "utf8"))).not.toHaveProperty(
      "browserslist",
    );
    expect(existsSync(".browserslistrc")).toBe(false);
    expect(existsSync("browserslist")).toBe(false);
    // The variants that rewrite applies to are the ones it was checked on.
    expect(uncommented).toContain("@custom-variant rtl (&:dir(rtl));");
    expect(uncommented).toContain("@custom-variant ltr (&:dir(ltr));");
  });

  it("is drawn hidden, at the top of every page, by the root layout", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/^\s*["']use client["']/);
    expect(layout).toContain('import { OldBrowser } from "./old-browser";');
    const announcer = layout.indexOf("<Announcer />");
    const notice = layout.indexOf("<OldBrowser />");
    const page = layout.indexOf(
      "<NextIntlClientProvider>{children}</NextIntlClientProvider>",
    );
    expect(announcer).toBeGreaterThan(layout.indexOf("<body"));
    expect(notice).toBeGreaterThan(announcer);
    expect(page).toBeGreaterThan(notice);
    expect(drawn.startsWith(`<div ${OLD_BROWSER_ATTRIBUTE}=""`)).toBe(true);
    expect(/^<div [^>]*class="([^"]*)"/.exec(drawn)?.[1]?.split(" ")).toContain(
      "hidden",
    );
  });

  it("needs no script: no client code of its own", () => {
    for (const file of [
      "app/old-browser.tsx",
      "packages/ui/old-browser-notice.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/["']use client["']/);
      expect(source, file).not.toMatch(
        /\buse(State|Effect|LayoutEffect|Ref|SyncExternalStore)\b|\bon[A-Z]\w*=/,
      );
    }
  });

  it("reads where the accent's colours fail: only plain tokens, never a mixed one", () => {
    const classes = new Set(
      [...drawn.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
        (m[1] ?? "").split(/\s+/),
      ),
    );
    const tokens = [...classes].flatMap((name) => {
      const utility = /^(bg|text|shadow)-([a-z0-9-]+)$/.exec(name);
      if (!utility) return [];
      const [, kind, token] = utility;
      const key = kind === "shadow" ? `--shadow-${token}` : `--color-${token}`;
      // text-md and text-base are sizes, not colours.
      if (kind === "text" && theme.has(`--text-${token}`)) return [];
      return [{ name, key, value: theme.get(key) }];
    });
    expect(tokens.map((t) => t.name).sort()).toEqual(
      [
        "bg-surface",
        "shadow-float",
        "text-ink",
        "text-ink-2",
        "text-warning",
      ].sort(),
    );
    for (const { name, value } of tokens) {
      expect(value, name).toMatch(/^var\(--[\w-]+\)$/);
      const base = /^var\((--[\w-]+)\)$/.exec(value ?? "")?.[1] ?? "";
      for (const [appearance, block] of [
        ["light", light],
        ["dark", dark],
      ] as const) {
        const plain = block.get(base);
        expect(plain, `${name} in ${appearance}`).toBeTruthy();
        expect(plain, `${name} in ${appearance}`).not.toMatch(
          /color-mix\(|\bfrom\b|var\(/,
        );
      }
    }
  });

  it("says what to do on Android and on iPhone and iPad, whom to tell, and that the page can still be tried", () => {
    const words = he.app.oldBrowser;
    expect(Object.keys(words).sort()).toEqual(
      ["android", "cantUpdate", "iphone", "title", "tryAnyway"].sort(),
    );
    expect(words.android).toMatch(/Chrome.*Play/);
    // The title says "this device", and the clock station is often an old
    // iPad: the Apple line names it, whose Settings path is the same.
    expect(words.iphone).toMatch(/^<b>באייפון ובאייפד:<\/b>/);
    expect(en.app.oldBrowser.iphone).toMatch(/^<b>On iPhone and iPad:<\/b>/);
    // The floor's iOS, as the push card says it (notifications.iosVersion).
    expect(words.iphone).toContain("iOS 16.4");
    expect(en.app.oldBrowser.iphone).toContain("iOS 16.4");
    // An iPad's Software Update says iPadOS, never iOS: the line names it.
    expect(words.iphone).toContain("(באייפד: iPadOS 16.4)");
    expect(en.app.oldBrowser.iphone).toContain("(on iPad: iPadOS 16.4)");
    expect(words.iphone).toContain("בהגדרות, בכללי, בעדכון תוכנה");
    // Whom to tell is someone every reader has, in any business: not a
    // role a module gives (a business may run no schedule), and for an
    // owner the ConceptApp team.
    expect(words.cantUpdate).toContain("מי שהזמין אותך");
    expect(en.app.oldBrowser.cantUpdate).toContain("whoever invited you");
    for (const text of [words.cantUpdate, en.app.oldBrowser.cantUpdate]) {
      expect(text).not.toMatch(/סידור|schedule/);
    }
    for (const [key, text] of [
      ...Object.entries(words),
      ...Object.entries(en.app.oldBrowser),
    ]) {
      expect(text, key).not.toContain("!");
    }
    // Every line is drawn, none missing, the platforms in bold.
    expect(missing).toEqual([]);
    for (const line of [words.title, words.cantUpdate, words.tryAnyway]) {
      expect(drawn).toContain(line);
    }
    for (const line of [words.android, words.iphone]) {
      const [, platform, rest] = /^<b>(.+?)<\/b>(.+)$/.exec(line) ?? [];
      expect(platform, line).toBeTruthy();
      expect(drawn).toContain(
        `<strong class="font-semibold">${platform}</strong>${rest}`,
      );
    }
  });
});
