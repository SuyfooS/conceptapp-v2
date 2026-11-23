import type { CaptchaSetup } from "@domain/turnstile";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { type Captcha, CaptchaBox, useCaptcha } from "./captcha";
import {
  type CaptchaControl,
  createCaptchaControl,
  type TurnstileOptions,
} from "./captcha-control";

/*
 * The "אני לא רובוט" check's box (P9b), drawn on the server as a page first
 * is, in Hebrew and in English: nothing while it asks nothing, a line while
 * a press waits, a line and a place for Cloudflare's box when it asks for a
 * tick, and a line that is an alert when it failed (with its retry) or
 * didn't load. The token goes in the form's field only where it has a name;
 * the real widget names its key, and the twin's stand-in none. After its
 * retry, the line says the try (it takes the focus, as the button goes);
 * in a centred card its parts sit in the middle.
 */

const MESSAGES = { he, en };

type Drawn = {
  locale?: "he" | "en";
  name?: string;
  align?: "start" | "center";
};

function Box({
  setup,
  name,
  align,
}: {
  setup: CaptchaSetup;
  name?: string;
  align?: "start" | "center";
}) {
  return createElement(CaptchaBox, {
    captcha: useCaptcha(setup, "sign-in"),
    name,
    align,
  });
}

function draw(setup: CaptchaSetup, drawn: Drawn = {}): string {
  return drawIn(createElement(Box, { setup, ...drawn }), drawn.locale);
}

/** A real check's box, as its control stands, with no script on the page. */
function drawControl(control: CaptchaControl, drawn: Drawn = {}): string {
  const captcha: Captcha = {
    ...control.snapshot(),
    take: control.take,
    holdSubmit: () => {},
    retry: control.retry,
    control,
    siteKey: null,
    going: null,
  };
  return drawIn(
    createElement(CaptchaBox, {
      captcha,
      name: drawn.name,
      align: drawn.align,
    }),
    drawn.locale,
  );
}

/** A real check with Turnstile stood in for, and what Cloudflare answers through. */
function realCheck(): {
  control: CaptchaControl;
  cloudflare: TurnstileOptions;
} {
  const control = createCaptchaControl({
    siteKey: "1x00000000000000000000AA",
    action: "sign-in",
    language: "he",
    page: { scriptFailed: false },
  });
  const drawn: TurnstileOptions[] = [];
  control.attach(
    {} as HTMLElement,
    {
      render: (_, options) => {
        drawn.push(options);
        return "w1";
      },
      reset: () => {},
      remove: () => {},
    },
    340,
  );
  const [cloudflare] = drawn;
  if (!cloudflare) throw new Error("no widget drawn");
  return { control, cloudflare };
}

function drawIn(element: ReactElement, locale: "he" | "en" = "he"): string {
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
    createElement(NextIntlClientProvider, provider, element),
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

  it("says a retry's try, started and then passed, on a line that can take the focus", () => {
    for (const locale of ["he", "en"] as const) {
      const words = MESSAGES[locale].ui.captcha;
      const { control, cloudflare } = realCheck();
      cloudflare["error-callback"]("600010");
      const failed = drawControl(control, { locale });
      expect(failed).toMatch(/<p role="alert" tabindex="-1"/);
      expect(text(failed)).toContain(words.retry);

      control.retry();
      const trying = drawControl(control, { locale });
      expect(trying).toContain('data-captcha="loading"');
      expect(trying).toMatch(/<p role="status" tabindex="-1"/);
      expect(text(trying)).toBe(words.rechecking);
      // The button went with the failure: the line is what takes the focus.
      expect(text(trying)).not.toContain(words.retry);

      // A tick asked for meanwhile is said on the same line.
      cloudflare["before-interactive-callback"]();
      expect(text(drawControl(control, { locale }))).toBe(words.tap);
      cloudflare["after-interactive-callback"]();
      cloudflare.callback("PASSED");
      const passed = drawControl(control, { locale });
      expect(passed).toContain('data-captcha="ready"');
      expect(passed).toMatch(/<p role="status" tabindex="-1"/);
      expect(text(passed)).toBe(words.passed);

      // Its token gone with a send, the try is over and nothing is said.
      control.spend();
      expect(text(drawControl(control, { locale }))).toBe("");

      // Failed again: the alert and the button are back.
      cloudflare["error-callback"]("600010");
      control.retry();
      cloudflare["error-callback"]("600010");
      const again = drawControl(control, { locale });
      expect(again).toMatch(/<p role="alert" tabindex="-1"/);
      expect(text(again)).toContain(words.failed);
      expect(text(again)).toContain(words.retry);
    }
  });

  it("sits at the column's start, or in a centred card's middle", () => {
    const start = draw({ demo: "failed" });
    expect(start).toMatch(/<button[^>]*class="[^"]*\bself-start\b/);
    expect(start).not.toContain("self-center");
    const centre = draw({ demo: "failed" }, { align: "center" });
    expect(centre).toMatch(/<button[^>]*class="[^"]*\bself-center\b/);
    expect(centre).not.toContain("self-start");
    // The stand-in for Cloudflare's box, and its own place for a tick.
    expect(draw({ demo: "tap" }, { align: "center" })).toMatch(
      /data-captcha-frame="true" class="[^"]*\bself-center\b/,
    );
    expect(draw({ demo: "tap" })).not.toContain("self-center");
    const { control, cloudflare } = realCheck();
    cloudflare["before-interactive-callback"]();
    expect(drawControl(control, { align: "center" })).toMatch(
      /data-captcha-frame="true" class="flex justify-center"/,
    );
    expect(drawControl(control)).toMatch(
      /data-captcha-frame="true" class="flex"/,
    );
  });

  it("has no exclamation marks", () => {
    expect(JSON.stringify(he.ui.captcha)).not.toContain("!");
    expect(JSON.stringify(en.ui.captcha)).not.toContain("!");
  });
});
