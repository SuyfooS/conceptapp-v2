import { BANK_INSTRUCTION_VERSION } from "@domain/employee-file";
import {
  fileStepStates,
  nextFileStep,
  previousFileStep,
  type SENT_WITH,
} from "@domain/employee-file-steps";
import { formArg } from "@domain/profile";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { fileStepInputOf } from "./file-parts";
import type { Kit } from "./flow-kit";
import type { BankScreen, BankScreenState } from "./steps/bank-step";

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
const { FileFlow, SummaryFoot } = await import("./file-flow");
const { BankStep, bankHeld, bankMoves, bankToSend, useHoldWords } =
  await import("./steps/bank-step");
const { FileFrame } = await import("./file-frame");
const { FileView, fileViewOf } = await import("./file-view");
const { NoticeBody } = await import("./notice-sheet");
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
  disputeBankChange: answer,
};

const STATES = [
  "stopped",
  "new",
  "minor",
  "warning",
  "code",
  "hold",
  "saved",
  "ready",
  "done",
  "later",
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
        captcha: { demo: "ready" },
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

/** A message's words as the page draws them: each <ltr> a left-to-right span. */
const drawn = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    message
      .replaceAll("<ltr>", '<span dir="ltr">')
      .replaceAll("</ltr>", "</span>"),
  );

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

  it("offers nothing while the code's boxes are up, as the dock doesn't, and waits with the hold", () => {
    const missing: string[] = [];
    const code = draw("code", "he", "bank", missing);
    // The code confirms itself once its boxes fill: no press named for a
    // confirmation that only moves the focus, in the summary or the dock,
    // and no way to where the person is.
    expect(dockButtons(code)).toHaveLength(0);
    expect(buttonWith(code, f.bank.confirm)).toHaveLength(0);
    expect(code).not.toContain(f.actions.finish.bank);
    // Why the file waits is still said, and the code's own buttons stay.
    expect(code).toContain(f.actions.sendWaits);
    expect(buttonWith(code, f.bank.code.resend)).toHaveLength(1);
    expect(buttonWith(code, f.bank.code.edit)).toHaveLength(1);
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

/** A last day to choose a fund before the twin's day (24 November 2026): passed. */
const PASSED_DAY = "2026-11-23";

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

  it("leads to the pension once sent with a fund chosen 'later' still to choose", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("later", "he");
    expect(data.missing).toEqual(["pension"]);
    // No step is open, so the flow opens here by itself.
    const html = drawData(data, "he", null, missing);
    expect(missing).toEqual([]);
    expect(html).not.toContain(`>${f.done.title}</h2>`);
    expect(html).toContain(`>${f.done.titlePension}</h2>`);
    expect(html).toContain(
      heT("app.file.pension.dueOn", { date: "24 בדצמבר 2026", business }),
    );
    // The screen's main action: in the dock, and inline on a desktop.
    expect(buttonWith(html, f.actions.choosePension)).toHaveLength(2);
    expect(buttonWith(html, f.done.profile)).toHaveLength(0);
  });

  // H5b's last check: with the day passed, the database still counts the
  // pension missing and Today still asks, so the done screen does too.
  it("leads to the pension all the same once the day to choose passed", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("later", "he");
    const passed: Data = { ...data, pensionDueOn: PASSED_DAY };
    const html = drawData(passed, "he", null, missing);
    expect(missing).toEqual([]);
    expect(html).not.toContain(`>${f.done.title}</h2>`);
    expect(html).toContain(`>${f.done.titlePension}</h2>`);
    expect(html).toContain(heT("app.file.pension.duePassed", { business }));
    expect(buttonWith(html, f.actions.choosePension)).toHaveLength(2);
    expect(buttonWith(html, f.done.profile)).toHaveLength(0);
  });

  it("still sends first when the file isn't sent, a fund chosen 'later' or not", () => {
    const { data } = fileScreenDemo("later", "he", { form101: "off" });
    // By its day, and with the day passed: never "סיימת" nor "הכול מוכן".
    for (const [pensionDueOn, line] of [
      [
        "2026-12-24",
        heT("app.file.pension.dueOn", { date: "24 בדצמבר 2026", business }),
      ],
      [PASSED_DAY, heT("app.file.pension.duePassed", { business })],
    ] as const) {
      const missing: string[] = [];
      const unsent: Data = {
        ...data,
        pensionDueOn,
        file: data.file ? { ...data.file, submitted_at: null } : null,
      };
      const html = drawData(unsent, "he", "done", missing);
      expect(missing).toEqual([]);
      expect(html).toContain(`>${f.done.titlePension}</h2>`);
      expect(html).not.toContain(`>${f.done.title}</h2>`);
      expect(html).toContain(heT("app.file.done.readyPension", { business }));
      expect(html).not.toContain(heT("app.file.done.ready", { business }));
      expect(html).toContain(line);
      expect(
        buttonWith(html, heT("app.file.actions.send", { business })),
      ).toHaveLength(2);
      expect(buttonWith(html, f.actions.choosePension)).toHaveLength(0);
    }
  });

  it("says the fund left beside a step still open, its day passed too", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("later", "he");
    const html = drawData(
      { ...data, pensionDueOn: PASSED_DAY, missing: ["bank", "pension"] },
      "he",
      "done",
      missing,
    );
    expect(missing).toEqual([]);
    // The account's step is open again: the pension isn't the title.
    expect(html).toContain(heT("app.file.done.titleLeft", { count: 1 }));
    expect(html).toContain(
      heT("app.file.done.left", { what: f.done.leftPensionPassed }),
    );
  });
});

