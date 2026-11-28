import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "עזרה" on /me (closing the pilot, PR 15), as the profile reads it
// (`currentHelp`), with the database, the session and the deployment's
// setting stood in for: whom each role asks and what is read for it, the
// clock off, chat off, the accountant, an owner alone, a demo business,
// viewing as someone and a read that fails. Then the row as it is drawn on
// the server, in Hebrew and in English, and its sheet drawn open: the team's
// WhatsApp to the number (or none on a twin) with the business's sentence,
// in the accent only when nobody in the business is written to. Whom to ask
// is @domain/help's, with its own tests.

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  getClockEditors: vi.fn(),
  getColleagues: vi.fn(),
  getDepartments: vi.fn(),
  supportWhatsapp: vi.fn(),
}));
vi.mock("../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../modules", () => ({ currentModules: mocks.currentModules }));
vi.mock("@db/time-clock", () => ({ getClockEditors: mocks.getClockEditors }));
vi.mock("@db/team", () => ({ getColleagues: mocks.getColleagues }));
vi.mock("@db/departments", () => ({ getDepartments: mocks.getDepartments }));
vi.mock("@db/env", () => ({ supportWhatsapp: mocks.supportWhatsapp }));
// `drawn.open` draws what the sheet holds in place, as if it had been
// pressed open, since a page drawn on the server has it closed.
const drawn = vi.hoisted(() => ({ open: false }));
vi.mock("@ui/sheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ui/sheet")>();
  return {
    ...actual,
    Sheet: (props: Parameters<typeof actual.Sheet>[0]) =>
      drawn.open
        ? createElement("div", { role: "dialog" }, props.children)
        : createElement(actual.Sheet, props),
  };
});

const { currentHelp } = await import("./help");
const { HelpSection } = await import("./help-sheet");
const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { isolateName } = await import("@domain/bidi");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;
type HelpData = NonNullable<Awaited<ReturnType<typeof currentHelp>>>;

const heT = createTranslator({ locale: "he", messages: he });
const enT = createTranslator({ locale: "en", messages: en });

// Made up, as the share tests' numbers are.
const NUMBER = "+972501234567";
const OWNER = { id: "00000000-0000-4000-a000-000000000001", name: "נגה" };
const MANAGER = { id: "00000000-0000-4000-a000-000000000002", name: "עידו" };
const WORKER = "00000000-0000-4000-a000-000000000003";
const ACCOUNTANT = "00000000-0000-4000-a000-000000000004";
const MODULES = ["scheduling", "time_clock", "chat"];

/** Someone in a business at `slug`, in `role`, or the team viewing as it. */
function member(
  role: string,
  userId: string,
  { slug = "a-real-shop", viewing = false } = {},
) {
  return {
    userId,
    viewing: viewing ? { role, namedRole: null, businessSlug: slug } : null,
    membership: {
      role,
      perms: [],
      business: { id: "b", slug, name: "חנות & בית" },
    },
  };
}

beforeEach(() => {
  drawn.open = false;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.currentMember.mockResolvedValue(member("worker", WORKER));
  mocks.currentModules.mockResolvedValue(MODULES);
  mocks.getClockEditors.mockResolvedValue([
    { id: OWNER.id, role: "owner", name: OWNER.name },
    { id: MANAGER.id, role: "manager", name: MANAGER.name },
  ]);
  mocks.getColleagues.mockResolvedValue([
    { userId: OWNER.id, role: "owner", name: OWNER.name },
    { userId: MANAGER.id, role: "manager", name: MANAGER.name },
    { userId: WORKER, role: "worker", name: "שקד" },
    { userId: ACCOUNTANT, role: "accountant", name: "רוני" },
  ]);
  mocks.getDepartments.mockResolvedValue([]);
  mocks.supportWhatsapp.mockReturnValue(null);
});

/** The one person `help` offers to write to, or fails. */
function writeTo(help: HelpData | null) {
  expect(help?.ask?.kind).toBe("write");
  return help?.ask?.kind === "write" ? help.ask.person : null;
}

