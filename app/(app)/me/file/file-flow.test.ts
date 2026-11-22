import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Kit } from "./flow-kit";

// The worker's own file drawn whole (profile H5a), on the server as a page
// first is: every state of Noa's twin, at every step and done, in Hebrew
// with the app's words and in English with the file's alone
// (`fileMessages`), with not one word missing. The router and links are
// stood in for; nothing here is written.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/me/file",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator, useTranslations } =
  await import("next-intl");
const { FileFlow } = await import("./file-flow");
const { bankHeld, useHoldWords } = await import("./steps/bank-step");
const { FileFrame } = await import("./file-frame");
const { FileView } = await import("./file-view");
const { fileMessages } = await import("./file-messages");
const { fileScreenDemo } = await import("../../../design/shell/me/file/data");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;

const answer = async () => ({ ok: true }) as never;
const actions = {
  saveStep: answer,
  reveal: answer,
  sendBankCode: answer,
  confirmBank: answer,
  handInForm101: answer,
  submit: answer,
  saveProfile: answer,
};

const STATES = [
  "stopped",
  "new",
  "minor",
  "warning",
  "code",
  "hold",
  "saved",
  "done",
] as const;
const VIEWS = [
  null,
  "start",
  "identity",
  "address",
  "bank",
  "pension",
  "form101",
  "done",
] as const;

function draw(
  state: (typeof STATES)[number],
  lang: "he" | "en",
  view: (typeof VIEWS)[number],
  missing: string[],
): string {
  const { data, preset } = fileScreenDemo(state, lang);
  return drawData(data, lang, view, missing, preset);
}

type Data = ReturnType<typeof fileScreenDemo>["data"];

function drawData(
  data: Data,
  lang: "he" | "en",
  view: (typeof VIEWS)[number],
  missing: string[],
  preset?: ReturnType<typeof fileScreenDemo>["preset"],
): string {
  // The provider's props as JSX gives them: its children come third.
  const provider = {
    locale: lang,
    timeZone: "Asia/Jerusalem",
    messages: lang === "en" ? fileMessages(en as typeof he) : he,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(FileFlow, {
        data,
        view,
        actions,
        base: "",
        profileHref: "/me",
        preset,
      }),
    ),
  );
}

describe("the file's flow, drawn", () => {
  it("draws every state at every step in both languages, every word there", () => {
    const missing: string[] = [];
    for (const lang of ["he", "en"] as const) {
      for (const state of STATES) {
        for (const view of VIEWS) {
          expect(draw(state, lang, view, missing)).toContain("<main");
        }
      }
    }
    expect(missing).toEqual([]);
    // A hundred-odd pages: seconds, when the run is busy.
  }, 60_000);

  it("opens a new file on its welcome, and a part-filled one where it stopped", () => {
    const missing: string[] = [];
    const welcome = draw("new", "he", null, missing);
    expect(welcome).toContain(
      he.app.file.welcome.title.replace("{business}", "מסעדת הדגמה"),
    );
    const stopped = draw("stopped", "he", null, missing);
    expect(stopped).toContain("צעד 4 מתוך 6");
    expect(stopped).not.toContain(
      he.app.file.welcome.title.replace("{business}", "מסעדת הדגמה"),
    );
  });

  it("shows the saved numbers as their last digits only", () => {
    const missing: string[] = [];
    const saved = draw("saved", "he", "bank", missing);
    expect(saved).toContain("•••0001");
    expect(saved).toContain("•••0018");
    expect(saved).not.toContain("100001");
    expect(saved).not.toContain("000000018");
  });
});

const heT = createTranslator({ locale: "he", messages: he });

/** The disabled attribute, not the classes that style it. */
const DISABLED = /\sdisabled(=""|[\s>])/;

/** The step's main action in the dock: the button that sends its form from outside it. */
const dockButtons = (html: string) =>
  html.match(/<button[^>]*\sform="[^"]+"[^>]*>/g) ?? [];

