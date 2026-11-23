import type { CaptchaSetup } from "@domain/turnstile";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { CaptchaBox, useCaptcha } from "./captcha";

/*
 * The "אני לא רובוט" check's box (P9b), drawn on the server as a page first
 * is, in Hebrew and in English: nothing while it asks nothing, a line while
 * a press waits, a line and a place for Cloudflare's box when it asks for a
 * tick, and a line that is an alert when it failed (with its retry) or
 * didn't load. The token goes in the form's field only where it has a name;
 * the real widget names its key, and the twin's stand-in none.
 */

const MESSAGES = { he, en };

function Box({ setup, name }: { setup: CaptchaSetup; name?: string }) {
  return createElement(CaptchaBox, {
    captcha: useCaptcha(setup, "sign-in"),
    name,
  });
}

function draw(
  setup: CaptchaSetup,
  { locale = "he", name }: { locale?: "he" | "en"; name?: string } = {},
): string {
  const missing: string[] = [];
  const provider = {
    locale,
    timeZone: "Asia/Jerusalem",
    messages: MESSAGES[locale],
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(Box, { setup, name }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

/** The text of the page, its tags gone. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

describe("the check's box", () => {
  it("draws nothing to read while it asks nothing", () => {
    for (const demo of ["ready", "loading"] as const) {
      const html = draw({ demo });
      expect(html).toContain(`data-captcha="${demo}"`);
      expect(html).not.toContain("<p");
      expect(text(html)).toBe("");
    }
  });

  it("says each state in its words, an alert where it failed or didn't load", () => {
    for (const locale of ["he", "en"] as const) {
      const words = MESSAGES[locale].ui.captcha;
      const cases = [
        {
          demo: "waiting",
          state: "loading",
          line: words.waiting,
          role: "status",
        },
        { demo: "tap", state: "tap", line: words.tap, role: "status" },
        { demo: "failed", state: "failed", line: words.failed, role: "alert" },
        {
          demo: "unavailable",
          state: "unavailable",
          line: words.unavailable,
          role: "alert",
        },
      ] as const;
      for (const { demo, state, line, role } of cases) {
        const html = draw({ demo }, { locale });
        expect(html, demo).toContain(`data-captcha="${state}"`);
        expect(html, demo).toContain(`<p role="${role}"`);
        expect(text(html), demo).toContain(line);
      }
    }
  });

  it("shows a press waiting, and a failure's retry", () => {
    expect(draw({ demo: "waiting" })).toContain('data-captcha-waiting="true"');
    expect(draw({ demo: "ready" })).not.toContain("data-captcha-waiting");
    const failed = draw({ demo: "failed" });
    expect(failed).toContain(he.ui.captcha.retry);
    expect(failed).toContain('type="button"');
    expect(draw({ demo: "unavailable" })).not.toContain(he.ui.captcha.retry);
  });

  it("keeps a place of Cloudflare's box's size for a tick, out of the reading order", () => {
    const html = draw({ demo: "tap" });
    expect(html).toMatch(/<div aria-hidden="true" data-captcha-frame="true"/);
    expect(draw({ demo: "ready" })).not.toContain("data-captcha-frame");
  });

  it("posts the token only from a form's field with a name", () => {
    expect(draw({ demo: "ready" }, { name: "captcha" })).toContain(
      '<input type="hidden" name="captcha" value=""/>',
    );
    expect(draw({ demo: "ready" })).not.toContain("<input");
  });

  it("names the real widget's key, and draws it on its way, hidden", () => {
    const html = draw(
      { siteKey: "1x00000000000000000000AA" },
      { name: "captcha" },
    );
    expect(html).toContain('data-captcha="loading"');
    expect(html).toContain('data-sitekey="1x00000000000000000000AA"');
    expect(html).toMatch(/data-captcha-frame="true"[^>]*class="hidden"/);
    expect(text(html)).toBe("");
  });

  it("has no exclamation marks", () => {
    expect(JSON.stringify(he.ui.captcha)).not.toContain("!");
    expect(JSON.stringify(en.ui.captcha)).not.toContain("!");
  });
});
