import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import { modeLine } from "./mode-line";
import type { ModeStatus } from "./modes";

const t = createTranslator<typeof he, "app.orders.home">({
  locale: "he",
  messages: he,
  namespace: "app.orders.home",
});
const words = he.app.orders.home;
const KITCHEN = "00000000-0000-4000-8000-0000000000a1";

const status = (extra: Partial<ModeStatus> = {}): ModeStatus => ({
  takes: true,
  runs: false,
  clock: null,
  ready: 0,
  making: 0,
  waiting: [],
  ...extra,
});
const line = (extra: Partial<ModeStatus> = {}) =>
  modeLine(t, status(extra), (id) => (id === KITCHEN ? "מטבח" : ""));

describe("what the mode's way in says", () => {
  it("tells a taker off a shift that it opens on one", () => {
    expect(line({ clock: "clock" })).toBe(words.offClock);
    expect(line({ clock: "staleShift" })).toBe(words.offClock);
  });

  it("tells someone who runs orders off a shift that only the send waits", () => {
    // Their mode opens: what they read and serve, and that sending waits.
    expect(line({ runs: true, clock: "clock" })).toBe(words.sendWaits);
    expect(line({ runs: true, clock: "clock", ready: 1 })).toBe(
      `${t("ready", { count: 1 })} · ${words.sendWaits}`,
    );
    expect(line({ runs: true, clock: "clock" })).not.toBe(words.offClock);
  });

  it("says what is ready and being made on a shift, or how to start", () => {
    expect(line()).toBe(words.idle);
    expect(line({ runs: true })).toBe(words.idle);
    expect(line({ ready: 2, making: 1 })).toBe(
      `${t("ready", { count: 2 })} · ${t("making", { count: 1 })}`,
    );
  });

  it("tells whoever only prepares what waits, by department", () => {
    expect(
      line({ takes: false, waiting: [{ department: KITCHEN, count: 2 }] }),
    ).toBe(t("waiting", { department: "מטבח", count: 2 }));
    expect(line({ takes: false })).toBe(words.nothingWaiting);
  });
});
