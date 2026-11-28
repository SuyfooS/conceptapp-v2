import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTALL_CAPTURE_SCRIPT, INSTALL_NAMES } from "../../install-capture";
import {
  installStartHere,
  promptInstall,
  subscribeInstall,
} from "./install-prompt";

// The install button's half in the browser (closing the pilot, PR 7), with a
// fake page and a fake Chrome event: caught, asked only on a press, accepted,
// dismissed, installed, no event at all, and inside the installed app.

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** A page as the root layout leaves it, its script run first unless `script` is false. */
function openPage({
  userAgent = ANDROID_CHROME,
  standalone = false,
  stored = new Map<string, string>(),
  script = true,
}: {
  userAgent?: string;
  standalone?: boolean;
  stored?: Map<string, string>;
  script?: boolean;
} = {}) {
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
    removeItem: (key: string) => {
      stored.delete(key);
    },
  };
  const target = new EventTarget();
  const page = Object.assign(target, {
    location: { pathname: "/home" },
    matchMedia: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
    }),
    localStorage: storage,
    PushManager: class {},
    Notification: class {},
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {
    userAgent,
    maxTouchPoints: 0,
    serviceWorker: {},
    standalone: undefined,
  });
  if (script) new Function("window", INSTALL_CAPTURE_SCRIPT)(page);
  return { page, stored };
}

/** Chrome's event, as a fake: what its prompt was asked, and the answer it gives. */
function chromeEvent(answer: unknown | Error = { outcome: "accepted" }) {
  const asked = { prompts: 0 };
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt: async () => {
        asked.prompts += 1;
        if (answer instanceof Error) throw answer;
      },
      userChoice: Promise.resolve(answer instanceof Error ? null : answer),
    },
  );
  return { event, asked };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("where the offer starts", () => {
  it("says where the menu installs it while no event came", () => {
    openPage();
    expect(installStartHere()).toBe("menu");
  });

  it("offers the button once Chrome's event is caught, and tells who listens", () => {
    const { page } = openPage();
    const heard = vi.fn();
    const stop = subscribeInstall(heard);
    const { event, asked } = chromeEvent();
    page.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(installStartHere()).toBe("ready");
    // Caught, never asked by itself.
    expect(asked.prompts).toBe(0);
    stop();
    page.dispatchEvent(chromeEvent().event);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("catches it too on a page whose script never ran", () => {
    const { page } = openPage({ script: false });
    expect(installStartHere()).toBe("menu");
    const { event } = chromeEvent();
    page.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installStartHere()).toBe("ready");
  });

  it("says installed once the app is, and nothing on the next visit", () => {
    const { page, stored } = openPage();
    page.dispatchEvent(chromeEvent().event);
    page.dispatchEvent(new Event("appinstalled"));
    expect(installStartHere()).toBe("installed");
    openPage({ stored });
    expect(installStartHere()).toBe("none");
  });

  it("shows nothing inside the installed app, and marks this browser", () => {
    const { stored } = openPage({ standalone: true });
    expect(installStartHere()).toBe("none");
    expect(stored.has(INSTALL_NAMES.installed)).toBe(true);
    // The browser's tab, opened after it: Chrome offers nothing while the
    // app is installed, and the menu's words aren't said either.
    openPage({ stored });
    expect(installStartHere()).toBe("none");
    // Whatever came, the app opened from the home screen offers nothing.
    const app = openPage({ standalone: true });
    app.page.dispatchEvent(chromeEvent().event);
    expect(installStartHere()).toBe("none");
  });

  it("shows nothing on an iPhone or a computer, even with an event", () => {
    for (const userAgent of [IPHONE_SAFARI, DESKTOP_CHROME]) {
      const { page } = openPage({ userAgent });
      page.dispatchEvent(chromeEvent().event);
      expect(installStartHere()).toBe("none");
    }
  });

  it("shows nothing on the server, and listens to nothing there", () => {
    vi.stubGlobal("window", undefined);
    expect(installStartHere()).toBe("none");
    expect(() => subscribeInstall(() => {})()).not.toThrow();
  });
});

describe("the press", () => {
  it("asks Chrome at once, inside the press, and comes back accepted", async () => {
    const { page } = openPage();
    const { event, asked } = chromeEvent({
      outcome: "accepted",
      platform: "web",
    });
    page.dispatchEvent(event);
    const answer = promptInstall();
    // Asked before anything was awaited, while the press still counts.
    expect(asked.prompts).toBe(1);
    expect(await answer).toBe("accepted");
  });

  it("comes back dismissed when the person says no", async () => {
    const { page } = openPage();
    page.dispatchEvent(chromeEvent({ outcome: "dismissed" }).event);
    expect(await promptInstall()).toBe("dismissed");
  });

  it("uses the event once: a second press asks nothing", async () => {
    const { page } = openPage();
    const { event, asked } = chromeEvent({ outcome: "dismissed" });
    page.dispatchEvent(event);
    await promptInstall();
    expect(await promptInstall()).toBe("failed");
    expect(asked.prompts).toBe(1);
    expect(installStartHere()).toBe("menu");
  });

  it("fails when Chrome refuses to ask, or answers what it never says", async () => {
    const { page } = openPage();
    page.dispatchEvent(chromeEvent(new Error("NotAllowedError")).event);
    expect(await promptInstall()).toBe("failed");
    page.dispatchEvent(chromeEvent({ outcome: "later" }).event);
    expect(await promptInstall()).toBe("failed");
  });

  it("fails with no event, and asks nothing", async () => {
    openPage();
    expect(await promptInstall()).toBe("failed");
    vi.stubGlobal("window", undefined);
    expect(await promptInstall()).toBe("failed");
  });
});
