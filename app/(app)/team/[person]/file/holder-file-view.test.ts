import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  HolderFileActions,
  HolderFileHead,
  HolderFileScreen,
} from "./holder-file-types";

// A holder's view of someone's file drawn whole (profile H6a), on the server
// as a page first is: each state with its heading and its one main action,
// with not one word missing; the open file holding the numbers' last digits
// only, never a number; its three shapes; and the account's review in each
// form of address. The router and links are stood in for; nothing here is
// written.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/team/noa/file",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { HolderFileView } = await import("./holder-file-view");
const { demoFileHistory, demoHolderFile, DEMO_HOLDER_NUMBERS } = await import(
  "../../../../design/shell/data"
);
const { baseWording } = await import("../../../wording");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });

const answer = async () => ({ ok: true }) as never;
const actions: HolderFileActions = {
  acknowledge: answer,
  sendCode: answer,
  confirmCode: answer,
  reveal: answer,
  keepOpen: answer,
  lock: answer,
  acknowledgeBank: answer,
  markDirect: answer,
};

/** "מה קרה בתיק" with nothing recorded yet. */
const NO_HISTORY = { entries: [], more: false };

const head = (over: Partial<HolderFileHead> = {}): HolderFileHead => ({
  personId: "noa",
  name: "נועה כהן",
  role: "worker",
  namedRole: null,
  addressForm: "f",
  since: "2026-04-12T08:00:00.000Z",
  seesTeam: true,
  businessId: "demo",
  businessName: "מסעדת הדגמה",
  timeZone: "Asia/Jerusalem",
  ...over,
});

