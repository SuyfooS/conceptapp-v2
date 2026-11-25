import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClockActions } from "./clock-types";

// The clock's own buttons while a press without a code is still on its way
// (23 November 2026). Its sheet closes as soon as the answer is back, a
// refusal included, while the page read again after it (`refresh()`) may
// still be coming: until it is drawn, the screen shows what was there before,
// an open shift another device closed, say. The circle, "Start break", "End
// shift" and taking a clock-out back wait for that page too, so no second
// write goes out against it. Drawn on the server as a page first is, with the
// sheet's write held in that moment; nothing is sent.

const sheetWrite = vi.hoisted(() => ({ pending: false }));
vi.mock("@ui/use-sheet-write", () => ({
  useSheetWrite: () => ({
    pending: sheetWrite.pending,
    start: () => {},
    held: () => false,
    said: () => {},
  }),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider } = await import("next-intl");
const { ClockPanel } = await import("./clock-panel");
const { demoClock } = await import("../../design/shell/clock/data");
const he = (await import("@/messages/he.json")).default;
const c = he.app.clock;

const refused = async () => ({ ok: false as const, failure: "notIn" as const });
const actions: ClockActions = {
  clockIn: refused,
  clockOut: refused,
  startBreak: refused,
  endBreak: refused,
  undoClockOut: refused,
};

/** The panel in one of its states, the business asking for a code. */
function draw(state: string | undefined, noneOnItsWay: boolean): string {
  sheetWrite.pending = noneOnItsWay;
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(ClockPanel, {
        data: demoClock(state, new Date("2026-11-23T12:00:00Z"), true),
        actions,
      }),
    ),
  );
}

/** Whether the button that says `label` can be pressed, as drawn. */
function pressable(html: string, label: string): boolean {
  const button = html
    .split("<button")
    .slice(1)
    .map((part) => part.slice(0, part.indexOf("</button>")))
    .find((part) => part.includes(label));
  if (button === undefined) throw new Error(`no button "${label}"`);
  const tag = button.slice(0, button.indexOf(">"));
  return !/\sdisabled=""/.test(tag);
}

/** Each state, and the buttons it shows of the screen's own. */
const screens: [string, string | undefined, string[]][] = [
  ["before work", undefined, [c.circle.scanIn]],
  ["at work", "working", [c.circle.scanOut, c.startBreak]],
  ["on a break", "break", [c.circle.back, c.endShift]],
  ["just left", "left", [c.circle.scanIn, c.undo]],
];

describe("ClockPanel's own buttons", () => {
  it.each(screens)(
    "%s: can be pressed with nothing on its way",
    (_, state, labels) => {
      const html = draw(state, false);
      for (const label of labels) expect(pressable(html, label)).toBe(true);
    },
  );

  it.each(screens)(
    "%s: wait while a press without a code is on its way, its sheet closed",
    (_, state, labels) => {
      const html = draw(state, true);
      for (const label of labels) expect(pressable(html, label)).toBe(false);
    },
  );
});
