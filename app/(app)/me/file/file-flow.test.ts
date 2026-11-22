import { createElement } from "react";
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

const { NextIntlClientProvider } = await import("next-intl");
const { FileFlow } = await import("./file-flow");
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