describe("a step with everything filled in", () => {
  it("can be pressed, and says a field too long under it, though it can't save", () => {
    const { data } = fileScreenDemo("stopped", "he");
    const missing: string[] = [];
    const html = drawData(
      {
        ...data,
        // As if typed: an old five-digit zip and an apartment past its ten.
        address: {
          kind: "street",
          cityCode: 5000,
          street: "הרצל",
          number: "12",
          apartment: "12345678901",
          zip: "61000",
        },
      },
      "he",
      "address",
      missing,
    );
    expect(missing).toEqual([]);
    expect(html).toContain(
      he.app.file.tooLong
        .replace("<ltr>", '<span dir="ltr">')
        .replace("{max}", "10")
        .replace("</ltr>", "</span>"),
    );
    expect(html).not.toContain(heT("app.file.missingRequired", { count: 1 }));
    const dock = dockButtons(html);
    expect(dock).toHaveLength(1);
    expect(dock[0]).not.toMatch(DISABLED);
  });

  it("doesn't count a birth date typed in full as missing", () => {
    const { data } = fileScreenDemo("stopped", "he");
    if (!data.file) throw new Error("a file");
    const missing: string[] = [];
    const html = drawData(
      // As if typed "1/1/95": every part there, the year short.
      { ...data, file: { ...data.file, birth_date: "95-01-01" } },
      "he",
      "identity",
      missing,
    );
    expect(missing).toEqual([]);
    expect(html).not.toContain(heT("app.file.missingRequired", { count: 1 }));
    const dock = dockButtons(html);
    expect(dock).toHaveLength(1);
    expect(dock[0]).not.toMatch(DISABLED);
  });
});

const business = "מסעדת הדגמה";
const f = he.app.file;

/** A button's opening tag, by the words it holds. */
const buttonWith = (html: string, words: string) =>
  (
    html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []
  ).filter((button) => button.includes(words));

describe("sending the file", () => {
  it("leads to the first detail still open instead, with words that name it", () => {
    const missing: string[] = [];
    // Stopped at the account: the 101's dock and the summary lead there.
    const html = draw("stopped", "he", "form101", missing);
    expect(missing).toEqual([]);
    expect(html).not.toContain(heT("app.file.actions.send", { business }));
    // The dock's main action and the desktop's summary.
    expect(buttonWith(html, f.actions.finish.bank)).toHaveLength(2);
    expect(html).toContain(f.actions.sendWaits);
  });

  it("goes once the details are in, though Form 101 is still on paper", () => {
    const { data } = fileScreenDemo("saved", "he");
    const missing: string[] = [];
    const html = drawData(
      {
        ...data,
        missing: [],
        file: data.file && { ...data.file, pension_answer: "employer" },
      },
      "he",
      "form101",
      missing,
    );
    expect(missing).toEqual([]);
    expect(
      buttonWith(html, heT("app.file.actions.send", { business })),
    ).toHaveLength(2);
    expect(html).not.toContain(f.actions.sendWaits);
  });

  it("gives a new file's welcome on a desktop its own way in, and the summary's stays quiet", () => {
    const missing: string[] = [];
    const html = draw("new", "he", null, missing);
    // The dock's (a phone's and a tablet's) and the hero's (a desktop's).
    expect(buttonWith(html, f.welcome.start)).toHaveLength(2);
    const summary = buttonWith(html, f.actions.finish.identity);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toContain(QUIET);
    expect(summary[0]).not.toContain(ACCENT);
    expect(html).not.toContain(heT("app.file.actions.send", { business }));
  });
});

/** A button's look: the accent (the screen's main action) or the quiet one. */
const ACCENT = "bg-accent text-accent-ink";
const QUIET = "bg-surface-2 text-ink";

