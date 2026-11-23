import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Real sign-in at /sign-in, drawn on the server as its page first is, with
// its action stood in for: the way to the demo shows only where this site's
// demo door is open (DEMO_DOOR unset or on). Where it is closed, the site of
// real businesses, the same screen with nothing in its place. The "אני לא
// רובוט" check is drawn with this site's key, Cloudflare's always-passing
// test key where none is set, and a key of another shape fails the page.

vi.mock("server-only", () => ({}));
vi.mock("../actions", () => ({ signIn: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider } = await import("next-intl");
const { default: SignInPage } = await import("./page");
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
      createElement(SignInPage) as ReactElement,
    ),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/sign-in", () => {
  it("offers the demo where the demo door is open", () => {
    for (const setting of [undefined, "on"]) {
      if (setting) vi.stubEnv("DEMO_DOOR", setting);
      const html = draw();
      expect(html).toContain(he.auth.signIn.send);
      expect(html).toContain(he.auth.signIn.demo);
      expect(html).toContain('href="/enter"');
    }
  });

  it("draws the check with this site's key, the test key where none is set", () => {
    const unset = draw();
    expect(unset).toContain('data-sitekey="1x00000000000000000000AA"');
    expect(unset).toContain('data-captcha="loading"');
    expect(unset).toContain('name="captcha"');
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "3x00000000000000000000FF");
    expect(draw()).toContain('data-sitekey="3x00000000000000000000FF"');
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "not a key");
    expect(() => draw()).toThrow(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it("offers no way to the demo where it is closed", () => {
    vi.stubEnv("DEMO_DOOR", "off");
    const html = draw();
    expect(html).toContain(he.auth.signIn.title);
    expect(html).toContain(he.auth.signIn.send);
    expect(html).not.toContain(he.auth.signIn.demo);
    expect(html).not.toContain('href="/enter"');
  });
});
