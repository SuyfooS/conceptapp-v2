import { describe, expect, it } from "vitest";
import { sendsNow } from "./use-draft";

// A typed setting saves as its field is left, and also as the page is hidden
// or the screen is left with the focus still in it (filling from
// availability, part 5, after the second review). Whichever comes first,
// the other sends nothing again: a blur can come after the screen hid, and
// the screen can hide after a blur, before what's stored has followed.

describe("sendsNow", () => {
  it("sends a draft nothing sent yet, either way", () => {
    expect(sendsNow("50", "42", null, false)).toBe(true);
    expect(sendsNow("50", "42", null, true)).toBe(true);
  });

  it("sends nothing again as the screen goes after the field was left", () => {
    const left = { draft: "50", stored: "42", away: false };
    expect(sendsNow("50", "42", left, true)).toBe(false);
  });

  it("sends nothing again as the field is left after the screen went", () => {
    const away = { draft: "50", stored: "42", away: true };
    expect(sendsNow("50", "42", away, false)).toBe(false);
    expect(sendsNow("50", "42", away, true)).toBe(false);
  });

  it("tries again when the field is left again after a refusal", () => {
    const left = { draft: "50", stored: "42", away: false };
    expect(sendsNow("50", "42", left, false)).toBe(true);
  });

  it("sends another draft, or the same one against another stored value", () => {
    const away = { draft: "50", stored: "42", away: true };
    expect(sendsNow("51", "42", away, false)).toBe(true);
    expect(sendsNow("51", "42", away, true)).toBe(true);
    expect(sendsNow("50", "45", away, false)).toBe(true);
    expect(sendsNow("50", "45", away, true)).toBe(true);
  });
});
