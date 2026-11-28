import { describe, expect, it } from "vitest";
import {
  type CaptureWindow,
  captureInstallPrompt,
  INSTALL_NAMES,
  type InstallKept,
  installCaptureScript,
} from "./install-capture";

// Chrome's offer to install the app, caught from the first moment of every
// page (closing the pilot, PR 7): by the function, and by the root layout's
// inline script made of its source, with a fake page and a fake event.

type FakePage = CaptureWindow & {
  stored: Map<string, string>;
  changes: number;
  kept(): InstallKept | undefined;
};

/** A page at `path`, opened from the home screen or not, its storage blocked or not. */
function fakePage({
  path = "/home",
  standalone = false,
  blocked = false,
}: {
  path?: string;
  standalone?: boolean;
  blocked?: boolean;
} = {}): FakePage {
  const target = new EventTarget();
  const stored = new Map<string, string>();
  const refuse = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  const page = {
    stored,
    changes: 0,
    location: { pathname: path } as Location,
    matchMedia: (query: string) =>
      ({
        matches: standalone && query === "(display-mode: standalone)",
      }) as MediaQueryList,
    localStorage: {
      setItem: (key: string, value: string) =>
        blocked ? refuse() : stored.set(key, value),
      removeItem: (key: string) => (blocked ? refuse() : stored.delete(key)),
    },
    addEventListener: target.addEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    kept: () =>
      (page as unknown as Record<string, InstallKept | undefined>)[
        INSTALL_NAMES.kept
      ],
  } as FakePage;
  target.addEventListener(INSTALL_NAMES.changed, () => {
    page.changes += 1;
  });
  return page;
}

/** Chrome's event, as a fake: cancelable, with a prompt and an answer. */
function installEvent() {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });
}

// `offered`: the site can offer the app's own button (notifications to the
// phone set up), as on every page but where a case says.
const ways = [
  [
    "the function",
    (page: FakePage, offered = true) =>
      captureInstallPrompt(page, INSTALL_NAMES, offered),
  ],
  [
    "the layout's inline script",
    (page: FakePage, offered = true) =>
      new Function("window", installCaptureScript(offered))(page),
  ],
] as const;

for (const [way, capture] of ways) {
  describe(`the capture, by ${way}`, () => {
    it("keeps Chrome's event for a press, and stops Chrome's own bar", () => {
      const page = fakePage();
      capture(page);
      expect(page.kept()).toEqual({ event: null, installed: false });
      const event = installEvent();
      page.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(page.kept()?.event).toBe(event);
      expect(page.changes).toBe(1);
    });

    it("leaves Chrome's own bar where the site can't offer the button, and keeps the event all the same", () => {
      const page = fakePage();
      capture(page, false);
      const event = installEvent();
      page.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(page.kept()?.event).toBe(event);
      expect(page.changes).toBe(1);
      page.dispatchEvent(new Event("appinstalled"));
      expect(page.kept()).toEqual({ event: null, installed: true });
      expect(page.stored.has(INSTALL_NAMES.installed)).toBe(true);
    });

    it("lets the event go once the app is installed, and keeps that here", () => {
      const page = fakePage();
      capture(page);
      page.dispatchEvent(installEvent());
      page.dispatchEvent(new Event("appinstalled"));
      expect(page.kept()).toEqual({ event: null, installed: true });
      expect(page.stored.has(INSTALL_NAMES.installed)).toBe(true);
      expect(page.changes).toBe(2);
    });

    it("forgets the mark when Chrome offers it again", () => {
      const page = fakePage();
      page.stored.set(INSTALL_NAMES.installed, "1");
      capture(page);
      page.dispatchEvent(installEvent());
      expect(page.stored.has(INSTALL_NAMES.installed)).toBe(false);
      expect(page.kept()?.installed).toBe(false);
    });

    it("keeps that the app is installed once opened from the home screen", () => {
      const page = fakePage({ standalone: true });
      capture(page);
      expect(page.stored.has(INSTALL_NAMES.installed)).toBe(true);
      // In the browser's tab, nothing is known until Chrome says.
      const tab = fakePage();
      capture(tab);
      expect(tab.stored.size).toBe(0);
    });

    it("leaves the clock station's event to Chrome: it installs the station", () => {
      for (const path of ["/station", "/station/orders"]) {
        const page = fakePage({ path, standalone: true });
        capture(page);
        const event = installEvent();
        page.dispatchEvent(event);
        page.dispatchEvent(new Event("appinstalled"));
        expect(event.defaultPrevented).toBe(false);
        expect(page.kept()).toEqual({ event: null, installed: false });
        expect(page.stored.size).toBe(0);
        expect(page.changes).toBe(0);
      }
      // A path that only starts with the same letters is the app's.
      const page = fakePage({ path: "/stations" });
      capture(page);
      const event = installEvent();
      page.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("still catches the event where storage is blocked", () => {
      const page = fakePage({ blocked: true, standalone: true });
      expect(() => capture(page)).not.toThrow();
      const event = installEvent();
      expect(() => page.dispatchEvent(event)).not.toThrow();
      expect(page.kept()?.event).toBe(event);
      page.dispatchEvent(new Event("appinstalled"));
      expect(page.kept()?.installed).toBe(true);
    });

    it("starts once: a second start leaves what was caught", () => {
      const page = fakePage();
      capture(page);
      const event = installEvent();
      page.dispatchEvent(event);
      capture(page);
      captureInstallPrompt(page, INSTALL_NAMES, false);
      expect(page.kept()?.event).toBe(event);
      const next = installEvent();
      page.dispatchEvent(next);
      // One listener, the first start's: one change for each event, and
      // Chrome's bar still stopped.
      expect(page.changes).toBe(2);
      expect(next.defaultPrevented).toBe(true);
    });
  });
}

describe("the layout's inline script", () => {
  it("is one call of the capture, with the page's names, whether the site offers the button, and nothing else", () => {
    for (const offered of [true, false]) {
      const script = installCaptureScript(offered);
      expect(script.startsWith("(")).toBe(true);
      expect(script).toContain(JSON.stringify(INSTALL_NAMES));
      expect(script.endsWith(`,${offered});`)).toBe(true);
      expect(script).not.toContain("</script");
      expect(script).not.toMatch(/\bimport\b|\brequire\(/);
    }
  });
});
