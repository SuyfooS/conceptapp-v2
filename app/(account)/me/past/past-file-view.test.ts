import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PastFileData, PastFrame } from "./past-file-types";

// A former worker's old file drawn whole (profile H5c), on the server as a
// page first is: every state in Hebrew and in English with not one word
// missing, read-only (no form, no submit), the numbers as their last digits
// only, and the two ways in. Links and the router are stood in for;
// nothing here is written.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/me/past",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { PastFileView, PastUnavailable } = await import("./past-file-view");
const { PastJobsSection } = await import("./past-jobs");
const { NoBusinessScreen } = await import("../../../(app)/no-business");
const { baseWording } = await import("../../../(app)/wording");
const { pastFileDemo, pastJobDemo, FILE_DEMO_NUMBERS } = await import(
  "../../../design/shell/me/file/data"
);
const { glowClass } = await import("@ui/page-glow");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
const enT = createTranslator({ locale: "en", messages: en });
const CAFE = pastJobDemo.name;

const reveal = async () => ({ ok: true as const, value: "000000018" });

/** Drawn as a page is: inside the app's provider, in Hebrew. */
function draw(node: ReactNode): string {
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(
    createElement(NextIntlClientProvider, provider, node as ReactElement),
  );
}

/** The words as a person reads them: no tags, no entities. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The classes of the first tag that matches. */
function classesOf(html: string, tag: RegExp): string[] {
  const found = tag.exec(html)?.[0] ?? "";
  return /class="([^"]*)"/.exec(found)?.[1]?.split(" ") ?? [];
}

/** Every console.error, which next-intl's missing words go to. */
function watchErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

