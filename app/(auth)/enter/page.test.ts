import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The door at /enter, drawn on the server as its page first is, with its
// actions stood in for. Where the demo door is open (DEMO_DOOR unset or on)
// it offers every demo person, real sign-in and the reset; where it is
// closed (off), the site of real businesses, it draws nothing and sends on
// to real sign-in, as the proxy does before it.

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({ enterAs: vi.fn(), resetDemo: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider } = await import("next-intl");
const { default: EnterPage } = await import("./page");
const he = (await import("@/messages/he.json")).default;

/** The page as a request draws it, inside the app's provider, in Hebrew. */
function draw(): string {
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(EnterPage) as ReactElement,
    ),
  );
}

/** What drawing throws, or null when it draws. */
function thrown(): (Error & { digest?: string }) | null {
  try {
    draw();
    return null;
  } catch (error) {
    return error as Error & { digest?: string };
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/enter", () => {
  it("offers every demo person, real sign-in and the reset where the demo door is open", () => {
    for (const setting of [undefined, "on"]) {
      if (setting) vi.stubEnv("DEMO_DOOR", setting);
      const html = draw();
      for (const person of Object.values(he.auth.enter.people)) {
        expect(html, person.name).toContain(person.name);
      }
      expect(html).toContain(he.auth.enter.reset.open);
      expect(html).toContain('href="/sign-in"');
    }
  });

  it("draws nothing and sends on to real sign-in where it is closed", () => {
    vi.stubEnv("DEMO_DOOR", "off");
    const error = thrown();
    expect(error?.message).toBe("NEXT_REDIRECT");
    expect(error?.digest?.split(";")).toContain("/sign-in");
  });

  it("refuses a setting that is neither, naming it", () => {
    vi.stubEnv("DEMO_DOOR", "maybe");
    expect(thrown()?.message).toMatch(/DEMO_DOOR/);
  });
});
