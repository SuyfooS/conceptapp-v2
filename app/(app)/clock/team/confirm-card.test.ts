import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONFIRM_TITLE, entryTarget } from "./next-approval";
import type { EntryToConfirm } from "./team-types";

// The entries waiting for approval as the page first draws them
// (accessibility, part 5): each entry's words carry what the focus goes on
// to once another one is approved (`entryTarget`), the person's name and
// what waits read together, and the card's title its own mark. Drawn on the
// server; nothing is sent.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { createTranslator, NextIntlClientProvider } = await import("next-intl");
const { ConfirmCard } = await import("./confirm-card");
const he = (await import("@/messages/he.json")).default;
const t = createTranslator({ locale: "he", messages: he });

const rows: EntryToConfirm[] = [
  {
    entryId: "68000000-0000-4000-a000-000000000031",
    userId: "00000000-0000-4000-a000-000000000004",
    name: "יואב לוי",
    date: "2026-11-05",
    what: "in",
    time: "09:14",
  },
  {
    entryId: "68000000-0000-4000-a000-000000000032",
    userId: "00000000-0000-4000-a000-000000000003",
    name: "נועה כהן",
    date: "2026-11-04",
    what: "both",
    time: "16:00–23:42",
  },
];

function draw(waiting: EntryToConfirm[]): string {
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(ConfirmCard, {
        rows: waiting,
        confirm: async () => ({ ok: true as const }),
        teamPath: "/clock/team",
        viewOnly: false,
      }),
    ),
  );
}

/** The element `selector` (an attribute's) finds, up to its first closing tag of `tag`. */
function found(html: string, selector: string, tag: string): string {
  const [, attribute = "", value = ""] =
    /^\[([\w-]+)(?:="(.*)")?\]$/.exec(selector) ?? [];
  const mark = value ? `${attribute}="${value}"` : `${attribute}=""`;
  const at = html.indexOf(mark);
  if (at < 0) throw new Error(`nothing has ${mark}`);
  return html.slice(at, html.indexOf(`</${tag}>`, at));
}

describe("ConfirmCard", () => {
  it("marks each entry's words, the person's name and what waits", () => {
    const html = draw(rows);
    for (const row of rows) {
      const words = found(html, entryTarget(row.entryId), "div");
      expect(words).toContain(row.name ?? "");
      expect(words).not.toContain("<button");
    }
  });

  it("marks the card's title, which counts what waits", () => {
    const html = draw(rows);
    expect(found(html, CONFIRM_TITLE, "h2")).toContain(
      t("app.clock.team.confirm.title", { count: 2 }),
    );
  });

  it("draws nothing when nothing waits", () => {
    expect(draw([])).not.toContain("data-confirm-title");
  });
});