describe("the pension's row, a fund chosen 'later'", () => {
  /** The steps' rows that lead to the pension: their marks and their words. */
  const pensionRows = (html: string) =>
    html.match(
      /<a href="\/me\/file\?step=pension"[^>]*>(?:(?!<\/a>)[\s\S])*<\/a>/g,
    ) ?? [];

  it("says by when a fund is still to choose, though the step is behind her", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("later", "he");
    const left = heT("app.file.done.leftPension", { date: "24 בדצמבר 2026" });
    // On the done screen's list, and beside the step on a tablet and a desktop.
    for (const view of ["done", "pension"] as const) {
      const html = drawData(data, "he", view, missing);
      const rows = pensionRows(html);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain(`text-sm">${left}</span>`);
      // Still marked done, and counted: the file goes with it.
      expect(rows[0]).toContain("bg-success-soft");
      expect(rows[0]).toContain(f.steps.state.done);
      expect(html).toContain(heT("app.file.progress", { done: 6, count: 6 }));
    }
    expect(missing).toEqual([]);
  });

  it("says the day passed once it did, a fund still to choose", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("later", "he");
    const passed: Data = { ...data, pensionDueOn: PASSED_DAY };
    for (const view of ["done", "pension"] as const) {
      const html = drawData(passed, "he", view, missing);
      const rows = pensionRows(html);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain(`text-sm">${f.done.leftPensionPassed}</span>`);
      expect(rows[0]).toContain("bg-success-soft");
    }
    expect(missing).toEqual([]);
  });

  it("is still missing in a desktop's summary, by its day or with it passed", () => {
    const { data } = fileScreenDemo("later", "he");
    for (const [pensionDueOn, line] of [
      [
        "2026-12-24",
        heT("app.file.pension.dueOn", { date: "24 בדצמבר 2026", business }),
      ],
      [PASSED_DAY, heT("app.file.pension.duePassed", { business })],
    ] as const) {
      const missing: string[] = [];
      const html = drawData(
        { ...data, pensionDueOn },
        "he",
        "pension",
        missing,
      );
      expect(missing).toEqual([]);
      expect(html).not.toContain(f.summary.none);
      expect(html).toContain(`<li>${f.steps.name.pension}</li>`);
      expect(html).toContain(`<p class="text-ink-2 text-sm">${line}</p>`);
    }
  });

  it("says nothing more once a fund is chosen", () => {
    const missing: string[] = [];
    const html = draw("done", "he", "done", missing);
    expect(missing).toEqual([]);
    const rows = pensionRows(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toContain(f.done.leftPension.split("{")[0] ?? "");
  });
});

