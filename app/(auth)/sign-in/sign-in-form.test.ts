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

  it("says a send refused for it on the phone step, above the press", () => {
    for (const locale of ["he", "en"] as const) {
      const page = text(draw({ step: "phone", error: "captcha" }, locale));
      expect(page).toContain({ he, en }[locale].auth.signIn.errors.captcha);
    }
  });
});

/** The phone step's visible field, as drawn. */
const phoneInput = (html: string) =>
  /<input[^>]*type="tel"[^>]*>/.exec(html)?.[0] ?? "";

/** The code step's field, as drawn. */
const codeInput = (html: string) =>
  new RegExp(`<input[^>]*aria-label="${he.auth.signIn.codeLabel}"[^>]*>`).exec(
    html,
  )?.[0] ?? "";

/** An attribute of a tag, or undefined. */
const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

// Each answer is heard (accessibility, part 2): a number refused on its
// field, a code that didn't go on a line of its own, and a refused code the
// code field's own, said once (no alert as well); a new code, and the
// step's words as it arrives, are said by the field, not by a live line of
// the screen.
describe("sign-in's refusals", () => {
  it("say a number refused on its field, marked and read with it", () => {
    const html = draw({ step: "phone", error: "invalidPhone" });
    const field = phoneInput(html);
    expect(attribute(field, "aria-invalid")).toBe("true");
    const message = attribute(field, "aria-describedby");
    expect(message).toBeTruthy();
    expect(html).toMatch(
      new RegExp(
        `<p id="${message}"[^>]*>${he.auth.signIn.errors.invalidPhone}</p>`,
      ),
    );
    // The field says it: no line of its own as well.
    expect(html).not.toContain('role="alert"');
  });

  it("say a code that didn't go above the press, and leave the number unmarked", () => {
    for (const error of [
      "captcha",
      "tooMany",
      "rateLimit",
      "failed",
    ] as const) {
      const html = draw({ step: "phone", error });
      const field = phoneInput(html);
      expect(attribute(field, "aria-invalid"), error).toBeUndefined();
      expect(attribute(field, "aria-describedby"), error).toBeUndefined();
      const line = html.search(
        new RegExp(`<p role="alert"[^>]*>${he.auth.signIn.errors[error]}</p>`),
      );
      expect(line, error).toBeGreaterThan(html.indexOf(field));
      expect(html.indexOf('value="send"'), error).toBeGreaterThan(line);
      expect(html.indexOf('data-captcha="ready"'), error).toBeLessThan(line);
    }
  });

  it("tie a refused code to the code field, why first, with no alert as well, marked invalid only for the digits", () => {
    for (const error of [
      "wrongCode",
      "invalidCode",
      "tooMany",
      "rateLimit",
      "captcha",
      "failed",
    ] as const) {
      const html = draw({ step: "code", phone: UNKNOWN, error });
      const id = new RegExp(
        `<p id="([^"]+)"[^>]*>${he.auth.signIn.errors[error]}</p>`,
      ).exec(html)?.[1];
      expect(id, error).toBeTruthy();
      const field = codeInput(html);
      const described = attribute(field, "aria-describedby");
      // Why first: VoiceOver says a description as a hint, which a swipe
      // cuts off.
      expect(described?.split(" ")[0], error).toBe(id);
      // The announcer says it as the answer comes, and the description has
      // it for a return: an alert would say it a second time.
      expect(html, error).not.toContain('role="alert"');
      // A wrong code, drained, and one too short, kept, are the digits'.
      expect(attribute(field, "aria-invalid"), error).toBe(
        error === "wrongCode" || error === "invalidCode" ? "true" : undefined,
      );
    }
    // With nothing refused, the field is described by its own line only.
    const html = draw({ step: "code", phone: UNKNOWN });
    expect(html).not.toContain('role="alert"');
    expect(
      attribute(codeInput(html), "aria-describedby")?.split(" "),
    ).toHaveLength(1);
  });

  it("leave a new code to the field to say: the step's words are no live line", () => {
    for (const state of STATES) {
      const html = draw({ ...state, phone: UNKNOWN });
      // The digits' own line is the field's only live one (CodeSlots).
      expect(html.match(/aria-live=/g), JSON.stringify(state)).toHaveLength(1);
      expect(html).toMatch(
        /<span id="[^"]+" class="sr-only" aria-live="polite"/,
      );
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