describe("whom 'עזרה' offers", () => {
  it("gives a worker whoever may edit the clock, in chat, and never ConceptApp's team", async () => {
    mocks.supportWhatsapp.mockReturnValue(NUMBER);
    const help = await currentHelp();
    const person = writeTo(help);
    expect(person?.id).toBe(MANAGER.id);
    expect(person?.href).toBe(`/chat/with/${MANAGER.id}`);
    expect(help?.team).toBeNull();
    expect(help?.business).toBe("חנות & בית");
    // The owners came with the editors: the team isn't read.
    expect(mocks.getClockEditors).toHaveBeenCalledWith("b");
    expect(mocks.getColleagues).not.toHaveBeenCalled();
  });

  it("gives a worker the owner with the clock off, without asking who edits it", async () => {
    mocks.currentModules.mockResolvedValue(["scheduling", "chat"]);
    const person = writeTo(await currentHelp());
    expect(person?.id).toBe(OWNER.id);
    expect(person?.href).toBe(`/chat/with/${OWNER.id}`);
    expect(mocks.getClockEditors).not.toHaveBeenCalled();
    expect(mocks.getColleagues).toHaveBeenCalledWith("b");
  });

  it("gives a worker the owner where the database names nobody who edits the clock", async () => {
    mocks.getClockEditors.mockResolvedValue([]);
    expect(writeTo(await currentHelp())?.id).toBe(OWNER.id);
  });

  it("gives a manager the owner, and ConceptApp's team only with the setting", async () => {
    mocks.currentMember.mockResolvedValue(member("manager", MANAGER.id));
    let help = await currentHelp();
    expect(writeTo(help)?.id).toBe(OWNER.id);
    expect(help?.team).toBeNull();
    // Never who may edit the clock: a manager asks above them.
    expect(mocks.getClockEditors).not.toHaveBeenCalled();
    mocks.supportWhatsapp.mockReturnValue(NUMBER);
    help = await currentHelp();
    expect(writeTo(help)?.id).toBe(OWNER.id);
    expect(help?.team).toEqual({ phone: NUMBER });
  });

  it("names the owner to the accountant, who is in no chat, beside ConceptApp's team", async () => {
    mocks.currentMember.mockResolvedValue(member("accountant", ACCOUNTANT));
    mocks.supportWhatsapp.mockReturnValue(NUMBER);
    const help = await currentHelp();
    expect(help?.ask?.kind).toBe("name");
    expect(
      help?.ask?.kind === "name"
        ? help.ask.people.map((p) => [p.name, p.href])
        : [],
    ).toEqual([[OWNER.name, null]]);
    expect(help?.team).toEqual({ phone: NUMBER });
  });

  it("names whom to ask with chat off", async () => {
    mocks.currentModules.mockResolvedValue(["scheduling", "time_clock"]);
    const help = await currentHelp();
    expect(help?.ask?.kind).toBe("name");
  });

  it("gives an owner alone ConceptApp's team, or no row at all", async () => {
    mocks.currentMember.mockResolvedValue(member("owner", OWNER.id));
    expect(await currentHelp()).toBeNull();
    mocks.supportWhatsapp.mockReturnValue(NUMBER);
    expect(await currentHelp()).toEqual({
      ask: null,
      team: { phone: NUMBER },
      business: "חנות & בית",
    });
  });

  it("never gives ConceptApp's team in a demo business, whom to ask still", async () => {
    mocks.supportWhatsapp.mockReturnValue(NUMBER);
    mocks.currentMember.mockResolvedValue(
      member("manager", MANAGER.id, { slug: "demo-shop" }),
    );
    const help = await currentHelp();
    expect(writeTo(help)?.id).toBe(OWNER.id);
    expect(help?.team).toBeNull();
    mocks.currentMember.mockResolvedValue(
      member("owner", OWNER.id, { slug: "demo-restaurant" }),
    );
    expect(await currentHelp()).toBeNull();
  });

  it("gives nothing while viewing as someone, and reads nothing for it", async () => {
    mocks.supportWhatsapp.mockReturnValue(NUMBER);
    for (const role of ["worker", "manager", "owner", "accountant"]) {
      mocks.currentMember.mockResolvedValue(
        member(role, WORKER, { viewing: true }),
      );
      expect(await currentHelp(), role).toBeNull();
    }
    expect(mocks.getClockEditors).not.toHaveBeenCalled();
    expect(mocks.getColleagues).not.toHaveBeenCalled();
    expect(mocks.getDepartments).not.toHaveBeenCalled();
  });

  it("gives nothing outside a business", async () => {
    mocks.currentMember.mockResolvedValue({
      userId: WORKER,
      viewing: null,
      membership: null,
    });
    expect(await currentHelp()).toBeNull();
    mocks.currentMember.mockResolvedValue(null);
    expect(await currentHelp()).toBeNull();
  });

  it("keeps ConceptApp's team when whom to ask can't be read, and says only the code in the log", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.currentMember.mockResolvedValue(member("manager", MANAGER.id));
      mocks.supportWhatsapp.mockReturnValue(NUMBER);
      mocks.getColleagues.mockRejectedValue(
        Object.assign(new Error(`row of ${OWNER.name}`), { code: "57014" }),
      );
      expect(await currentHelp()).toEqual({
        ask: null,
        team: { phone: NUMBER },
        business: "חנות & בית",
      });
      expect(said).toHaveBeenCalledTimes(1);
      expect(said.mock.calls[0]).toEqual([
        "whom to ask for help could not be read",
        "57014",
      ]);
      // With no team to fall back on, no row.
      mocks.supportWhatsapp.mockReturnValue(null);
      expect(await currentHelp()).toBeNull();
    } finally {
      said.mockRestore();
    }
  });
});

