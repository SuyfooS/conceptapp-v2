import type { ShiftRecord } from "@domain/time-clock";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  ClockAskFix as AskFixData,
  ClockActions,
  ClockData,
  HoursFixerLink,
} from "./clock-types";

// Whom a worker asks to correct their hours (closing the pilot, PR 8), drawn
// on the server as a page first is: under the clock's refusals that say to
// ask whoever approves hours, and beside "צריך תיקון" in their own shifts,
// "כתיבה ל{name}" to their private chat, a choice among several, or with
// chat off only their names. Nothing is sent from here.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { AskFix } = await import("./ask-fix");
const { ClockPanel } = await import("./clock-panel");
const { ShiftList } = await import("./shift-list");
const { demoClock } = await import("../../design/shell/clock/data");
const { baseWording, translator } = await import("../wording");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
const a = he.app.clock.history.askFix;

const SHIRAN_NAME = "שירן הדגמה";
const SHIRAN: HoursFixerLink = {
  id: "00000000-0000-4000-a000-000000000002",
  role: "manager",
  name: SHIRAN_NAME,
  departments: ["אולם", "בר"],
  near: true,
  chat: true,
  href: "/chat/with/00000000-0000-4000-a000-000000000002",
};
const URI_NAME = "אורי הדגמה";
const URI: HoursFixerLink = {
  id: "00000000-0000-4000-a000-000000000001",
  role: "owner",
  name: URI_NAME,
  departments: [],
  near: false,
  chat: true,
  href: "/chat/with/00000000-0000-4000-a000-000000000001",
};

/** `node` inside the app's words, Hebrew unless said. */
function inWords(node: ReactNode, messages: typeof he = he): string {
  const missing: string[] = [];
  const provider = {
    locale: messages === en ? "en" : "he",
    timeZone: "Asia/Jerusalem",
    messages,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const html = renderToString(
    createElement(NextIntlClientProvider, provider, node),
  );
  expect(missing).toEqual([]);
  return html;
}

const draw = (ask: AskFixData, messages: typeof he = he) =>
  inWords(createElement(AskFix, { ask }), messages);

/** The links drawn, each its address. */
const hrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);

/** React's way of writing text into HTML, for the words to find in it. */
const escaped = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("AskFix", () => {
  it("writes to the one person in their private chat, by name", () => {
    const html = draw({ kind: "write", person: SHIRAN });
    expect(hrefs(html)).toEqual([`/chat/with/${SHIRAN.id}`]);
    expect(html).toContain(
      escaped(heT("app.clock.history.askFix.write", { name: SHIRAN_NAME })),
    );
    expect(html).not.toContain("<button");
  });

  it("writes to someone with no name as whoever approves hours", () => {
    const html = draw({ kind: "write", person: { ...SHIRAN, name: null } });
    expect(hrefs(html)).toEqual([`/chat/with/${SHIRAN.id}`]);
    expect(html).toContain(escaped(a.writeAny));
  });

  it("offers several to pick from, in a sheet that opens on a press", () => {
    const html = draw({ kind: "pick", people: [SHIRAN, URI] });
    // The sheet is closed until pressed: only its button is drawn.
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"/);
    expect(html).toContain(escaped(a.writeAny));
    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain(escaped(a.pickTitle));
  });

  it("only names the one person with chat off", () => {
    const html = draw({
      kind: "name",
      people: [{ ...SHIRAN, chat: false, href: null }],
    });
    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain("<button");
    expect(html).toContain(
      escaped(heT("app.clock.history.askFix.named", { name: SHIRAN_NAME })),
    );
  });

  it("names the one person whose chat has no address, linking nowhere", () => {
    const html = draw({ kind: "write", person: { ...SHIRAN, href: null } });
    expect(hrefs(html)).toEqual([]);
    expect(html).toContain(
      escaped(heT("app.clock.history.askFix.named", { name: SHIRAN_NAME })),
    );
  });

  it("names several with chat off, every name in one sentence", () => {
    const html = draw({
      kind: "name",
      people: [
        { ...SHIRAN, chat: false, href: null },
        { ...URI, chat: false, href: null },
      ],
    });
    expect(hrefs(html)).toEqual([]);
    expect(html).toContain(escaped(a.namedSome.split("{")[0] ?? ""));
    expect(html).toContain(escaped(SHIRAN_NAME));
    expect(html).toContain(escaped(URI_NAME));
  });

  it("speaks English with the English words", () => {
    const html = draw({ kind: "write", person: SHIRAN }, en);
    expect(html).toContain(`Write to ${SHIRAN_NAME}`);
  });
});