const file = (data: PastFileData) =>
  draw(createElement(PastFileView, { data, reveal }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the old file", () => {
  it("is drawn in Hebrew and in English with every word, and nothing to send", () => {
    const errors = watchErrors();
    for (const lang of ["he", "en"] as const) {
      for (const state of ["file", "passport", "returned"] as const) {
        for (const back of ["profile", "list"] as const) {
          const html = file(pastFileDemo(lang, state, back));
          expect(html).not.toContain("<form");
          expect(html).not.toContain('type="submit"');
          expect(html, `${lang} ${state}`).not.toMatch(/app\.(past|file|me)\./);
        }
      }
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it("says who it is, how long they were there and what the business keeps", () => {
    const html = text(file(pastFileDemo("he")));
    expect(html).toContain(heT("app.file.title", { business: CAFE }));
    expect(html).toContain(
      heT("app.past.subtitle", { business: CAFE, date: "אוקטובר 2026" }),
    );
    expect(html).toContain(heT("app.past.kept.title", { business: CAFE }));
    expect(html).toContain(heT("app.past.kept.fix", { business: CAFE }));
    expect(html).toContain(he.app.me.file.visible);
    // Managers no longer see the contact: never the note that says they do.
    expect(html).not.toContain(he.app.me.file.visibleEmergency);
    expect(html).toContain("נועה");
    expect(html).toContain("הרצל 12");
    expect(html).toContain("noa@demo.conceptapp.invalid");
    expect(html).toContain(he.pensionFunds.harel);
    expect(html).toContain(
      heT("app.file.form101.status", { status: "handed_in" }),
    );
  });

  it("shows the numbers' last digits only, each with its own press", () => {
    const html = file(pastFileDemo("he"));
    expect(html).toContain("•••0018");
    expect(html).toContain("•••0001");
    expect(html).not.toContain(FILE_DEMO_NUMBERS.id);
    expect(html).not.toContain(FILE_DEMO_NUMBERS.bankAccount);
    expect([
      ...html.matchAll(new RegExp(`>${he.app.file.masked.show}<`, "g")),
    ]).toHaveLength(2);
  });

  it("is in a left-to-right English frame for someone who chose English, in the business's colour", () => {
    const html = file(pastFileDemo("en"));
    expect(html).toMatch(
      /<div data-accent="" style="[^"]*" dir="ltr" lang="en" class="[^"]*">/,
    );
    expect(text(html)).toContain(
      enT("app.past.kept.title", { business: CAFE }),
    );
    expect(text(html)).toContain(
      enT("app.past.subtitle", { business: CAFE, date: "October 2026" }),
    );
    const hebrew = file(pastFileDemo("he"));
    expect(hebrew).toMatch(/<div data-accent="" style="[^"]*" class="[^"]*">/);
    expect(hebrew).not.toContain('lang="en"');
  });

  it("washes the whole window in the business's colour at every width, and only the page is narrowed", () => {
    const screens = [
      file(pastFileDemo("he")),
      draw(
        createElement(PastUnavailable, {
          screen: { kind: "off", job: pastJobDemo, locale: "he", back: "list" },
        }),
      ),
    ];
    for (const html of screens) {
      // Outside the app's frame: the wash of a whole page, on the frame
      // that is the window's width, never the in-frame one that goes on
      // desktop.
      const frame = classesOf(html, /<div data-accent=""[^>]*>/);
      expect(frame).toEqual(expect.arrayContaining(glowClass.split(" ")));
      expect(frame).not.toContain("xl:bg-none");
      const page = classesOf(html, /<main[^>]*>/);
      expect(page).toContain("max-w-5xl");
      // A wash on the narrowed page would stop in a line at its edge.
      expect(page.filter((name) => /(^|:)bg-/.test(name))).toEqual([]);
    }
  });

  it("wraps a long email inside its card", () => {
    const email = "michal.bendavid.1987@company-mail.co.il";
    const html = file({ ...pastFileDemo("he"), email });
    const row = new RegExp(
      `<dd class="([^"]*)"><span dir="ltr">${email.replace(/\./g, "\\.")}</span></dd>`,
    ).exec(html);
    expect(row?.[1]?.split(" ")).toContain("wrap-anywhere");
  });

  it("says managers no longer see the contact only when there is one", () => {
    const data = pastFileDemo("he");
    expect(text(file(data))).toContain(he.app.past.kept.emergency);
    expect(text(file({ ...data, emergency: null }))).not.toContain(
      he.app.past.kept.emergency,
    );
  });

  it("names a passport's country and its expiry", () => {
    const html = text(file(pastFileDemo("he", "passport")));
    expect(html).toContain(he.app.file.identity.passportNumber);
    expect(html).toContain(
      new Intl.DisplayNames(["he"], { type: "region" }).of("PH") ?? "PH",
    );
    expect(html).toContain("30 ביוני 2031");
  });

  it("gives the passport its own last digits, never the account's", () => {
    const { masked } = pastFileDemo("he", "passport");
    expect(masked.id).toBe(`•••${FILE_DEMO_NUMBERS.passport.slice(-4)}`);
    expect(masked.id).not.toBe(masked.bankAccount);
    const html = file(pastFileDemo("he", "passport"));
    for (const shown of [masked.id, masked.bankAccount]) {
      expect(html).toContain(shown ?? "a number");
    }
  });

  it("says why this year's 101 came back", () => {
    const html = text(file(pastFileDemo("he", "returned")));
    expect(html).toContain(
      heT("app.past.form101.returned", { reason: "signature" }),
    );
  });

  it("titles the contact part by what it holds", () => {
    const data = pastFileDemo("he");
    expect(file(data)).toMatch(
      new RegExp(`<h2[^>]*>${he.app.file.steps.name.address}</h2>`),
    );
    expect(file({ ...data, address: null, city: null })).toMatch(
      new RegExp(`<h2[^>]*>${he.app.file.steps.name.contact}</h2>`),
    );
  });

  it("says what was given nowhere, and what a holder handed on directly", () => {
    const data = pastFileDemo("he");
    const row = data.file;
    if (!row) throw new Error("a row");
    const html = text(
      file({
        ...data,
        file: {
          ...row,
          pension_answer: "later",
          pension_fund: null,
          direct_groups: ["identity"],
        },
      }),
    );
    expect(html).toContain(he.app.me.file.values.direct);
    expect(html).toContain(he.app.me.file.values.none);
  });

  it("goes back where the person came from", () => {
    expect(file(pastFileDemo("he", "file", "profile"))).toContain('href="/me"');
    expect(file(pastFileDemo("he", "file", "list"))).toContain('href="/home"');
  });
});

describe("the old file's other states", () => {
  const frame = (locale: "he" | "en"): PastFrame => ({
    job: pastJobDemo,
    locale,
    back: "list",
  });

  it("are drawn with every word, in each language, with one way back", () => {
    const errors = watchErrors();
    const words = {
      off: (t: typeof heT) => t("app.past.off", { business: CAFE }),
      empty: (t: typeof heT) => t("app.past.empty", { business: CAFE }),
      viewing: (t: typeof heT) => t("app.file.viewing"),
      unavailable: (t: typeof heT) => t("app.file.failures.keys"),
    };
    for (const [kind, said] of Object.entries(words)) {
      for (const [lang, t] of [
        ["he", heT],
        ["en", enT as unknown as typeof heT],
      ] as const) {
        const html = draw(
          createElement(PastUnavailable, {
            screen: { kind: kind as keyof typeof words, ...frame(lang) },
          }),
        );
        expect(text(html), `${kind} ${lang}`).toContain(said(t));
        expect(text(html)).toContain(t("app.file.title", { business: CAFE }));
        expect(html).not.toContain("<form");
        expect(
          [...html.matchAll(/href="\/home"/g)],
          `${kind} ${lang}`,
        ).toHaveLength(2);
      }
    }
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("the previous jobs", () => {
  const other = {
    businessId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    name: "החנות",
    accent: "#7c3aed",
    leftAt: "2026-08-31T22:30:00.000Z",
  };

  it("lead to each old file by the business's id alone, with the month they left", () => {
    const html = draw(
      createElement(PastJobsSection, {
        jobs: [pastJobDemo, other],
        wording: baseWording,
      }),
    );
    expect(
      [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href),
    ).toEqual([
      `/me/past/${pastJobDemo.businessId}`,
      `/me/past/${other.businessId}`,
    ]);
    expect(text(html)).toContain(he.app.past.section);
    expect(text(html)).toContain(heT("app.me.file.title", { business: CAFE }));
    expect(text(html)).toContain(
      heT("app.past.until", { date: "אוקטובר 2026" }),
    );
    // Israel's month: the last night of August there is already September.
    expect(text(html)).toContain(
      heT("app.past.until", { date: "ספטמבר 2026" }),
    );
  });

  it("come before the way out on the screen of someone with no business", async () => {
    const html = draw(
      await NoBusinessScreen({
        signOut: async () => null,
        left: CAFE,
        past: createElement(PastJobsSection, {
          jobs: [pastJobDemo],
          wording: baseWording,
        }),
      }),
    );
    const list = html.indexOf(he.app.past.section);
    const out = html.indexOf(he.app.signOut);
    expect(list).toBeGreaterThan(0);
    expect(out).toBeGreaterThan(list);
    // Without them, the way out is the empty state's own, as before.
    const none = draw(await NoBusinessScreen({ signOut: async () => null }));
    expect(none).not.toContain(he.app.past.section);
    expect(none).toContain(he.app.signOut);
  });
});
