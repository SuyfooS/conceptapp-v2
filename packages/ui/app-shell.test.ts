import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import type { AppShellProps } from "./app-shell";

/*
 * The tab bar (accessibility, part 1): shrunk while scrolling down, its
 * hidden tabs stay links a screen reader reaches, and a press on one goes
 * there; only the tab left in sight opens the bar. A tab's count is said
 * whatever the bar's size, in the plural the count asks for.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onNavigate: _onNavigate,
    ...props
  }: {
    children: ReactNode;
    href: string;
    onNavigate?: () => void;
  }) => createElement("a", { href, ...props }, children),
}));

const { AppShell, compactPress, tabShape } = await import("./app-shell");

describe("tabShape", () => {
  it("hides a tab only while the bar is shrunk, and never the current one or a lone one", () => {
    expect(tabShape({ compact: true, single: false, active: false })).toEqual({
      collapsed: true,
      tabbable: false,
      badge: false,
      saysCount: false,
      shown: false,
    });
    expect(
      tabShape({ compact: true, single: false, active: true }).collapsed,
    ).toBe(false);
    expect(
      tabShape({ compact: true, single: true, active: false }).collapsed,
    ).toBe(false);
    expect(
      tabShape({ compact: false, single: false, active: false }).tabbable,
    ).toBe(true);
  });

  it("marks the tab left in sight of a shrunk bar", () => {
    expect(tabShape({ compact: true, single: false, active: true }).shown).toBe(
      true,
    );
    expect(
      tabShape({ compact: false, single: false, active: true }).shown,
    ).toBe(false);
    expect(tabShape({ compact: true, single: true, active: true }).shown).toBe(
      false,
    );
  });

  it("shows the badge only on a wide bar, and says the count always", () => {
    const wide = tabShape({
      compact: false,
      single: false,
      active: false,
      count: 2,
    });
    expect(wide).toMatchObject({ badge: true, saysCount: true });
    const shrunk = tabShape({
      compact: true,
      single: false,
      active: false,
      count: 2,
    });
    expect(shrunk).toMatchObject({ badge: false, saysCount: true });
    const lone = tabShape({
      compact: false,
      single: true,
      active: true,
      count: 2,
    });
    expect(lone).toMatchObject({ badge: false, saysCount: true });
    expect(
      tabShape({ compact: false, single: false, active: false, count: 0 }),
    ).toMatchObject({ badge: false, saysCount: false });
  });
});

describe("compactPress", () => {
  it("opens the bar only from the tab left in sight of a shrunk bar", () => {
    expect(compactPress({ compact: true, single: false, onShown: true })).toBe(
      "open",
    );
    // A hidden tab, pressed by a screen reader: it goes there.
    expect(compactPress({ compact: true, single: false, onShown: false })).toBe(
      "go",
    );
    expect(compactPress({ compact: false, single: false, onShown: true })).toBe(
      "go",
    );
    expect(compactPress({ compact: true, single: true, onShown: true })).toBe(
      "go",
    );
  });
});

const MESSAGES = { he, en };

/** The frame with a Today tab and a chat tab counting `count`. */
function draw(count: number, locale: "he" | "en" = "he"): string {
  const provider = {
    locale,
    timeZone: "Asia/Jerusalem",
    messages: MESSAGES[locale],
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const frame: AppShellProps = {
    businessName: "Demo",
    user: { name: "Noa", role: "Owner" },
    nav: [
      { href: "/today", label: "Today", icon: null, exact: true },
      { href: "/chat", label: "Chat", icon: null, count },
    ],
    children: null,
  };
  return renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(AppShell, frame),
    ),
  );
}

/**
 * What each chat link says to a screen reader, the sidebar's and the tab
 * bar's: its text, without what is hidden from it (the icon, the badge).
 */
const chatNames = (html: string) =>
  [...html.matchAll(/<a href="\/chat"[^>]*>(.*?)<\/a>/g)].map((link) =>
    (link[1] ?? "")
      .replace(/<span aria-hidden="true"[^>]*>[^<]*<\/span>/g, "")
      .replace(/<[^>]+>/g, ""),
  );

describe("AppShell's counts", () => {
  it("says one thing needing action, and several, in the plural", () => {
    expect(chatNames(draw(1))).toEqual([
      "Chat, אחד דורש טיפול",
      "Chat, אחד דורש טיפול",
    ]);
    expect(chatNames(draw(3))).toEqual([
      "Chat, 3 דורשים טיפול",
      "Chat, 3 דורשים טיפול",
    ]);
  });

  it("says it in English too", () => {
    expect(chatNames(draw(1, "en"))).toEqual([
      "Chat, 1 needs action",
      "Chat, 1 needs action",
    ]);
    expect(chatNames(draw(4, "en"))).toEqual([
      "Chat, 4 need action",
      "Chat, 4 need action",
    ]);
  });

  it("says nothing with nothing to count", () => {
    expect(chatNames(draw(0))).toEqual(["Chat", "Chat"]);
  });
});