describe("the progress line", () => {
  it("counts an optional step only once something of it is in", () => {
    const missing: string[] = [];
    const setup = { ask: "contact", form101: "off" } as const;
    const fresh = fileScreenDemo("new", "he", setup).data;
    expect(fresh.steps).toEqual(["start", "identity", "address", "pension"]);
    const welcome = drawData(fresh, "he", null, missing);
    // Nothing done yet, though step 2's row says "לא חובה".
    expect(welcome).toContain(heT("app.file.progress", { done: 0, count: 4 }));
    expect(welcome).toContain(heT("app.file.welcome.body", { count: 4 }));
    const done = drawData(
      fileScreenDemo("done", "he", setup).data,
      "he",
      "done",
      missing,
    );
    expect(done).toContain(heT("app.file.progress", { done: 4, count: 4 }));
    expect(missing).toEqual([]);
  });
});

describe("the account's change, in the bank step", () => {
  const changedOn = new Intl.DateTimeFormat("he", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date("2026-11-24T12:00:00Z"));

  it("offers 'לא שיניתי' under the saved account while the change is told", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("saved", "he");
    expect(data.bankChange).toEqual({
      on: "2026-11-24",
      disputed: false,
      seen: null,
    });
    const html = drawData(data, "he", "bank", missing);
    expect(missing).toEqual([]);
    expect(html).toContain(heT("app.file.bank.changed", { date: changedOn }));
    const dispute = buttonWith(html, f.bank.dispute);
    expect(dispute).toHaveLength(1);
    // A quiet one: the step's main action stays the dock's, in the accent.
    expect(dispute[0]).not.toContain("bg-accent");
  });

  it("says what follows once disputed, with nothing more to press", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("saved", "he");
    const html = drawData(
      { ...data, bankChange: { on: "2026-11-24", disputed: true, seen: null } },
      "he",
      "bank",
      missing,
    );
    expect(missing).toEqual([]);
    expect(html).toContain(heT("app.file.bank.disputed", { business }));
    expect(buttonWith(html, f.bank.dispute)).toHaveLength(0);
  });

  it("says nothing once the change is no longer told", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("saved", "he");
    const html = drawData({ ...data, bankChange: null }, "he", "bank", missing);
    expect(html).not.toContain(f.bank.changed.split("{")[0] ?? "");
    expect(buttonWith(html, f.bank.dispute)).toHaveLength(0);
  });

  it("isn't asked of a change made on this device, and still is of one said seen on Today", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("saved", "he");
    const told = data.bankChange;
    if (!told) throw new Error("a change told");
    const as = (bankChange: NonNullable<Data["bankChange"]>) =>
      drawData({ ...data, bankChange }, "he", "bank", missing);
    const made = as({ ...told, seen: "made" });
    expect(made).not.toContain(f.bank.changed.split("{")[0] ?? "");
    expect(buttonWith(made, f.bank.dispute)).toHaveLength(0);
    // "אני שיניתי" on Today hid the card here: the step keeps the way.
    expect(
      buttonWith(as({ ...told, seen: "said" }), f.bank.dispute),
    ).toHaveLength(1);
    // Marked since, on another device: it says so, with nothing to press.
    const marked = as({ ...told, seen: "made", disputed: true });
    expect(marked).toContain(heT("app.file.bank.disputed", { business }));
    expect(buttonWith(marked, f.bank.dispute)).toHaveLength(0);
    expect(missing).toEqual([]);
  });

  // H5b's last check: "לא שיניתי" came back under the person's own account
  // once "החלפת החשבון" let go of the one confirmed and "השארת החשבון
  // הנוכחי" brought the saved one back.
  it("isn't asked under the person's own change, through 'החלפת החשבון' and back", () => {
    // The server's answer, after the code, tells this very change.
    const { data } = fileScreenDemo("saved", "he");
    let state: BankScreenState = screenOf({ phase: "code" });
    const press = (move: Partial<BankScreenState>) => {
      state = { ...state, ...move };
      return drawHe(
        createElement(Bank, { data, screen: { ...state, set: () => {} } }),
      );
    };
    const changed = f.bank.changed.split("{")[0] ?? "";
    const confirmed = press(
      bankMoves.confirmed("new", { bank: 12, branch: 600, masked: "•••0002" }),
    );
    expect(state.phase).toBe("saved");
    expect(confirmed).not.toContain(changed);
    expect(buttonWith(confirmed, f.bank.dispute)).toHaveLength(0);
    // "החלפת החשבון": a new account to type, the one confirmed let go.
    const changing = press(bankMoves.change());
    expect(state.confirmed).toBeNull();
    expect(changing).toContain('id="file-bank-form"');
    // "השארת החשבון הנוכחי": the saved account again, and still not asked.
    const kept = press(bankMoves.keep());
    expect(state.phase).toBe("saved");
    expect(buttonWith(kept, f.bank.change)).toHaveLength(1);
    expect(kept).not.toContain(changed);
    expect(buttonWith(kept, f.bank.dispute)).toHaveLength(0);
    // The same account on a screen that made no change: asked.
    const fresh = drawHe(
      createElement(Bank, { data, screen: screenOf({ phase: "saved" }) }),
    );
    expect(buttonWith(fresh, f.bank.dispute)).toHaveLength(1);
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

  const wordsOf = (hold: Hold) => drawHe(createElement(HoldWords, { hold }));

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

/** Drawn in Hebrew with the app's words, not one of them missing. */
function drawHe(element: ReactElement): string {
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
      element,
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

/** The flow's kit on Noa's twin, with the steps' saves on their way as given. */
function useKit(data: Data, busy: Kit["busy"] = {}): Kit {
  const t = useTranslations("app.file");
  return {
    data,
    states: fileStepStates(fileStepInputOf(data)),
    steps: data.steps,
    next: (from) => nextFileStep(from, data.steps) ?? "done",
    previous: (from) => previousFileStep(from, data.steps),
    stepName: (of) => t(`steps.name.${of}`),
    actions,
    t,
    go: () => {},
    showLocale: () => {},
    profileHref: "/me",
    say: () => {},
    openNotice: () => {},
    form: formArg(data.addressForm),
    busy,
    setBusy: () => {},
    captcha: { demo: "ready" },
  };
}

/**
 * The account's screen as the flow keeps it, nothing else holding it: the
 * twin's account typed (Hapoalim, branch 600), its code to the number
 * ending 0003.
 */
function screenOf(over: Partial<BankScreenState>): BankScreen {
  const typed = fileScreenDemo("code", "he").preset?.bank;
  if (!typed) throw new Error("an account typed");
  return {
    phase: "edit",
    typed: {
      value: typed.value,
      holder: typed.holder,
      holderName: "",
      instruction: typed.instruction,
    },
    tail: "0003",
    hold: null,
    confirmed: null,
    review: null,
    changedHere: false,
    set: () => {},
    ...over,
  };
}

/** The account's step on screen, drawn anew from what the flow kept. */
function Bank({ data, screen }: { data: Data; screen: BankScreen }) {
  return createElement(BankStep, { kit: useKit(data), active: true, screen });
}

/** A desktop's summary foot, with its open step on screen. */
function Foot({
  data,
  screen,
  step,
  busy,
}: {
  data: Data;
  screen: BankScreen;
  step: (typeof SENT_WITH)[number];
  busy: Kit["busy"];
}) {
  return createElement(SummaryFoot, {
    kit: useKit(data, busy),
    bank: screen,
    blocker: step,
    current: step,
    sending: false,
    sendWords: null,
    onSend: () => {},
  });
}

// The account's phase is the flow's, with everything it shows (H5a's last
// check): the done screen draws no step, so an account the step kept itself
// went there while the flow still held the code's boxes, which then sent no
// account and were refused as invalid.
describe("the account's code, left for the done screen and opened again", () => {
  it("shows the code's boxes over the account they confirm", () => {
    const missing: string[] = [];
    // The code asked for, then the done screen: no step is drawn under it.
    const done = draw("code", "he", "done", missing);
    expect(missing).toEqual([]);
    expect(done).toContain(heT("app.file.done.titleLeft", { count: 3 }));
    expect(done).not.toContain('id="file-bank-form"');
    expect(done).not.toContain(f.bank.code.label);
    // The account's step again, drawn anew from what the flow kept.
    const { data } = fileScreenDemo("stopped", "he");
    const screen = screenOf({ phase: "code" });
    const html = drawHe(createElement(Bank, { data, screen }));
    expect(html).toContain(f.bank.code.label);
    expect(html).toContain(
      f.bank.code.sent
        .replace("<ltr>", '<span dir="ltr">')
        .replace("{tail}", "0003")
        .replace("</ltr>", "</span>"),
    );
    const line =
      html.match(
        /<p class="font-medium text-md">(?:(?!<\/p>)[\s\S])*<\/p>/,
      )?.[0] ?? "";
    expect(line).toContain(he.banks["12"]);
    expect(line).toContain('<span dir="ltr">600</span>');
    // What the code confirms is that account, never an empty one.
    expect(bankToSend(screen.typed)).toEqual({
      bank: 12,
      branch: 600,
      account: "100002",
      holder: "self",
      instruction: BANK_INSTRUCTION_VERSION,
    });
  });
});

// On a desktop the summary's own action is the open step's, so its save on
// its way shows on it, as on the dock's, and it can't send it twice (H5a's
// last check). With the code's boxes up it offers nothing, as the dock.
describe("the summary's own action", () => {
  const { data } = fileScreenDemo("stopped", "he");

  it("shows its step's save on its way, and can't send it twice", () => {
    const screen = screenOf({});
    for (const [step, words] of [
      ["identity", f.actions.saveIdentity],
      ["address", f.actions.saveAddress],
      ["bank", f.bank.confirm],
      ["pension", f.actions.savePension],
    ] as const) {
      const idle = buttonWith(
        drawHe(createElement(Foot, { data, screen, step, busy: {} })),
        words,
      );
      expect(idle).toHaveLength(1);
      expect(idle[0]).toContain(`form="file-${step}-form"`);
      expect(idle[0]).not.toContain('aria-busy="true"');
      expect(idle[0]).not.toMatch(DISABLED);
      const busy: Kit["busy"] = {};
      busy[step] = true;
      const saving = buttonWith(
        drawHe(createElement(Foot, { data, screen, step, busy })),
        words,
      );
      expect(saving).toHaveLength(1);
      expect(saving[0]).toContain('aria-busy="true"');
      expect(saving[0]).toMatch(DISABLED);
      expect(saving[0]).toContain("animate-spin");
    }
  });

  it("offers nothing while the code's boxes are up, and says why the file waits", () => {
    for (const busy of [{}, { bank: true }] satisfies Kit["busy"][]) {
      const html = drawHe(
        createElement(Foot, {
          data,
          screen: screenOf({ phase: "code" }),
          step: "bank",
          busy,
        }),
      );
      expect(html).not.toContain("<button");
      expect(html).toBe(
        `<p class="px-1 text-ink-2 text-sm">${f.actions.sendWaits}</p>`,
      );
    }
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
        captcha: { demo: "ready" },
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
          FileView({
            data,
            view: "identity",
            actions,
            captcha: { demo: "ready" },
          }),
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

// What each business asks (H5b): the twin's ways, each drawn whole.
const SETUPS = [
  { ask: "lean", form101: "print" },
  { ask: "contact", form101: "print" },
  { ask: "all", form101: "link" },
  { ask: "all", form101: "off" },
  { ask: "contact", form101: "off" },
] as const;

describe("the file by the business's settings", () => {
  it("draws each way at every step on screen and done, in both languages, every word there", () => {
    const missing: string[] = [];
    for (const lang of ["he", "en"] as const) {
      for (const setup of SETUPS) {
        for (const state of ["stopped", "new", "ready", "done"] as const) {
          const { data } = fileScreenDemo(state, lang, setup);
          for (const view of [null, ...data.steps, "done"] as const) {
            expect(drawData(data, lang, view, missing)).toContain("<main");
          }
        }
      }
    }
    expect(missing).toEqual([]);
  }, 60_000);

  it("leaves out the address and the account when neither is asked", () => {
    const missing: string[] = [];
    const lean = fileScreenDemo("stopped", "he", { ask: "lean" }).data;
    expect(lean.steps).toEqual(["start", "identity", "pension", "form101"]);
    const html = drawData(lean, "he", null, missing);
    expect(missing).toEqual([]);
    expect(html).toContain(
      heT("app.file.steps.count", { current: 3, count: 4 }),
    );
    expect(html).not.toContain('id="file-bank"');
    expect(html).not.toContain('id="file-address"');
    const welcome = drawData(
      fileScreenDemo("new", "he", { ask: "lean" }).data,
      "he",
      null,
      missing,
    );
    expect(welcome).toContain(heT("app.file.welcome.body", { count: 4 }));
  });

  it("names step 2 by the ways to reach the person, optional until something is in", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("stopped", "he", { ask: "contact" });
    const html = drawData(data, "he", "address", missing);
    expect(missing).toEqual([]);
    expect(html).toMatch(
      new RegExp(
        `<h2 id="file-address-title"[^>]*>${f.steps.name.contact}</h2>`,
      ),
    );
    expect(html).toContain(f.address.emergencyTitle);
    expect(html).toContain(f.address.workLanguage);
    expect(html).not.toContain(f.address.city);
    // Its row: "לא חובה" beside the name, said once to a screen reader.
    expect(html).toMatch(
      new RegExp(
        `${f.steps.name.contact}<span class="sr-only"> · (<!-- -->)?${f.optional}</span>`,
      ),
    );
    expect(html).toMatch(
      new RegExp(`<span [^>]*aria-hidden="true"[^>]*>${f.optional}</span>`),
    );
    const done = drawData(
      fileScreenDemo("done", "he", { ask: "contact" }).data,
      "he",
      "address",
      missing,
    );
    // Hers, in: the contact's number as people write it.
    expect(done).toContain('value="050-000-0099"');
    expect(done).toMatch(
      new RegExp(
        `${f.steps.name.contact}<span class="sr-only"> · (<!-- -->)?${f.steps.state.done}</span>`,
      ),
    );
  });

  it("opens the approved system's link in a new window that knows nothing of this one", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("stopped", "he", { form101: "link" });
    const html = drawData(data, "he", "form101", missing);
    expect(missing).toEqual([]);
    const link = html.match(
      /<a [^>]*href="https:\/\/101\.example\/noa"[^>]*>/,
    )?.[0];
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(html).toContain(
      heT("app.file.form101.open", { provider: "משרד השכר" }),
    );
    expect(html).toContain(
      f.form101.opensAt
        .replace("<ltr>", '<span dir="ltr">')
        .replace("{domain}", "101.example")
        .replace("</ltr>", "</span>"),
    );
    expect(html).not.toContain(f.form101.handOver);
    // Its two actions as wide as each other: full width on a phone, inline
    // from a tablet up.
    const handedIn = buttonWith(html, f.form101.handedIn);
    expect(handedIn).toHaveLength(1);
    for (const action of [link, handedIn[0]]) {
      expect(action).toContain("w-full md:w-auto md:self-start");
    }
  });

  it("names a system with no name set by its site, left to right", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("stopped", "he", { form101: "link" });
    const unnamed: Data = {
      ...data,
      form101: {
        way: "link",
        link: "https://101.example/noa",
        domain: "101.example",
        provider: null,
      },
    };
    const html = drawData(unnamed, "he", "form101", missing);
    expect(missing).toEqual([]);
    // Inside Hebrew words a bare domain would read "example.101".
    expect(html).toContain(
      drawn(f.form101.openSite, { domain: "101.example" }),
    );
    expect(html).toContain(
      drawn(f.form101.linkBodySite, { business, domain: "101.example" }),
    );
    expect(html).not.toContain(f.form101.open.split("{")[0] ?? "");
    const notice = drawHe(
      createElement(NoticeBody, {
        business,
        names: data.notice,
        form101: unnamed.form101,
        emergency: false,
      }),
    );
    expect(notice).toContain(
      drawn(f.notice.form101Site, { business, domain: "101.example" }),
    );
  });

  it("says a part held but no longer asked can stay or change, in its step", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("ready", "he", { ask: "held" });
    // Neither is asked, both are in her file: both steps show, and nothing
    // of theirs is counted missing.
    expect(data.asks).toMatchObject({ address: false, bank: false });
    expect(data.parts).toMatchObject({ address: true, bank: true });
    expect(data.steps).toEqual([
      "start",
      "identity",
      "address",
      "bank",
      "pension",
      "form101",
    ]);
    expect(data.missing).toEqual([]);
    const address = drawData(data, "he", "address", missing);
    expect(address).toContain(heT("app.file.address.notAsked", { business }));
    // The town, no longer asked, can be emptied.
    expect(address).toContain(
      heT("app.file.optionalField", { field: f.address.city }),
    );
    const bank = drawData(data, "he", "bank", missing);
    expect(bank).toContain(heT("app.file.bank.notAsked", { business }));
    expect(buttonWith(bank, f.bank.change)).toHaveLength(1);
    expect(missing).toEqual([]);
    // Where the business asks, neither says so.
    const asked = fileScreenDemo("ready", "he").data;
    expect(drawData(asked, "he", "address", missing)).not.toContain(
      heT("app.file.address.notAsked", { business }),
    );
    expect(drawData(asked, "he", "bank", missing)).not.toContain(
      heT("app.file.bank.notAsked", { business }),
    );
  });

  it("sends from the done screen when Form 101 isn't taken in the app", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("ready", "he", { form101: "off" });
    expect(data.steps).not.toContain("form101");
    const html = drawData(data, "he", null, missing);
    expect(missing).toEqual([]);
    expect(html).not.toContain('id="file-form101"');
    expect(html).toContain(heT("app.file.done.ready", { business }));
    // The screen's main action: in the dock, and inline on a desktop.
    expect(
      buttonWith(html, heT("app.file.actions.send", { business })),
    ).toHaveLength(2);
    // Once sent, the way back to the profile.
    const sent = drawData(
      fileScreenDemo("done", "he", { form101: "off" }).data,
      "he",
      "done",
      missing,
    );
    expect(buttonWith(sent, f.done.profile)).toHaveLength(2);
  });

  it("opens a step the business doesn't ask where the person stopped", () => {
    const { data } = fileScreenDemo("stopped", "he", { ask: "lean" });
    expect(fileViewOf("bank", data.steps)).toBeNull();
    expect(fileViewOf("pension", data.steps)).toBe("pension");
    expect(fileViewOf("done", data.steps)).toBe("done");
  });
});

describe("the notice", () => {
  it("names who the business set, and leaves out what it didn't", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("stopped", "he", { form101: "link" });
    const named = drawHe(
      createElement(NoticeBody, {
        business,
        names: data.notice,
        form101: data.form101,
        emergency: false,
      }),
    );
    expect(named).toContain(
      heT("app.file.notice.employer", { employer: "מסעדת הדגמה בע״מ" }),
    );
    expect(named).toContain(
      heT("app.file.notice.whoProvider", {
        business,
        provider: "משרד רואי החשבון",
      }),
    );
    expect(named).toContain(
      heT("app.file.notice.form101Vendor", { business, provider: "משרד השכר" }),
    );
    expect(named).toContain('<span dir="ltr">03-123-4567</span>');
    const bare = drawHe(
      createElement(NoticeBody, {
        business,
        names: { payrollProvider: null, employer: null, phone: null },
        form101: { way: "print" },
        emergency: false,
      }),
    );
    expect(bare).toContain(heT("app.file.notice.who", { business }));
    expect(bare).toContain(heT("app.file.notice.rights", { business }));
    expect(bare).not.toContain(f.notice.employer.split("{")[0] ?? "");
    expect(bare).not.toContain(f.notice.emergency);
    expect(missing).toEqual([]);
  });

  it("says the managers see the emergency contact while the step asks for one, as the step does", () => {
    const missing: string[] = [];
    const { data } = fileScreenDemo("stopped", "he", { ask: "contact" });
    expect(data.parts.emergency).toBe(true);
    const notice = drawHe(
      createElement(NoticeBody, {
        business,
        names: data.notice,
        form101: data.form101,
        emergency: data.parts.emergency,
      }),
    );
    expect(notice).toContain(f.notice.emergency);
    // The flow's own note says it too, beside the steps on a desktop.
    const html = drawData(data, "he", "address", missing);
    expect(html).toContain(f.address.emergencyReason);
    expect(html).toContain(f.visibleEmergency);
    expect(html).not.toContain(`>${f.visible}<`);
    const plain = draw("stopped", "he", "address", missing);
    expect(plain).toContain(`>${f.visible}<`);
    expect(plain).not.toContain(f.visibleEmergency);
    expect(missing).toEqual([]);
  });
});
