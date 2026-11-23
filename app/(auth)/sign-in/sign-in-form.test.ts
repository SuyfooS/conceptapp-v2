import type { CaptchaSetup } from "@domain/turnstile";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SignInState } from "../actions";

// Sign-in's code step drawn whole, on the server as a page first is. It
// reads the same for every valid number, word for word but the number, in
// each of its states, so it never tells whether a code went; its help for a
// code that didn't come is always there, in Hebrew and in English; and no
// word anywhere in sign-in says a number isn't registered. Each step has
// the "אני לא רובוט" check above its press, in each of its states, and a
// send refused for it is said where the step says its errors. The router
// and links are stood in for; nothing here is sent.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider } = await import("next-intl");
const { SignInForm } = await import("./sign-in-form");
const { displayIsraeliMobile } = await import("@domain/phone");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;

const MESSAGES = { he, en };

/** The step as it was: nothing here is posted. */
const stay = async (prev: SignInState) => prev;

function draw(
  start: SignInState,
  locale: "he" | "en" = "he",
  captcha: CaptchaSetup = { demo: "ready" },
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
      createElement(SignInForm, { signIn: stay, captcha, start }),
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

/** The page with its number as a placeholder. */
const unnumbered = (html: string, phone: string) =>
  html.replaceAll(displayIsraeliMobile(phone), "{phone}");

const REGISTERED = "+972500000003";
const UNKNOWN = "+972509999999";

const STATES: Omit<Extract<SignInState, { step: "code" }>, "phone">[] = [
  { step: "code" },
  { step: "code", resent: true },
  { step: "code", error: "wrongCode" },
  { step: "code", error: "invalidCode" },
  { step: "code", error: "tooMany" },
  { step: "code", error: "rateLimit" },
  { step: "code", error: "captcha" },
  { step: "code", error: "failed" },
];

describe("sign-in's code step", () => {
  it("reads the same for every valid number, in each of its states", () => {
    for (const state of STATES) {
      const registered = draw({ ...state, phone: REGISTERED });
      const unknown = draw({ ...state, phone: UNKNOWN });
      expect(registered).toContain(displayIsraeliMobile(REGISTERED));
      expect(unnumbered(unknown, UNKNOWN)).toBe(
        unnumbered(registered, REGISTERED),
      );
    }
  });

  it("always says what to do when no code came, under its own heading", () => {
    for (const state of STATES) {
      const html = draw({ ...state, phone: UNKNOWN });
      expect(text(html)).toContain(he.auth.signIn.noCode.title);
      expect(text(html)).toContain(he.auth.signIn.noCode.body);
      const labelled = /<section aria-labelledby="([^"]+)"/.exec(html)?.[1];
      expect(labelled).toBeTruthy();
      expect(html).toContain(`<h2 id="${labelled}"`);
    }
    const english = text(draw({ step: "code", phone: UNKNOWN }, "en"));
    expect(english).toContain(en.auth.signIn.noCode.title);
    expect(english).toContain(en.auth.signIn.noCode.body);
  });

  it("says the code went only if the number is on a team", () => {
    const page = text(draw({ step: "code", phone: UNKNOWN }));
    const [before] = he.auth.signIn.codeIntro.split("<ltr>");
    expect(before).toBeTruthy();
    expect(page).toContain(before ?? "");
    const resent = text(draw({ step: "code", phone: UNKNOWN, resent: true }));
    expect(resent).toContain(he.auth.signIn.codeResent.split("<ltr>")[0]);
  });
});

describe("sign-in's check", () => {
  const STANDINS = ["waiting", "tap", "failed", "unavailable"] as const;

  it("is above each step's press, its field posted with the form", () => {
    for (const start of [
      { step: "phone" },
      { step: "code", phone: UNKNOWN },
    ] as const) {
      const html = draw(start);
      const box = html.indexOf('data-captcha="ready"');
      expect(box, start.step).toBeGreaterThan(0);
      expect(
        html.indexOf(
          start.step === "phone" ? 'value="send"' : 'value="resend"',
        ),
      ).toBeGreaterThan(box);
      expect(html).toContain('<input type="hidden" name="captcha" value=""/>');
    }
  });

  it("says each of its states on either step, in Hebrew and in English", () => {
    for (const locale of ["he", "en"] as const) {
      const words = { he, en }[locale].ui.captcha;
      const lines = {
        waiting: words.waiting,
        tap: words.tap,
        failed: words.failed,
        unavailable: words.unavailable,
      };
      for (const demo of STANDINS) {
        for (const start of [
          { step: "phone" },
          { step: "code", phone: UNKNOWN },
        ] as const) {
          expect(
            text(draw(start, locale, { demo })),
            `${demo} ${locale}`,
          ).toContain(lines[demo]);
        }
      }
    }
  });

  it("shows a press waiting for it as busy", () => {
    const phone = draw({ step: "phone" }, "he", { demo: "waiting" });
    expect(phone).toMatch(
      /<button[^>]*value="send"[^>]*aria-busy="true"|<button[^>]*aria-busy="true"[^>]*value="send"/,
    );
    const code = draw({ step: "code", phone: UNKNOWN }, "he", {
      demo: "waiting",
    });
    expect(code).toMatch(
      /<button[^>]*value="resend"[^>]*disabled|<button[^>]*disabled[^>]*value="resend"/,
    );
  });

  it("says a send refused for it on the phone step, under the number", () => {
    for (const locale of ["he", "en"] as const) {
      const page = text(draw({ step: "phone", error: "captcha" }, locale));
      expect(page).toContain({ he, en }[locale].auth.signIn.errors.captcha);
    }
  });
});

describe("sign-in's words", () => {
  it("have no answer that says a number isn't registered", () => {
    expect(Object.keys(he.auth.signIn.errors)).not.toContain("unknownPhone");
    expect(Object.keys(en.auth.signIn.errors)).not.toContain("unknownPhone");
  });

  it("have no exclamation marks", () => {
    expect(JSON.stringify(he.auth.signIn)).not.toContain("!");
    expect(JSON.stringify(en.auth.signIn)).not.toContain("!");
  });
});
