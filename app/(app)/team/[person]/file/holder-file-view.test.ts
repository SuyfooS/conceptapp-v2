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
const { demoHolderFile, DEMO_HOLDER_NUMBERS } = await import(
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
};

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
    const html = draw({ kind: "open", head: head(), data });
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
    const html = draw({ kind: "open", head: head(), data });
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
    for (const list of lists) {
      expect(list).not.toContain("<button");
    }
  });

  it("says what is missing, with where to send a link from for someone who sees the team", () => {
    const data = demoHolderFile("yoav");
    const seen = text(
      draw({ kind: "open", head: head({ name: "יואב לוי" }), data }),
    );
    expect(seen).toContain(f.rows.missing);
    expect(seen).toContain(
      heT("app.team.file.rows.missingHint", { first: "יואב" }),
    );
    const filesOnly = text(
      draw({
        kind: "open",
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
});
