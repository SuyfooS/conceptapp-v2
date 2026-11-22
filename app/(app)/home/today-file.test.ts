import { moduleWidgets } from "@domain/modules";
import { manifests } from "@modules/registry";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FileToday } from "../me/file/file-types";

// The hiring file's part of Today (profile H5b): which card shows, in which
// tone, and what the quiet row says; and the two cards drawn on the server
// as a page first is, with every word there. The router and links are
// stood in for; nothing here is written.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { todayFilePart } = await import("./today-file");
const { FileTodayCard } = await import("./today-file-card");
const { BankChangeCard } = await import("./bank-change-card");
const { completeHref, completeWords, pensionLeftOf } = await import(
  "../me/file/file-parts"
);
const { fileScreenDemo } = await import("../../design/shell/me/file/data");
const { baseWording, translator } = await import("../wording");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
const business = "מסעדת הדגמה";

const noa = (over: Partial<FileToday> = {}): FileToday => ({
  businessId: "10000000-0000-4000-b000-000000000001",
  businessName: business,
  role: "worker",
  asked: 4,
  missing: 3,
  pension: null,
  bank: null,
  ...over,
});

const widgets = (on: boolean, role: FileToday["role"] = "worker") =>
  moduleWidgets(
    manifests,
    on ? ["scheduling", "employee_files"] : ["scheduling"],
    { role, perms: [] },
  );

describe("the hiring file on Today", () => {
  it("has its card while anything is missing, in the accent unless it is taken", () => {
    expect(
      todayFilePart({
        widgets: widgets(true),
        file: noa(),
        accentTaken: false,
      }),
    ).toMatchObject({ card: "accent", complete: false });
    expect(
      todayFilePart({ widgets: widgets(true), file: noa(), accentTaken: true })
        .card,
    ).toBe("flat");
    expect(
      todayFilePart({
        widgets: widgets(true, "manager"),
        file: noa({ role: "manager" }),
        accentTaken: false,
      }).card,
    ).toBe("accent");
  });

  it("never for an owner, who isn't counted", () => {
    expect(
      todayFilePart({
        widgets: widgets(true, "owner"),
        file: noa({ role: "owner" }),
        accentTaken: false,
      }),
    ).toMatchObject({ card: null, complete: false });
  });

  it("leaves its quiet row saying the file is complete once nothing is missing", () => {
    expect(
      todayFilePart({
        widgets: widgets(true),
        file: noa({ missing: 0 }),
        accentTaken: false,
      }),
    ).toMatchObject({ card: null, complete: true });
  });

  it("has nothing of the file while its module is off, or when it couldn't be read", () => {
    expect(
      todayFilePart({
        widgets: widgets(false),
        file: noa(),
        accentTaken: false,
      }),
    ).toEqual({ file: null, card: null, complete: false });
    expect(
      todayFilePart({ widgets: widgets(true), file: null, accentTaken: false }),
    ).toEqual({ file: null, card: null, complete: false });
  });
});

/** Drawn as the app draws it, every word there. */
function draw(element: ReactElement): string {
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
    createElement(NextIntlClientProvider, provider, element),
  );
  expect(missing).toEqual([]);
  return html;
}

