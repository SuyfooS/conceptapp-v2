import { describe, expect, it } from "vitest";
import {
  type InstallFacts,
  installAnswer,
  installBrowser,
  installChoice,
  installMenu,
  installShown,
  installStart,
} from "./install";
import type { BrowserFacts } from "./push";

// The app on an Android phone's home screen (closing the pilot, PR 7): where
// the offer starts, whose menu the words name, and what a press comes to.

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
// A large Android tablet's Chrome, which asks for the desktop site by
// default: a Linux computer, by its user agent, with a touch screen.
const LINUX_DESKTOP_CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROMEBOOK =
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAMSUNG_INTERNET =
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
const ANDROID_FIREFOX =
  "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0";
const ANDROID_EDGE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0";
const WEB_VIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 350.0";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const browser = (
  userAgent: string,
  more: Partial<BrowserFacts> = {},
): BrowserFacts => ({
  userAgent,
  maxTouchPoints: 0,
  standalone: false,
  canPush: true,
  ...more,
});

const facts = (
  userAgent: string,
  more: Partial<Omit<InstallFacts, "browser">> & {
    browser?: Partial<BrowserFacts>;
  } = {},
): InstallFacts => ({
  browser: browser(userAgent, more.browser),
  caught: more.caught ?? false,
  installedNow: more.installedNow ?? false,
  installedBefore: more.installedBefore ?? false,
});

describe("installStart", () => {
  it("offers the button on Android Chrome once its event was caught", () => {
    expect(installStart(facts(ANDROID_CHROME, { caught: true }))).toBe("ready");
    // A tablet is Android too, and so is any browser that sends the event.
    expect(installStart(facts(ANDROID_TABLET, { caught: true }))).toBe("ready");
    expect(installStart(facts(SAMSUNG_INTERNET, { caught: true }))).toBe(
      "ready",
    );
  });

  it("says where the menu installs it while no event came", () => {
    expect(installStart(facts(ANDROID_CHROME))).toBe("menu");
    expect(installStart(facts(ANDROID_FIREFOX))).toBe("menu");
  });

  it("shows nothing inside the installed app, whatever came", () => {
    for (const caught of [false, true]) {
      expect(
        installStart(
          facts(ANDROID_CHROME, { caught, browser: { standalone: true } }),
        ),
      ).toBe("none");
    }
    expect(
      installStart(
        facts(ANDROID_CHROME, {
          installedNow: true,
          browser: { standalone: true },
        }),
      ),
    ).toBe("none");
  });

  it("shows nothing on an iPhone or an iPad, which have their own steps", () => {
    for (const userAgent of [IPHONE_SAFARI, IPHONE_CHROME]) {
      expect(installStart(facts(userAgent))).toBe("none");
      expect(installStart(facts(userAgent, { caught: true }))).toBe("none");
    }
    // An iPad asking for the desktop site: a Mac with a touch screen.
    expect(
      installStart(facts(IPAD_AS_MAC, { browser: { maxTouchPoints: 5 } })),
    ).toBe("none");
  });

  it("shows nothing on a computer, even where Chrome sends its event", () => {
    expect(installStart(facts(DESKTOP_CHROME))).toBe("none");
    expect(installStart(facts(DESKTOP_CHROME, { caught: true }))).toBe("none");
    // Linux with no touch screen, and a Chromebook, touch or not.
    expect(installStart(facts(LINUX_DESKTOP_CHROME, { caught: true }))).toBe(
      "none",
    );
    expect(
      installStart(
        facts(CHROMEBOOK, { caught: true, browser: { maxTouchPoints: 10 } }),
      ),
    ).toBe("none");
  });

  it("takes an Android tablet asking for the desktop site for Android, by its touch screen", () => {
    const touch = { maxTouchPoints: 5 };
    expect(
      installStart(
        facts(LINUX_DESKTOP_CHROME, { caught: true, browser: touch }),
      ),
    ).toBe("ready");
    expect(installStart(facts(LINUX_DESKTOP_CHROME, { browser: touch }))).toBe(
      "menu",
    );
    expect(installMenu(LINUX_DESKTOP_CHROME)).toBe("chrome");
    // Opened from the home screen, it is the installed app.
    expect(
      installStart(
        facts(LINUX_DESKTOP_CHROME, {
          caught: true,
          browser: { ...touch, standalone: true },
        }),
      ),
    ).toBe("none");
  });

  it("shows nothing in an app's own view of the page, which has no menu to install from", () => {
    expect(installStart(facts(WEB_VIEW))).toBe("none");
    expect(installStart(facts(WEB_VIEW, { caught: true }))).toBe("none");
  });

  it("says installed once it was while the page was open", () => {
    expect(installStart(facts(ANDROID_CHROME, { installedNow: true }))).toBe(
      "installed",
    );
    expect(
      installStart(
        facts(ANDROID_CHROME, { installedNow: true, installedBefore: true }),
      ),
    ).toBe("installed");
  });

  it("shows nothing once this browser saw it installed, unless Chrome offers it again", () => {
    expect(installStart(facts(ANDROID_CHROME, { installedBefore: true }))).toBe(
      "none",
    );
    // Chrome sends its event only while the app isn't installed: removed
    // from the home screen, it is offered again.
    expect(
      installStart(
        facts(ANDROID_CHROME, { installedBefore: true, caught: true }),
      ),
    ).toBe("ready");
  });
});

