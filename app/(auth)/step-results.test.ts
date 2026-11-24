import { describe, expect, it } from "vitest";
import type { SignInError } from "./otp";
import {
  aboutTheNumber,
  type Counted,
  codeAnswerHeard,
  countAnswer,
} from "./step-results";

// What sign-in and joining do with each answer of their steps: where a
// refusal is said, when its line is drawn anew, and how the code field says
// each answer of its step, once (accessibility, part 2).

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

describe("a refusal on the phone step", () => {
  it("is the field's only when the number itself was refused", () => {
    for (const [error, onField] of Object.entries(ON_THE_NUMBER)) {
      expect(aboutTheNumber(error as SignInError), error).toBe(onField);
    }
    expect(aboutTheNumber(undefined)).toBe(false);
  });
});

describe("an answer of the code step", () => {
  const WHY = "The code is 6 digits.";
  const RESENT = "We asked for a new code.";

  it("refused where the focus fell elsewhere: the field takes it and is read with why, nothing else says it", () => {
    expect(codeAnswerHeard({ error: WHY, focused: false })).toEqual({
      focus: true,
    });
  });

  it("refused where the field kept the focus: why said at once, the focus left where it is", () => {
    expect(codeAnswerHeard({ error: WHY, focused: true })).toEqual({
      focus: false,
      say: { words: WHY, politeness: "assertive" },
    });
  });

  it("a new code asked for: the focus back in the field, and its words said after it", () => {
    for (const focused of [false, true]) {
      expect(
        codeAnswerHeard({ resent: RESENT, focused }),
        `${focused}`,
      ).toEqual({ focus: true, say: { words: RESENT, politeness: "polite" } });
    }
  });

  it("a refusal is said as one, even with words for a new code", () => {
    expect(
      codeAnswerHeard({ error: WHY, resent: RESENT, focused: false }),
    ).toEqual({ focus: true });
  });

  it("nothing as the step arrives or once the code is in", () => {
    for (const focused of [false, true]) {
      expect(codeAnswerHeard({ focused }), `${focused}`).toEqual({
        focus: false,
      });
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
