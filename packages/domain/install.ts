import { z } from "zod";
import { type BrowserFacts, deviceLabel, isAppleMobile } from "./push";

/**
 * The app on an Android phone's home screen (closing the pilot, PR 7): the
 * pure parts. Chrome offers to install a site it finds installable with an
 * event (`beforeinstallprompt`) the page keeps for the person's own press;
 * where none came (another browser, a site Chrome doesn't offer yet, or the
 * event still to come), the words say where its menu does it. An iPhone or
 * iPad has its own steps (`IosInstallSteps`), and a computer is offered
 * nothing here.
 */

/** Whose menu the words name: Chrome's, or the browser's. */
export type InstallBrowser = "chrome" | "other";

/** An app's own view of a page on Android (Instagram's, Facebook's): no menu that installs anything. */
const WEB_VIEW = /;\s*wv\)/;

/** Android browsers that say Chrome too, each with a menu of its own. */
const NOT_CHROME =
  /\b(SamsungBrowser|EdgA|OPR|OPT|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|DuckDuckGo|Firefox|Silk)\//;

/**
 * Which browser a user agent is, as far as the words go: Chrome, another
 * browser, or an app's own view of the page, which has no menu to install
 * from.
 */
export function installBrowser(userAgent: string): InstallBrowser | "webView" {
  if (WEB_VIEW.test(userAgent)) return "webView";
  if (/\bChrome\/\d/.test(userAgent) && !NOT_CHROME.test(userAgent)) {
    return "chrome";
  }
  return "other";
}

/** Whose menu the words name for a user agent: an app's view says the browser's. */
export function installMenu(userAgent: string): InstallBrowser {
  return installBrowser(userAgent) === "chrome" ? "chrome" : "other";
}

/** What a browser on a Linux computer says of itself; a Chromebook says CrOS. */
const LINUX_COMPUTER = /\(X11; Linux x86_64\)/;

/**
 * Android, by what the browser says: Android in its user agent, or a tablet
 * asking for the desktop site, as Chrome does on a large one by default,
 * which says it is a Linux computer and has a touch screen (as an iPad says
 * it is a Mac, `isAppleMobile`). A Linux computer with a touch screen says
 * the same, and is taken for one too.
 */
function isAndroid(browser: BrowserFacts): boolean {
  if (deviceLabel(browser.userAgent) === "android") return true;
  return LINUX_COMPUTER.test(browser.userAgent) && browser.maxTouchPoints > 1;
}

/**
 * How the offer starts on this browser before any press: nothing; the
 * button (Chrome's event was caught); the words that say where the menu
 * installs it (no event); or installed while this page was open.
 */
export type InstallStart = "none" | "ready" | "menu" | "installed";

/** The offer as it goes: how it starts, the press on its way, and declined. */
export type InstallState = InstallStart | "prompting" | "dismissed";

/** What the browser and this page say, for `installStart`. */
export type InstallFacts = {
  browser: BrowserFacts;
  /** Chrome's install event was caught in this page and not used yet. */
  caught: boolean;
  /** The app was installed while this page was open (`appinstalled`). */
  installedNow: boolean;
  /**
   * This browser saw the app installed, or opened from the home screen,
   * before (on Android the two keep the same storage); cleared whenever
   * Chrome offers it again, which it does only while it isn't installed.
   * Only this browser's mark: an app installed before it was kept, or with
   * the site's data cleared since, isn't known until it is opened once.
   */
  installedBefore: boolean;
};

/**
 * How the offer starts here. Nothing inside the installed app, on an iPhone
 * or iPad (their own steps), on anything but Android (an Android tablet
 * asking for the desktop site is Android), or in an app's own view of the
 * page. Else: installed, if it was while this page was open; the button,
 * when Chrome's event was caught; nothing, once this browser saw it
 * installed; else the words that say where the menu installs it.
 */
export function installStart(facts: InstallFacts): InstallStart {
  const { browser } = facts;
  if (browser.standalone || isAppleMobile(browser)) return "none";
  if (!isAndroid(browser)) return "none";
  if (installBrowser(browser.userAgent) === "webView") return "none";
  if (facts.installedNow) return "installed";
  if (facts.caught) return "ready";
  return facts.installedBefore ? "none" : "menu";
}

/** What came of the press: the person's answer to Chrome, or no question asked. */
export type InstallOutcome = "accepted" | "dismissed" | "failed";

/**
 * Where the offer stands after the press: installed; declined (the words
 * say it can be done later, from the menu); or, when Chrome asked nothing
 * (the event was used up or refused the press), the menu's words.
 */
export function installAnswer(outcome: InstallOutcome): InstallState {
  if (outcome === "accepted") return "installed";
  return outcome === "dismissed" ? "dismissed" : "menu";
}

/**
 * A press on its way or answered (`installAnswer`), and how the offer
 * started once it was given: the press used Chrome's event up, so by then
 * it starts elsewhere than it did.
 */
export type InstallPressed = { state: InstallState; over: InstallStart };

/**
 * What the offer shows after a press: its answer while the offer still
 * starts where the press left it, else how it starts now. What the page
 * hears after the press wins over its answer: the app installed from the
 * menu after a no (Chrome says so however it was installed), or Chrome
 * offering it again, which brings the button back. Before any press, how
 * it starts.
 */
export function installShown(
  start: InstallStart,
  pressed: InstallPressed | null,
): InstallState {
  return pressed !== null && pressed.over === start ? pressed.state : start;
}

/**
 * Chrome's `userChoice`, as the browser gives it: the person's answer, or
 * "failed" for anything else.
 */
const userChoice = z.object({ outcome: z.enum(["accepted", "dismissed"]) });

export function installChoice(choice: unknown): InstallOutcome {
  const read = userChoice.safeParse(choice);
  return read.success ? read.data.outcome : "failed";
}