describe("installBrowser and installMenu", () => {
  it("tell Chrome from the browsers that say Chrome too", () => {
    expect(installBrowser(ANDROID_CHROME)).toBe("chrome");
    expect(installBrowser(ANDROID_TABLET)).toBe("chrome");
    expect(installBrowser(SAMSUNG_INTERNET)).toBe("other");
    expect(installBrowser(ANDROID_EDGE)).toBe("other");
    expect(installBrowser(ANDROID_FIREFOX)).toBe("other");
    expect(installBrowser(WEB_VIEW)).toBe("webView");
  });

  it("name Chrome's menu in Chrome, and the browser's anywhere else", () => {
    expect(installMenu(ANDROID_CHROME)).toBe("chrome");
    expect(installMenu(SAMSUNG_INTERNET)).toBe("other");
    expect(installMenu(ANDROID_FIREFOX)).toBe("other");
    expect(installMenu(WEB_VIEW)).toBe("other");
  });
});

describe("a press, and what came of it", () => {
  it("is installed once accepted, declined once dismissed, the menu's words when nothing was asked", () => {
    expect(installAnswer("accepted")).toBe("installed");
    expect(installAnswer("dismissed")).toBe("dismissed");
    expect(installAnswer("failed")).toBe("menu");
  });

  it("shows the answer while nothing changed since, and what the page heard after it", () => {
    // Before any press: how it starts.
    expect(installShown("ready", null)).toBe("ready");
    expect(installShown("menu", null)).toBe("menu");
    // The press used the event up: the offer starts at the menu's words
    // from then on, and the press's answer shows over them.
    expect(installShown("menu", { state: "prompting", over: "menu" })).toBe(
      "prompting",
    );
    expect(installShown("menu", { state: "dismissed", over: "menu" })).toBe(
      "dismissed",
    );
    expect(installShown("menu", { state: "installed", over: "menu" })).toBe(
      "installed",
    );
    // A no, then installed from Chrome's menu on the same page: installed.
    expect(
      installShown("installed", { state: "dismissed", over: "menu" }),
    ).toBe("installed");
    // Chrome asked nothing, then offered it again: the button is back.
    expect(installShown("ready", { state: "menu", over: "menu" })).toBe(
      "ready",
    );
    expect(installShown("ready", { state: "dismissed", over: "menu" })).toBe(
      "ready",
    );
    // Installed before the answer came: installed either way.
    expect(
      installShown("installed", { state: "prompting", over: "menu" }),
    ).toBe("installed");
    expect(
      installShown("installed", { state: "installed", over: "installed" }),
    ).toBe("installed");
  });

  it("reads Chrome's answer leniently: anything else is no answer", () => {
    expect(installChoice({ outcome: "accepted", platform: "web" })).toBe(
      "accepted",
    );
    expect(installChoice({ outcome: "dismissed", platform: "" })).toBe(
      "dismissed",
    );
    expect(installChoice({ outcome: "maybe" })).toBe("failed");
    expect(installChoice(undefined)).toBe("failed");
    expect(installChoice("accepted")).toBe("failed");
  });
});