/** A day as Today says it. */
const longDay = (date: string) =>
  new Intl.DateTimeFormat("he", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** The card's one link: its classes and its words. */
const linkOf = (html: string) => {
  const found = /<a ([^>]*)>([^<]*)<\/a>/.exec(html);
  return { attributes: found?.[1] ?? "", words: found?.[2] ?? "" };
};

describe("the file's card", () => {
  const card = (file: FileToday, tone: "accent" | "flat" = "accent") =>
    draw(
      createElement(FileTodayCard, {
        file,
        tone,
        t: translator(baseWording, "app"),
        day: longDay,
        href: completeHref("", file.pension),
      }),
    );

  it("says how much is missing, and leads to the file", () => {
    const html = card(noa());
    expect(html).toContain(heT("app.me.file.missing", { count: 3 }));
    expect(html).toContain(heT("app.me.file.title", { business }));
    const link = linkOf(html);
    expect(link.words).toBe(he.app.me.file.complete);
    expect(link.attributes).toContain('href="/me/file"');
    expect(html).toContain("bg-accent-soft");
    // The screen's one main action, in the accent.
    expect(link.attributes).toContain("bg-accent text-accent-ink");
  });

  it("keeps its action secondary while something above holds the accent", () => {
    const html = card(noa(), "flat");
    expect(html).not.toContain("bg-accent-soft");
    const link = linkOf(html);
    expect(link.attributes).not.toContain("bg-accent");
    expect(link.attributes).toContain("bg-surface-2");
  });

  it("opens the pension's step when a fund chosen later is all that is left", () => {
    const html = card(
      noa({ missing: 1, pension: { kind: "open", dueOn: "2026-12-24" } }),
    );
    expect(html).toContain(
      heT("app.me.file.pensionLeft", { date: longDay("2026-12-24") }),
    );
    expect(html).not.toContain(heT("app.me.file.missing", { count: 1 }));
    const link = linkOf(html);
    expect(link.words).toBe(he.app.file.actions.choosePension);
    expect(link.attributes).toContain('href="/me/file?step=pension"');
    // Its day passed: said so, a fund can still be chosen, and still the
    // pension's step, as the flow says it there (H5b's last check).
    const passed = card(noa({ missing: 1, pension: { kind: "passed" } }));
    expect(passed).toContain(he.app.me.file.pensionPassed);
    expect(passed).not.toContain(heT("app.me.file.missing", { count: 1 }));
    expect(linkOf(passed).words).toBe(he.app.file.actions.choosePension);
    expect(linkOf(passed).attributes).toContain('href="/me/file?step=pension"');
    expect(completeHref("/design/shell", null)).toBe("/design/shell/me/file");
  });

  it("says what the profile's card says, from the same file", () => {
    const t = translator(baseWording, "app");
    const { data } = fileScreenDemo("later", "he");
    // By its day, then with the day passed: Today's card and the profile's
    // take the same words of the same file (`completeWords`).
    for (const [pensionDueOn, words] of [
      [
        "2026-12-24",
        heT("app.me.file.pensionLeft", { date: longDay("2026-12-24") }),
      ],
      ["2026-11-23", he.app.me.file.pensionPassed],
    ] as const) {
      const pension = pensionLeftOf({ ...data, pensionDueOn });
      expect(completeWords(t, 1, pension, longDay)).toBe(words);
      expect(card(noa({ missing: 1, pension }))).toContain(words);
    }
    expect(completeWords(t, 3, null, longDay)).toBe(
      heT("app.me.file.missing", { count: 3 }),
    );
  });

  it("leads to the file, not the pension, while the file isn't sent yet", () => {
    // Noa's "later" file, not sent: a fund is all it lacks, but it still has
    // to go, and the flow's done screen sends it first.
    const { data } = fileScreenDemo("later", "he", { form101: "off" });
    const pension = pensionLeftOf({
      ...data,
      file: data.file ? { ...data.file, submitted_at: null } : null,
    });
    expect(pension).toBeNull();
    const html = card(noa({ missing: 1, pension }));
    expect(html).toContain(heT("app.me.file.missing", { count: 1 }));
    expect(html).not.toContain(
      heT("app.me.file.pensionLeft", { date: longDay("2026-12-24") }),
    );
    const link = linkOf(html);
    expect(link.words).toBe(he.app.me.file.complete);
    expect(link.attributes).toContain('href="/me/file"');
  });

  it("carries the twin's state to the file's twin", () => {
    const pension = { kind: "open", dueOn: "2026-12-24" } as const;
    const html = draw(
      createElement(FileTodayCard, {
        file: noa({ missing: 1, pension }),
        tone: "accent",
        t: translator(baseWording, "app"),
        day: longDay,
        href: completeHref("/design/shell", pension, "state=later"),
      }),
    );
    expect(linkOf(html).attributes).toContain(
      'href="/design/shell/me/file?step=pension&amp;state=later"',
    );
  });
});

describe("the bank change's card", () => {
  const actions = {
    dispute: async () => ({ ok: true }) as const,
    seenUrl: "/home/bank-seen",
  };
  const changedAt = "2026-11-01T08:00:00.123456+00:00";
  const day = new Intl.DateTimeFormat("he", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date("2026-11-01T12:00:00Z"));
  const b = he.app.home.file.bank;
  const buttons = (html: string) =>
    (html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []).map(
      (button) => button.replace(/<[^>]*>/g, ""),
    );

  it("says when the account changed, and asks whether it was them", () => {
    const html = draw(
      createElement(BankChangeCard, {
        bank: { on: "2026-11-01", changedAt, disputed: false },
        business,
        businessId: noa().businessId,
        actions,
      }),
    );
    expect(html).toContain(b.title);
    expect(html).toContain(
      heT("app.home.file.bank.body", { date: day, business }),
    );
    expect(buttons(html)).toEqual([b.dispute, b.mine]);
    // A region named by its title, which can take the focus.
    const named = /<section aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(named).toBeTruthy();
    const title = html.match(/<h2 [^>]*>/)?.[0];
    expect(title).toContain(`id="${named}"`);
    expect(title).toContain('tabindex="-1"');
  });

  it("says what follows once disputed, with one way to put it away", () => {
    const html = draw(
      createElement(BankChangeCard, {
        bank: { on: "2026-11-01", changedAt, disputed: true },
        business,
        businessId: noa().businessId,
        actions,
      }),
    );
    expect(html).toContain(b.disputedTitle);
    expect(html).toContain(heT("app.home.file.bank.disputed", { business }));
    expect(buttons(html)).toEqual([b.seen]);
  });
});
