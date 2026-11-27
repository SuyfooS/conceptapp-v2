import type { DocLike } from "@ui/focus-after";
import { describe, expect, it } from "vitest";
import type { SignInError } from "./otp";
import {
  aboutTheCode,
  aboutTheNumber,
  answerHeard,
  type Counted,
  countAnswer,
  type FocusAt,
  focusAt,
} from "./step-results";

// What sign-in and joining do with each answer of their steps: where a
// refusal is said, when its line is drawn anew, and how a step's field says
// each answer of its step, once, never taking the focus from where the
// person put it (accessibility, part 2).

/** Every refusal, and whether it is about the number itself. */
const ON_THE_NUMBER: Record<SignInError, boolean> = {
  invalidPhone: true,
  rateLimit: false,
  tooMany: false,
  invalidCode: false,
  wrongCode: false,
  captcha: false,
  failed: false,
};

/** Every refusal of the code step, and whether it is about the digits. */
const ON_THE_CODE: Record<SignInError | "shiftsLeft" | "elsewhere", boolean> = {
  invalidPhone: false,
  rateLimit: false,
  tooMany: false,
  invalidCode: true,
  wrongCode: true,
  captcha: false,
  failed: false,
  shiftsLeft: false,
  elsewhere: false,
};

describe("a refusal on the phone step", () => {
  it("is the field's only when the number itself was refused", () => {
    for (const [error, onField] of Object.entries(ON_THE_NUMBER)) {
      expect(aboutTheNumber(error as SignInError), error).toBe(onField);
    }
    expect(aboutTheNumber(undefined)).toBe(false);
    // Too many from this network: the number was fine.
    expect(aboutTheNumber("tooManyNetwork")).toBe(false);
  });
});

describe("a refusal on the code step", () => {
  it("marks the code field only when the digits were refused, wrong or too short", () => {
    for (const [error, marked] of Object.entries(ON_THE_CODE)) {
      expect(aboutTheCode(error), error).toBe(marked);
    }
    expect(aboutTheCode(undefined)).toBe(false);
    expect(aboutTheCode("tooManyNetwork")).toBe(false);
  });
});

/** An element, as far as `focusAt` and `focusLost` ask. */
type Spot = {
  kind: "field" | "submit" | "button" | "link";
  form: object | null;
  disabled?: boolean;
  connected?: boolean;
};

function element({ kind, form, disabled = false, connected = true }: Spot) {
  return {
    isConnected: connected,
    getClientRects: () => ({ length: 1 }),
    matches: (selectors: string) =>
      selectors === ":disabled"
        ? disabled
        : selectors === 'button[type="submit"]'
          ? kind === "submit"
          : false,
    closest: (selectors: string) => (selectors === "form" ? form : null),
    hasAttribute: () => false,
    setAttribute: () => {},
    focus: () => {},
  } as unknown as Element;
}

/** A page whose focus is on `active` (null: none at all). */
function pageWith(active: Element | null | "body"): DocLike {
  const body = element({ kind: "button", form: null });
  return {
    activeElement: active === "body" ? body : active,
    body,
    querySelectorAll: () => [],
  };
}

describe("where the focus is as an answer arrives", () => {
  const form = {};
  const field = element({ kind: "field", form });

  it("on the field itself", () => {
    expect(focusAt(field, pageWith(field))).toBe("field");
  });

  it("lost: on the page, nowhere, on something gone or disabled", () => {
    const cases: [string, Element | null | "body"][] = [
      ["the page", "body"],
      ["nowhere", null],
      ["gone", element({ kind: "link", form, connected: false })],
      // A plain button, which only its being disabled makes lost: enabled,
      // it is elsewhere (the check's retry, below).
      ["disabled", element({ kind: "button", form, disabled: true })],
    ];
    for (const [name, active] of cases) {
      expect(focusAt(field, pageWith(active)), name).toBe("lost");
    }
  });

  it("lost on a press of the step's own form, busy while the answer came, though the browser hasn't moved it yet", () => {
    const press = element({ kind: "submit", form });
    expect(focusAt(field, pageWith(press))).toBe("lost");
  });

  it("elsewhere on a control the person moved to meanwhile: a link, a plain button, another form's press", () => {
    const cases: [string, Element][] = [
      ["the demo door's link", element({ kind: "link", form })],
      ["the check's retry", element({ kind: "button", form })],
      ["another form's press", element({ kind: "submit", form: {} })],
      ["outside any form", element({ kind: "submit", form: null })],
    ];
    for (const [name, active] of cases) {
      expect(focusAt(field, pageWith(active)), name).toBe("elsewhere");
    }
  });

  it("elsewhere for a field in no form, whatever press has it", () => {
    const loose = element({ kind: "field", form: null });
    const press = element({ kind: "submit", form: null });
    expect(focusAt(loose, pageWith(press))).toBe("elsewhere");
  });
});

describe("an answer of a step, for its field", () => {
  const WHY = "The code is 6 digits.";
  const RESENT = "We asked for a new code.";

  it("refused where the focus was lost: the field takes it back, why said after the field's read and kept out of its description meanwhile", () => {
    expect(answerHeard({ error: WHY, at: "lost" })).toEqual({
      focus: true,
      say: { words: WHY, politeness: "polite" },
      quiet: true,
    });
  });

  it("refused where the field kept the focus: why said at once, out of its description meanwhile, the focus left there", () => {
    expect(answerHeard({ error: WHY, at: "field" })).toEqual({
      focus: false,
      say: { words: WHY, politeness: "assertive" },
      quiet: true,
    });
  });

  it("refused where the person moved the focus elsewhere: it stays there, why said at once and kept in the field's description", () => {
    expect(answerHeard({ error: WHY, at: "elsewhere" })).toEqual({
      focus: false,
      say: { words: WHY, politeness: "assertive" },
      quiet: false,
    });
  });

  it("a new code asked for: said after what is read, the focus back in the field only where it was lost", () => {
    const where: [FocusAt, boolean][] = [
      ["lost", true],
      ["field", false],
      ["elsewhere", false],
    ];
    for (const [at, focus] of where) {
      expect(answerHeard({ resent: RESENT, at }), at).toEqual({
        focus,
        say: { words: RESENT, politeness: "polite" },
        quiet: false,
      });
    }
  });

  it("a refusal is said as one, even with words for a new code", () => {
    expect(answerHeard({ error: WHY, resent: RESENT, at: "lost" })).toEqual({
      focus: true,
      say: { words: WHY, politeness: "polite" },
      quiet: true,
    });
  });

  it("nothing as the step arrives or once the code is in", () => {
    for (const at of ["field", "lost", "elsewhere"] as const) {
      expect(answerHeard({ at }), at).toEqual({ focus: false, quiet: false });
    }
  });
});

describe("the answers counted", () => {
  type Answer = { step: string; error?: string };
  const start: Answer = { step: "phone" };
  const first: Counted<Answer> = { answer: start, count: 0 };

  it("stay as they are while the answer is the same one", () => {
    expect(countAnswer(first, start)).toBe(first);
  });

  it("count each new answer, the same words again included", () => {
    const refused: Answer = { step: "phone", error: "failed" };
    const once = countAnswer(first, refused);
    expect(once).toEqual({ answer: refused, count: 1 });
    expect(countAnswer(once, refused)).toBe(once);
    const again = countAnswer(once, { ...refused });
    expect(again.count).toBe(2);
    expect(countAnswer(again, start).count).toBe(3);
  });
});