describe("the words", () => {
  it("of each refusal it goes under say to ask whoever approves hours", async () => {
    const { FIX_FAILURES } = await import("@domain/time-clock-format");
    for (const failure of FIX_FAILURES) {
      expect(he.app.clock.failure[failure]).toContain("מי שמאשר שעות");
    }
  });

  it("are plain: no exclamation marks, a full stop after every sentence", () => {
    for (const words of Object.values(a)) expect(words).not.toContain("!");
    for (const words of [a.pickHint, a.named, a.namedSome]) {
      expect(words.endsWith(".")).toBe(true);
    }
  });
});

const NOW = new Date("2026-11-23T12:00:00Z");
const actions: ClockActions = {
  clockIn: async () => ({ ok: true }),
  clockOut: async () => ({ ok: true }),
  startBreak: async () => ({ ok: true }),
  endBreak: async () => ({ ok: true }),
  undoClockOut: async () => ({ ok: true }),
};

/** The clock at work, the shift begun `hoursAgo`, with whom to ask. */
function clockAt(hoursAgo: number, askFix: AskFixData | null): ClockData {
  const working = demoClock("working", NOW);
  const open = working.open;
  if (!open) throw new Error("no open shift in the demo");
  return {
    ...working,
    open: {
      ...open,
      clockIn: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    },
    shift: null,
    askFix,
  };
}

const panel = (data: ClockData) =>
  inWords(createElement(ClockPanel, { data, actions }));

describe("the clock", () => {
  it("offers whom to ask under a shift open over a day, after the alert", () => {
    const html = panel(clockAt(26, { kind: "write", person: SHIRAN }));
    const alert = html.indexOf('role="alert"');
    expect(alert).toBeGreaterThan(-1);
    expect(html).toContain(escaped(he.app.clock.failure.tooLong));
    // Outside the alert, which says only why.
    const link = html.indexOf(`href="/chat/with/${SHIRAN.id}"`);
    expect(link).toBeGreaterThan(html.indexOf("</p>", alert));
  });

  it("offers nobody while the shift is still within its day", () => {
    const html = panel(clockAt(3, { kind: "write", person: SHIRAN }));
    expect(html).not.toContain('role="alert"');
    expect(hrefs(html)).toEqual([]);
  });

  it("says only the refusal when there is nobody to ask", () => {
    const html = panel(clockAt(26, null));
    expect(html).toContain(escaped(he.app.clock.failure.tooLong));
    expect(hrefs(html)).toEqual([]);
  });
});

const OVERDUE: ShiftRecord = {
  id: "68000000-0000-4000-a000-0000000000aa",
  date: "2026-11-22",
  in: "08:00",
  out: null,
  minutes: 24 * 60,
  breakMinutes: 0,
  byManager: false,
  overdue: true,
  attendance: null,
  correction: null,
  cancelled: null,
  breaks: [],
};
const DONE: ShiftRecord = {
  ...OVERDUE,
  id: "68000000-0000-4000-a000-0000000000bb",
  date: "2026-11-20",
  out: "16:00",
  minutes: 480,
  overdue: false,
};

const t = translator(baseWording, "app.clock.history");
const list = (
  records: ShiftRecord[],
  askFix: AskFixData | null,
  onEdit?: (record: ShiftRecord) => void,
) =>
  inWords(
    createElement(ShiftList, {
      records,
      t,
      askFix,
      ...(onEdit ? { onEdit } : {}),
    }),
  );

describe("the person's shifts", () => {
  it("offer whom to ask beside a shift that needs fixing, in every shape", () => {
    const html = list([OVERDUE, DONE], { kind: "write", person: SHIRAN });
    expect(html).toContain(escaped(he.app.clock.history.needsFix));
    // The list of phones and tablets, and the desktop's table.
    expect(hrefs(html)).toEqual([
      `/chat/with/${SHIRAN.id}`,
      `/chat/with/${SHIRAN.id}`,
    ]);
  });

  it("offer nobody beside shifts that need no fixing", () => {
    expect(hrefs(list([DONE], { kind: "write", person: SHIRAN }))).toEqual([]);
  });

  it("are never a manager's: their rows are buttons that open the shift", () => {
    const html = list([OVERDUE], { kind: "write", person: SHIRAN }, () => {});
    expect(hrefs(html)).toEqual([]);
  });
});