function draw(
  screen: Exclude<HolderFileScreen, { kind: "closed" }>,
  code?: { tail: string },
): string {
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
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(HolderFileView, {
        screen,
        paths: { profile: "/team/noa", team: "/team" },
        actions,
        wording: baseWording,
        code,
      }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

/** The text of the page, its tags gone. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

const f = he.app.team.file;

describe("a holder's file screen", () => {
  it("shows the duties with their seven lines and the one action that confirms them", () => {
    const html = draw({ kind: "duties", head: head() });
    const page = text(html);
    expect(page).toContain(
      heT("app.team.file.page.title", { name: "נועה כהן" }),
    );
    expect(page).toContain(f.duties.title);
    for (const line of [
      f.duties.purpose,
      f.duties.copies,
      f.duties.others,
      f.duties.reveal,
      f.duties.lock,
      f.duties.leak,
      f.duties.ends,
    ]) {
      expect(page).toContain(line);
    }
    expect(page).toContain(f.duties.confirm);
    expect(page).toContain(f.page.visible);
    expect(html).toContain('data-file-gate="duties"');
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("shows the locked file with its one action, and the code's boxes once sent", () => {
    const lockedHtml = draw({ kind: "locked", head: head() });
    expect(lockedHtml).toContain('data-file-gate="locked"');
    const locked = text(lockedHtml);
    expect(locked).toContain(f.locked.title);
    expect(locked).toContain(f.locked.send);
    expect(locked).not.toContain(f.duties.title);
    const code = draw({ kind: "locked", head: head() }, { tail: "0014" });
    expect(text(code)).toContain("0014");
    expect(code).toContain('autoComplete="one-time-code"');
    expect(text(code)).toContain(f.code.resend);
  });

  it("opens the file with the numbers' last digits only, and no main action", () => {
    const data = demoHolderFile("noa");
    const html = draw({
      kind: "open",
      history: NO_HISTORY,
      head: head(),
      data,
    });
    const page = text(html);
    for (const title of [
      f.sections.identity,
      f.sections.contact,
      f.sections.bank,
      f.sections.pension,
    ]) {
      expect(page).toContain(title);
    }
    expect(page).toContain("•••0018");
    expect(page).not.toContain(DEMO_HOLDER_NUMBERS.id);
    expect(page).not.toContain(DEMO_HOLDER_NUMBERS.bankAccount);
    expect(page).toContain(f.lock.action);
    expect(page).not.toContain(f.duties.confirm);
    // One column on a phone, two on a tablet, three on a desktop.
    expect(html).toMatch(
      /data-file-grid="true" class="[^"]*md:grid-cols-2[^"]*xl:grid-cols-3/,
    );
  });

  // Plan §3.4: "תעודה", its number, then "בתוקף עד" and "תאריך לידה"; "בנק",
  // "סניף", the account's number, then whose it is. A number's row names
  // itself, so it sits between two lists of terms, never inside one.
  it("puts each number where it is read, between lists of terms", () => {
    const data = demoHolderFile("noa");
    const html = draw({
      kind: "open",
      history: NO_HISTORY,
      head: head(),
      data,
    });
    const page = text(html);
    const at = (part: string) => {
      const found = page.indexOf(part);
      expect(found, part).toBeGreaterThan(-1);
      return found;
    };
    const idNumber = at(heT("app.team.file.rows.number", { kind: "il" }));
    expect(
      at(heT("app.team.file.rows.documentKind", { kind: "il" })),
    ).toBeLessThan(idNumber);
    expect(idNumber).toBeLessThan(at("•••0018"));
    expect(at("•••0018")).toBeLessThan(at(f.rows.birthDate));
    const account = at(f.rows.account);
    expect(at(f.rows.branch)).toBeLessThan(account);
    expect(account).toBeLessThan(at(data.bank?.masked ?? "none"));
    expect(at(data.bank?.masked ?? "none")).toBeLessThan(at(f.rows.holder));
    const lists = html.match(/<dl[^>]*>.*?<\/dl>/gs) ?? [];
    expect(lists.length).toBeGreaterThan(0);
    // The number's own row, with its "הצגה", is in no list; a holder's
    // write sits under the row it is about (H6b-1).
    for (const list of lists) {
      expect(list).not.toContain(he.app.file.masked.show);
    }
  });

  it("says what is missing, with where to send a link from for someone who sees the team", () => {
    const data = demoHolderFile("yoav");
    const seen = text(
      draw({
        kind: "open",
        history: NO_HISTORY,
        head: head({ name: "יואב לוי" }),
        data,
      }),
    );
    expect(seen).toContain(f.rows.missing);
    expect(seen).toContain(
      heT("app.team.file.rows.missingHint", { first: "יואב" }),
    );
    const filesOnly = text(
      draw({
        kind: "open",
        history: NO_HISTORY,
        head: head({ name: "יואב לוי", seesTeam: false }),
        data,
      }),
    );
    expect(filesOnly).toContain(f.rows.missing);
    expect(filesOnly).not.toContain(
      heT("app.team.file.rows.missingHint", { first: "יואב" }),
    );
    expect(filesOnly).toContain(f.page.backTeam);
  });

  it("says an account to look at in each form of address", () => {
    for (const form of ["f", "m", null] as const) {
      const page = text(
        draw({
          kind: "open",
          history: NO_HISTORY,
          head: head({ addressForm: form }),
          data: demoHolderFile("noa", "disputed"),
        }),
      );
      expect(page).toContain(
        heT("app.team.file.review.disputed", {
          first: "נועה",
          form: form ?? "x",
        }),
      );
    }
  });

  it("says a view and a deployment that can't open files in words alone", () => {
    expect(text(draw({ kind: "viewing", head: head() }))).toContain(f.viewing);
    const unavailable = draw({ kind: "unavailable", head: head() });
    expect(text(unavailable)).toContain(f.unavailable);
    expect(unavailable).not.toMatch(/<button/);
  });

  // The second review: a view as the accountant reads the files alone, and
  // its profile would send it back here.
  it("leads a view as the accountant back to the team's files", () => {
    const html = draw({ kind: "viewing", head: head({ seesTeam: false }) });
    expect(html).toContain('href="/team"');
    expect(html).not.toContain('href="/team/noa"');
    expect(text(html)).toContain(f.page.backTeam);
    expect(draw({ kind: "viewing", head: head() })).toContain(
      'href="/team/noa"',
    );
  });

  // Where the focus goes is the gate's and the watch's (file-focus.test.ts):
  // here, that each place it goes to can take it.
  it("lets the locked card's title, the duties' and each part of the file take the focus", () => {
    const heading = (html: string, words: string) =>
      html.match(new RegExp(`<h2[^>]*>${words}</h2>`))?.[0] ?? "";
    expect(
      heading(draw({ kind: "locked", head: head() }), f.locked.title),
    ).toContain('tabindex="-1"');
    expect(
      heading(draw({ kind: "duties", head: head() }), f.duties.title),
    ).toContain('tabindex="-1"');
    const open = draw({
      kind: "open",
      history: NO_HISTORY,
      head: head(),
      data: demoHolderFile("noa"),
    });
    expect(heading(open, f.sections.identity)).toContain('tabindex="-1"');
    // The open file's first heading, which a right code's focus goes to, is
    // its first part's.
    expect(open.match(/<h2[^>]*>[^<]*<\/h2>/)?.[0]).toContain(
      'id="file-identity"',
    );
  });

  it("says where the code went in a status, so a new code sent is heard", () => {
    const html = draw({ kind: "locked", head: head() }, { tail: "0014" });
    const status = html.match(/<p role="status"[^>]*>.*?<\/p>/s)?.[0] ?? "";
    const words = (key: "sent" | "resent") =>
      heT.markup(`app.team.file.code.${key}`, {
        tail: "0014",
        ltr: (chunks) => chunks,
      });
    expect(text(status)).toBe(words("sent"));
    // A second code says so, so the line is new and is heard.
    expect(words("resent")).not.toBe(words("sent"));
    expect(words("resent")).toContain("0014");
  });
});

// Profile H6b: what a holder does in the open file, "מה קרה בתיק", and a
// minor's checklist.
describe("what a holder does in the open file", () => {
  const open = (
    data: ReturnType<typeof demoHolderFile>,
    over: Partial<HolderFileHead> = {},
    history: Parameters<typeof demoFileHistory>[1] | "none" = "none",
  ) =>
    draw({
      kind: "open",
      head: head(over),
      data,
      history:
        history === "none" ? NO_HISTORY : demoFileHistory("noa", history),
    });
  /** The accent's buttons: the screen's main action. */
  const accents = (html: string) =>
    html.match(/bg-accent text-accent-ink/g)?.length ?? 0;

  it("confirms each kind of review in its own words, the one main action", () => {
    const newOne = text(open(demoHolderFile("noa", "new")));
    expect(newOne).toContain(f.review.confirmNew);
    expect(newOne).toContain(f.review.held);
    const warned = text(open(demoHolderFile("noa", "warned")));
    expect(warned).toContain(f.review.confirmWarned);
    expect(warned).toContain(f.review.held);
    for (const form of ["f", "m", null] as const) {
      const html = open(demoHolderFile("noa", "disputed"), {
        addressForm: form,
      });
      const page = text(html);
      expect(page).toContain(
        heT("app.team.file.review.confirmDisputed", { first: "נועה" }),
      );
      expect(page).toContain(
        heT("app.team.file.review.notTheirs", {
          first: "נועה",
          form: form ?? "x",
        }),
      );
      expect(accents(html)).toBe(1);
    }
    expect(accents(open(demoHolderFile("noa")))).toBe(0);
  });

  it("offers no confirmation for a review without its moment", () => {
    const data = demoHolderFile("noa", "new");
    const page = text(
      open({ ...data, bank: data.bank && { ...data.bank, changedAt: null } }),
    );
    expect(page).not.toContain(f.review.confirmNew);
  });

  it("marks each missing part, takes a mark off, and offers neither on a complete one", () => {
    const count = (page: string, words: string) => page.split(words).length - 1;
    const yoav = text(open(demoHolderFile("yoav"), { name: "יואב לוי" }));
    expect(count(yoav, f.direct.mark)).toBe(2);
    expect(count(yoav, f.direct.markHint)).toBe(2);
    expect(yoav).not.toContain(f.direct.unmark);
    const marked = text(
      open(demoHolderFile("yoav", null, ["bank"]), { name: "יואב לוי" }),
    );
    expect(count(marked, f.direct.mark)).toBe(1);
    expect(count(marked, f.direct.unmark)).toBe(1);
    expect(marked).toContain(f.rows.direct);
    const noa = text(open(demoHolderFile("noa")));
    expect(noa).not.toContain(f.direct.mark);
    expect(noa).not.toContain(f.direct.unmark);
  });

  it("marks a pension whose day passed as the business's choice, and then reads it handed directly", () => {
    const business = "מסעדת הדגמה";
    const passed = text(
      open(demoHolderFile("yoav", null, [], true), { name: "יואב לוי" }),
    );
    expect(passed).toContain(
      heT("app.team.file.rows.pensionPassed", { business }),
    );
    expect(passed).toContain(heT("app.team.file.direct.pension", { business }));
    const after = text(
      open(demoHolderFile("yoav", null, ["pension"], true), {
        name: "יואב לוי",
      }),
    );
    expect(after).toContain(f.rows.direct);
    for (const form of ["f", "m", "x"]) {
      expect(after).not.toContain(
        heT("app.team.file.rows.pensionLaterNone", { first: "יואב", form }),
      );
    }
    expect(after).not.toContain(
      heT("app.team.file.rows.pensionPassed", { business }),
    );
  });

  it("lists what happened in the file in a list and a table, never a value", () => {
    const html = open(demoHolderFile("noa"), {}, "full");
    const page = text(html);
    expect(page).toContain(f.history.title);
    expect(page).toContain(f.history.note);
    expect(page).toContain(
      heT("app.team.file.history.reveal", { fields: "מספר החשבון" }),
    );
    expect(page).toContain(f.history.bankDisputed);
    expect(page).toContain(
      heT("app.team.file.history.details", { fields: "חשבון הבנק" }),
    );
    expect(page).toContain(f.history.submit);
    expect(page).toContain("גלית הדגמה");
    expect(html).toMatch(/xl:hidden/);
    expect(html).toContain(`<caption class="sr-only">${f.history.title}`);
    for (const column of Object.values(f.history.columns)) {
      expect(html).toMatch(new RegExp(`<th[^>]*>${column}</th>`));
    }
    expect(html).not.toContain(DEMO_HOLDER_NUMBERS.id);
    expect(html).not.toContain(DEMO_HOLDER_NUMBERS.bankAccount);
  });

  it("says nothing recorded yet, a history it couldn't read, and that only the newest show", () => {
    expect(text(open(demoHolderFile("noa"), {}, "empty"))).toContain(
      f.history.empty,
    );
    const failed = text(open(demoHolderFile("noa"), {}, "failed"));
    expect(failed).toContain(f.history.failed);
    expect(failed).toContain(f.sections.identity);
    const more = demoFileHistory("noa");
    const page = text(
      draw({
        kind: "open",
        head: head(),
        data: demoHolderFile("noa"),
        history: more && { ...more, more: true },
      }),
    );
    expect(page).toContain(heT("app.team.file.history.more", { count: 40 }));
  });

  it("reminds the business what it owes a minor, and nothing for an adult", () => {
    const maya = text(open(demoHolderFile("maya"), { name: "מאיה פרץ" }));
    expect(maya).toContain(f.minor.title);
    expect(maya).toContain(f.minor.before);
    expect(maya).toContain("27.11.2026");
    expect(maya).not.toContain(f.minor.under15);
    const started = demoHolderFile("maya");
    const unknown = text(
      open({
        ...started,
        identity: { ...started.identity, minor: { startedOn: null } },
      }),
    );
    expect(unknown).toContain(f.minor.noticeNoStart);
    expect(text(open(demoHolderFile("noa")))).not.toContain(f.minor.title);
  });
});
