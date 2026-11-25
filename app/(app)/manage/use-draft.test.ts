import { describe, expect, it } from "vitest";
import { forgetRefused, type SentDraft, sendsNow } from "./use-draft";

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

  it("sends nothing again as the field is left after the screen went, while that save is out or saved", () => {
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

// A business's name or address typed keeps what's stored until it saves, so
// a refusal leaves the typed text on screen, to try again on leaving the
// field (after the third check). One that went as the page hid or the
// screen was left, and was refused (no signal), is forgotten, so the field
// left once the person is back sends it again; only a save that's still
// out, or saved, holds the blur back.
describe("forgetRefused", () => {
  const sentAs = (away: boolean) => {
    const mine: SentDraft = { draft: "מסעדת מבחן", stored: "מסעדה", away };
    return { mine, sent: { current: mine as SentDraft | null } };
  };

  it("tries again as the field is left after a refused away-send", async () => {
    for (const outcome of [
      () => Promise.resolve(false),
      () => Promise.reject(new Error("offline")),
    ]) {
      const { mine, sent } = sentAs(true);
      expect(sendsNow(mine.draft, mine.stored, sent.current, false)).toBe(
        false,
      );
      await forgetRefused(outcome(), sent, mine);
      expect(sent.current).toBeNull();
      expect(sendsNow(mine.draft, mine.stored, sent.current, false)).toBe(true);
      expect(sendsNow(mine.draft, mine.stored, sent.current, true)).toBe(true);
    }
  });

  it("forgets one refused as the field was left too", async () => {
    const { mine, sent } = sentAs(false);
    await forgetRefused(Promise.resolve(false), sent, mine);
    expect(sent.current).toBeNull();
  });

  it("keeps it once saved, for a save that says nothing, and while it's out", async () => {
    for (const outcome of [
      Promise.resolve(true),
      Promise.resolve(undefined),
      undefined,
    ]) {
      const { mine, sent } = sentAs(true);
      await forgetRefused(outcome, sent, mine);
      expect(sent.current).toBe(mine);
      expect(sendsNow(mine.draft, mine.stored, sent.current, false)).toBe(
        false,
      );
    }
    const { mine, sent } = sentAs(true);
    let refuse = (_ok: boolean) => {};
    const out = new Promise<boolean>((resolve) => {
      refuse = resolve;
    });
    const settled = forgetRefused(out, sent, mine);
    await Promise.resolve();
    expect(sent.current).toBe(mine);
    refuse(false);
    await settled;
    expect(sent.current).toBeNull();
  });

  it("keeps another draft sent since", async () => {
    const { mine, sent } = sentAs(true);
    const later: SentDraft = {
      draft: "מסעדת ים",
      stored: "מסעדה",
      away: false,
    };
    sent.current = later;
    await forgetRefused(Promise.resolve(false), sent, mine);
    expect(sent.current).toBe(later);
    sent.current = null;
    await forgetRefused(Promise.resolve(false), sent, mine);
    expect(sent.current).toBeNull();
  });
});
