import type { CaptchaSetup } from "@domain/turnstile";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JoinState } from "../actions";

// Joining's form drawn whole, on the server as a page first is, in each of
// its code step's states (accessibility, part 2): the step's words are no
// live line, so a new code is said once, by its field, and not again by a
// line that changed; a refusal is the field's own, with no alert, the field
// marked invalid only when the digits were refused. Too many codes from
// this network is said with its minutes, in their own direction, on either
// step. The router is stood in for; nothing here is sent.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

const { NextIntlClientProvider } = await import("next-intl");
const { JoinForm } = await import("./join-form");
const he = (await import("@/messages/he.json")).default;

/** The step as it was: nothing here is posted. */
const stay = async (prev: JoinState) => prev;

function draw(start: JoinState, captcha: CaptchaSetup = { demo: "ready" }) {
  const missing: string[] = [];
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(JoinForm, { join: stay, captcha, ending: "67", start }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

const CODE_STATES: Extract<JoinState, { step: "code" }>[] = [
  { step: "code" },
  { step: "code", resent: true },
  { step: "code", error: "wrongCode" },
  { step: "code", error: "invalidCode" },
  { step: "code", error: "tooMany" },
  { step: "code", error: "tooManyNetwork", minutes: 12 },
  { step: "code", error: "failed" },
  { step: "code", error: "shiftsLeft" },
  { step: "code", error: "elsewhere" },
];

/** Too many codes from this network in twelve minutes, as its line says it. */
const NETWORK =
  'נשלחו הרבה קודים מהרשת הזאת. אפשר לכבות את ה-Wi-Fi ולנסות מהסלולר, או לנסות שוב בעוד <span dir="ltr">12</span> דקות או מאוחר יותר.';

/** The code field, as drawn. */
const codeInput = (html: string) =>
  new RegExp(`<input[^>]*aria-label="${he.auth.join.codeLabel}"[^>]*>`).exec(
    html,
  )?.[0] ?? "";

/** An attribute of a tag, or undefined. */
const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

describe("joining's code step", () => {
  it("leaves a new code to the field to say: the step's words are no live line", () => {
    for (const state of CODE_STATES) {
      const html = draw(state);
      // The digits' own line is the field's only live one (CodeSlots).
      expect(html.match(/aria-live=/g), JSON.stringify(state)).toHaveLength(1);
      expect(html).toMatch(
        /<span id="[^"]+" class="sr-only" aria-live="polite"/,
      );
    }
    // Its words as they show, a new code's or the first.
    expect(draw({ step: "code", resent: true })).toContain(
      he.auth.join.codeResent.split("<ltr>")[0] ?? "",
    );
    expect(draw({ step: "code" })).toContain(
      he.auth.join.codeIntro.split("<ltr>")[0] ?? "",
    );
  });

  it("ties a refusal to the field, its why first, with no alert, marked invalid only for the digits", () => {
    for (const state of CODE_STATES) {
      if (!state.error) continue;
      const html = draw(state);
      const words =
        state.error === "shiftsLeft" || state.error === "elsewhere"
          ? he.auth.join[state.error]
          : state.error === "tooManyNetwork"
            ? NETWORK
            : he.auth.signIn.errors[state.error];
      const id = new RegExp(`<p id="([^"]+)"[^>]*>${words}</p>`).exec(
        html,
      )?.[1];
      expect(id, state.error).toBeTruthy();
      const field = codeInput(html);
      expect(attribute(field, "aria-describedby")?.split(" ")[0]).toBe(id);
      expect(html, state.error).not.toContain('role="alert"');
      expect(attribute(field, "aria-invalid"), state.error).toBe(
        state.error === "wrongCode" || state.error === "invalidCode"
          ? "true"
          : undefined,
      );
    }
  });
});

describe("joining's invite step", () => {
  it("says a code that didn't go on a line of its own, above the press", () => {
    const html = draw({ step: "invite", error: "failed" });
    const line = html.search(
      new RegExp(`<p role="alert"[^>]*>${he.auth.signIn.errors.failed}</p>`),
    );
    expect(line).toBeGreaterThan(0);
    expect(html.indexOf('value="send"')).toBeGreaterThan(line);
    expect(draw({ step: "invite" })).not.toContain('role="alert"');
  });

  it("says too many codes from this network there, with its minutes in their own direction", () => {
    const html = draw({ step: "invite", error: "tooManyNetwork", minutes: 12 });
    const line = html.indexOf(
      `<p role="alert" class="text-danger text-sm">${NETWORK}</p>`,
    );
    expect(line).toBeGreaterThan(0);
    expect(html.indexOf('value="send"')).toBeGreaterThan(line);
  });
});