/** The row, drawn on the server as a page first is, in `messages`' words. */
function row(help: HelpData, messages: typeof he = he): string {
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
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(HelpSection, { help }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

/** Text as React writes it into HTML. */
const escaped = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("the row", () => {
  const owner = {
    id: OWNER.id,
    role: "owner" as const,
    name: OWNER.name,
    departments: [],
    near: false,
    chat: true,
    href: `/chat/with/${OWNER.id}`,
  };
  const manager = {
    ...owner,
    id: MANAGER.id,
    role: "manager" as const,
    name: MANAGER.name,
  };
  const business = "חנות & בית";

  it("says whom it reaches, in both languages, with no sentence missing", () => {
    const cases: [HelpData, string, string][] = [
      [
        { ask: { kind: "write", person: owner }, team: null, business },
        heT("app.me.help.hint.one", { name: OWNER.name }),
        enT("app.me.help.hint.one", { name: OWNER.name }),
      ],
      [
        {
          ask: { kind: "write", person: owner },
          team: { phone: NUMBER },
          business,
        },
        heT("app.me.help.hint.oneOrTeam", { name: OWNER.name }),
        enT("app.me.help.hint.oneOrTeam", { name: OWNER.name }),
      ],
      [
        {
          ask: { kind: "pick", people: [manager, owner] },
          team: null,
          business,
        },
        heT("app.me.help.hint.some"),
        enT("app.me.help.hint.some"),
      ],
      [
        {
          ask: { kind: "pick", people: [manager, owner] },
          team: { phone: null },
          business,
        },
        heT("app.me.help.hint.someOrTeam"),
        enT("app.me.help.hint.someOrTeam"),
      ],
      [
        {
          ask: {
            kind: "name",
            people: [{ ...owner, chat: false, href: null }],
          },
          team: null,
          business,
        },
        heT("app.me.help.hint.one", { name: OWNER.name }),
        enT("app.me.help.hint.one", { name: OWNER.name }),
      ],
      [
        { ask: null, team: { phone: NUMBER }, business },
        heT("app.me.help.hint.team"),
        enT("app.me.help.hint.team"),
      ],
    ];
    for (const [help, hebrew, english] of cases) {
      const html = row(help);
      expect(html).toContain(escaped(he.app.me.help.row));
      expect(html, hebrew).toContain(escaped(hebrew));
      expect(row(help, en), english).toContain(escaped(english));
      // A button that opens the sheet, which draws nothing until then: no
      // number, link or chat on the page before it is pressed.
      expect(html).toMatch(/<button[^>]*type="button"/);
      expect(html).not.toContain("wa.me");
      expect(html).not.toContain("/chat/with/");
    }
  });

  /** The open sheet's WhatsApp to ConceptApp's team: its address and look. */
  function teamLink(help: HelpData, messages: typeof he = he) {
    drawn.open = true;
    const html = row(help, messages);
    drawn.open = false;
    const tag = html.match(/<a [^>]*href="https:\/\/wa\.me\/[^>]*>/)?.[0];
    return {
      html,
      // As the browser reads the attribute React wrote.
      href: tag
        ?.match(/href="([^"]*)"/)?.[1]
        ?.replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&"),
      look: tag?.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [],
    };
  }

  it("opens WhatsApp to ConceptApp's number, with the sentence naming the business, and to no number on a twin", () => {
    const sentence = (t: typeof heT) =>
      encodeURIComponent(
        t("app.me.help.team.message", { business: isolateName(business) }),
      );
    for (const [messages, t] of [
      [he, heT],
      [en, enT],
    ] as const) {
      expect(
        teamLink({ ask: null, team: { phone: NUMBER }, business }, messages)
          .href,
      ).toBe(`https://wa.me/972501234567?text=${sentence(t)}`);
      expect(
        teamLink({ ask: null, team: { phone: null }, business }, messages).href,
      ).toBe(`https://wa.me/?text=${sentence(t)}`);
    }
    // No team: no WhatsApp in the sheet.
    const { html, href } = teamLink({
      ask: { kind: "write", person: owner },
      team: null,
      business,
    });
    expect(href).toBeUndefined();
    expect(html).toContain(`/chat/with/${OWNER.id}`);
  });

  it("makes the team's WhatsApp the sheet's one action when nobody in the business is written to, and grey beside a chat", () => {
    const primary = ["bg-accent", "min-h-13"];
    const secondary = ["bg-surface-2", "min-h-11"];
    const cases: [string, HelpData, string[]][] = [
      // An owner alone.
      ["alone", { ask: null, team: { phone: NUMBER }, business }, primary],
      // The accountant, or chat off: the owner only named.
      [
        "named",
        {
          ask: {
            kind: "name",
            people: [{ ...owner, chat: false, href: null }],
          },
          team: { phone: NUMBER },
          business,
        },
        primary,
      ],
      // A manager, the owner's chat first.
      [
        "write",
        {
          ask: { kind: "write", person: owner },
          team: { phone: NUMBER },
          business,
        },
        secondary,
      ],
      [
        "pick",
        {
          ask: { kind: "pick", people: [manager, owner] },
          team: { phone: null },
          business,
        },
        secondary,
      ],
    ];
    for (const [name, help, look] of cases) {
      const drawnLook = teamLink(help).look;
      expect(drawnLook, name).toEqual(expect.arrayContaining(look));
      const other = look === primary ? secondary : primary;
      for (const token of other) expect(drawnLook, name).not.toContain(token);
    }
  });
});
