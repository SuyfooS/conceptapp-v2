import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { FileFlow } = await import("./file-flow");
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
      he.app.file.address.tooLong
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
