import { describe, expect, it } from "vitest";
import type { SignInError } from "./otp";
import {
  aboutTheNumber,
  type Counted,
  codeTakesFocus,
  countAnswer,
} from "./step-results";

// What sign-in and joining do with each answer of their steps: where a
// refusal is said, when its line is drawn anew, and when the code field
// takes the focus back (accessibility, part 2).

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

describe("the code field takes the focus back", () => {
  it("after a new code or a refusal on the code step", () => {
    expect(codeTakesFocus({ step: "code", resent: true })).toBe(true);
    expect(codeTakesFocus({ step: "code", error: "wrongCode" })).toBe(true);
    expect(codeTakesFocus({ step: "code", error: "tooMany" })).toBe(true);
    expect(codeTakesFocus({ step: "code", error: "elsewhere" })).toBe(true);
  });

  it("not as the step arrives, once the code is in, or on another step", () => {
    expect(codeTakesFocus({ step: "code" })).toBe(false);
    expect(codeTakesFocus({ step: "code", resent: false })).toBe(false);
    expect(codeTakesFocus({ step: "phone", error: "invalidPhone" })).toBe(
      false,
    );
    expect(codeTakesFocus({ step: "invite", error: "failed" })).toBe(false);
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