// On a desktop the step that keeps the file back may be the one on screen
// already (Noa's twin stops at the account): the summary's main action is
// then that step's own, under its words, never a way to where the person is
// (H5a's check of the second review).
describe("the summary's main action, with the open step on screen", () => {
  it("sends the account's own form, in the accent", () => {
    const missing: string[] = [];
    const html = draw("stopped", "he", null, missing);
    expect(missing).toEqual([]);
    expect(html).not.toContain(f.actions.finish.bank);
    const own = buttonWith(html, f.bank.confirm).filter((button) =>
      button.includes(ACCENT),
    );
    // The summary's and the dock's, each sending the step's form.
    expect(own.length).toBeGreaterThan(0);
    const summary = own.filter((button) => button.includes('type="submit"'));
    expect(summary.length).toBeGreaterThan(0);
    for (const button of summary) {
      expect(button).toContain('form="file-bank-form"');
      expect(button).not.toMatch(DISABLED);
    }
    // The form it sends is there.
    expect(html).toContain('<form id="file-bank-form"');
    // The step's own quiet save stays in its section.
    expect(
      buttonWith(html, f.bank.confirm).some((button) => button.includes(QUIET)),
    ).toBe(true);
  });

  it("saves a new file's details, the welcome's way in gone from the step", () => {
    const missing: string[] = [];
    const html = draw("new", "he", "identity", missing);
    expect(missing).toEqual([]);
    expect(buttonWith(html, f.welcome.start)).toHaveLength(0);
    const own = buttonWith(html, f.actions.saveIdentity).filter((button) =>
      button.includes('form="file-identity-form"'),
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toContain(ACCENT);
    expect(html).toContain('<form id="file-identity-form"');
    expect(html).not.toContain(f.actions.finish.identity);
  });

  it("saves the pension's answer", () => {
    const missing: string[] = [];
    const html = draw("saved", "he", "pension", missing);
    expect(missing).toEqual([]);
    const own = buttonWith(html, f.actions.savePension).filter((button) =>
      button.includes('form="file-pension-form"'),
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toContain(ACCENT);
  });

  it("goes to the code's boxes while they are up, and waits with the hold", () => {
    const missing: string[] = [];
    const code = draw("code", "he", "bank", missing);
    const asked = buttonWith(code, f.bank.confirm).filter((button) =>
      button.includes('form="file-bank-form"'),
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(DISABLED);
    const held = draw("hold", "he", "bank", missing);
    const waiting = buttonWith(held, f.bank.confirm).filter((button) =>
      button.includes('form="file-bank-form"'),
    );
    expect(waiting.length).toBeGreaterThan(0);
    for (const button of waiting) expect(button).toMatch(DISABLED);
    // Said under it, as beside the step's own: in the section, the dock and
    // the summary.
    const words = heT("app.file.bank.phoneHold", { date: "27 בנובמבר 2026" });
    expect(held.split(words).length - 1).toBe(3);
    expect(missing).toEqual([]);
  });

  it("goes on once the account on screen is in", () => {
    const { data } = fileScreenDemo("stopped", "he");
    if (!data.file) throw new Error("a file");
    const missing: string[] = [];
    // The account shown saved while the file still counts it open.
    const html = drawData(
      {
        ...data,
        file: { ...data.file, has: { ...data.file.has, bank_account: true } },
      },
      "he",
      "bank",
      missing,
    );
    expect(missing).toEqual([]);
    const own = buttonWith(html, f.actions.continue).filter((button) =>
      button.includes(ACCENT),
    );
    expect(own.length).toBeGreaterThan(0);
    for (const button of own) expect(button).not.toContain("form=");
    expect(html).not.toContain(f.actions.finish.bank);
  });

  it("leads to the open step from another", () => {
    const missing: string[] = [];
    const html = draw("stopped", "he", "pension", missing);
    expect(missing).toEqual([]);
    const toBank = buttonWith(html, f.actions.finish.bank);
    expect(toBank).toHaveLength(1);
    expect(toBank[0]).toContain(ACCENT);
    expect(toBank[0]).not.toContain("form=");
  });
});

describe("the done screen", () => {
  it("says 'סיימת' only with nothing open, and leads back to the profile", () => {
    const missing: string[] = [];
    const html = draw("done", "he", "done", missing);
    expect(missing).toEqual([]);
    expect(html).toContain(`>${f.done.title}</h2>`);
    // The screen's main action: in the dock, and inline on a desktop.
    expect(buttonWith(html, f.done.profile)).toHaveLength(2);
  });

  it("says how many steps are left otherwise, and leads to the first", () => {
    const missing: string[] = [];
    const html = draw("stopped", "he", "done", missing);
    expect(missing).toEqual([]);
    expect(html).not.toContain(`>${f.done.title}</h2>`);
    expect(html).toContain(heT("app.file.done.titleLeft", { count: 3 }));
    expect(buttonWith(html, f.actions.finish.bank)).toHaveLength(2);
  });
});

describe("a step's title", () => {
  it("can take the focus, where a keyboard goes on from", () => {
    const missing: string[] = [];
    const html = draw("stopped", "he", "bank", missing);
    for (const step of ["start", "identity", "address", "bank"]) {
      expect(html).toMatch(
        new RegExp(`<h2 id="file-${step}-title" tabindex="-1"`),
      );
    }
  });
});

describe("a desktop's every step at once", () => {
  it("says 'אמשיך אחר כך' and 'למה מבקשים את זה' on a phone and a tablet only", () => {
    const missing: string[] = [];
    const html = draw("stopped", "he", "bank", missing);
    const later = html.match(
      new RegExp(`<a [^>]*>${f.actions.later}</a>`, "g"),
    );
    expect(later?.length).toBeGreaterThan(0);
    for (const link of later ?? []) expect(link).toContain("xl:hidden");
    // Each step's own, in the wrapper that hides it on a desktop.
    const why = html.match(
      new RegExp(
        `<div class="[^"]*"><button[^>]*>(?:(?!</button>)[\\s\\S])*${f.why}</button></div>`,
        "g",
      ),
    );
    expect(why?.length).toBeGreaterThan(0);
    for (const wrap of why ?? []) {
      expect(wrap).toMatch(/^<div class="[^"]*xl:hidden/);
    }
  });
});

describe("the bank step", () => {
  it("says above its action when only the check's warning is in the way, and can be pressed", () => {
    const missing: string[] = [];
    const html = draw("warning", "he", "bank", missing);
    expect(missing).toEqual([]);
    expect(html).toContain(
      heT("app.file.bank.checkFirst", { keep: f.bank.keep }).replace(
        /"/g,
        "&quot;",
      ),
    );
    // The dock's and, on a desktop, the summary's: both send the step's form.
    const sending = dockButtons(html);
    expect(sending).toHaveLength(2);
    for (const button of sending) {
      expect(button).toContain('form="file-bank-form"');
      expect(button).not.toMatch(DISABLED);
    }
    // A desktop's own action is never pressed in vain without words.
    for (const button of buttonWith(html, f.bank.confirm)) {
      expect(button).not.toMatch(DISABLED);
    }
  });

  it("holds the code in the week after a phone change, and says the day", () => {
    const missing: string[] = [];
    const html = draw("hold", "he", "bank", missing);
    expect(missing).toEqual([]);
    expect(html).toContain("27 בנובמבר 2026");
    expect(html).toContain(f.bank.phoneHold.split("{date}")[0] ?? "");
    for (const button of buttonWith(html, f.bank.confirm)) {
      expect(button).toMatch(DISABLED);
    }
  });

  it("offers the saved account back while a new one is typed", () => {
    const { data } = fileScreenDemo("saved", "he");
    const missing: string[] = [];
    const html = drawData(data, "he", "bank", missing, {
      bank: {
        value: { bank: null, branch: "", account: "", kept: false },
        holder: "self",
        instruction: false,
        phase: "edit",
      },
    });
    expect(missing).toEqual([]);
    expect(buttonWith(html, f.bank.keepCurrent)).toHaveLength(1);
    // Not for a file with no account yet.
    expect(draw("warning", "he", "bank", missing)).not.toContain(
      f.bank.keepCurrent,
    );
  });
});

type Hold = Parameters<typeof bankHeld>[0];

/** The hold's words, as the step and the summary say them, on Noa's twin. */
function HoldWords({ hold }: { hold: Hold }) {
  const t = useTranslations("app.file");
  const { data } = fileScreenDemo("stopped", "he");
  return createElement("p", null, useHoldWords({ t, data } as Kit, hold));
}

// The week after a phone change as the server says it before a code goes:
// its day and the moment it opens. Held while that day hasn't passed, so a
// week ending later today keeps the code's action back (the timer lets it
// go at the moment), and said by its time, never as "from today".
describe("the week after a phone change, on the screen", () => {
  const today = fileScreenDemo("stopped", "he").data.today;

  it("holds through the day it opens, never after", () => {
    expect(bankHeld({ day: today, at: null }, today)).toBe(true);
    expect(bankHeld({ day: today, at: `${today}T12:05:00Z` }, today)).toBe(
      true,
    );
    expect(bankHeld({ day: "2026-11-27", at: null }, today)).toBe(true);
    expect(bankHeld({ day: "2026-11-23", at: null }, today)).toBe(false);
    expect(bankHeld(null, today)).toBe(false);
  });

  function wordsOf(hold: Hold): string {
    const missing: string[] = [];
    const html = renderToString(
      createElement(
        NextIntlClientProvider,
        {
          locale: "he",
          timeZone: "Asia/Jerusalem",
          messages: he,
          onError: (error: Error) => {
            missing.push(error.message);
          },
        } as unknown as Parameters<typeof NextIntlClientProvider>[0],
        createElement(HoldWords, { hold }),
      ),
    );
    expect(missing).toEqual([]);
    return html;
  }

  it("says a week ending later today by its time, in the business's zone", () => {
    expect(wordsOf({ day: today, at: `${today}T12:05:00Z` })).toBe(
      `<p>${he.app.file.bank.phoneHoldToday
        .replace("<ltr>", '<span dir="ltr">')
        .replace("{time}", "14:05")
        .replace("</ltr>", "</span>")}</p>`,
    );
    expect(wordsOf({ day: "2026-11-27", at: "2026-11-27T08:00:00Z" })).toBe(
      `<p>${heT("app.file.bank.phoneHold", { date: "27 בנובמבר 2026" })}</p>`,
    );
    expect(wordsOf({ day: today, at: null })).toBe(
      `<p>${heT("app.file.bank.phoneHold", { date: "24 בנובמבר 2026" })}</p>`,
    );
    expect(wordsOf(null)).toBe("<p></p>");
  });
});

describe("a step handed in directly", () => {
  it("says it once to a screen reader: done, and how, under its name", () => {
    const { data } = fileScreenDemo("stopped", "he");
    if (!data.file) throw new Error("a file");
    const missing: string[] = [];
    const html = drawData(
      {
        ...data,
        file: { ...data.file, direct_groups: ["pension"] },
        missing: ["bank"],
      },
      "he",
      "bank",
      missing,
    );
    expect(missing).toEqual([]);
    // One list of steps on screen, so the words once.
    expect(html.split(he.app.file.steps.state.direct)).toHaveLength(2);
  });
});

describe("the file's frame", () => {
  it("is the same in either language, so switching keeps what was typed", () => {
    for (const lang of ["he", "en"] as const) {
      const { data } = fileScreenDemo("stopped", lang);
      const frame = FileView({
        data,
        view: "identity",
        actions,
      }) as ReactElement<{
        english: boolean;
        children: ReactElement;
      }>;
      expect(frame.type).toBe(FileFrame);
      expect(frame.props.english).toBe(lang === "en");
      expect(frame.props.children.type).toBe(FileFlow);
    }
  });

  it("draws in Hebrew with the page's words, and in English with its own", () => {
    for (const lang of ["he", "en"] as const) {
      const { data } = fileScreenDemo("stopped", lang);
      const missing: string[] = [];
      const html = renderToString(
        createElement(
          NextIntlClientProvider,
          {
            locale: "he",
            timeZone: "Asia/Jerusalem",
            messages: he,
            onError: (error: Error) => {
              missing.push(error.message);
            },
          } as unknown as Parameters<typeof NextIntlClientProvider>[0],
          FileView({ data, view: "identity", actions }),
        ),
      );
      expect(missing).toEqual([]);
      expect(html).toContain(
        (lang === "en" ? en : he).app.file.steps.name.identity,
      );
      expect(html.includes('dir="ltr" lang="en"')).toBe(lang === "en");
    }
  });
});
