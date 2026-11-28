/**
 * Chrome's offer to install the app (`beforeinstallprompt`, closing the
 * pilot, PR 7), caught from the first moment of every page: the root layout
 * runs `installCaptureScript` inline as the page is read, before any of
 * the app's own code, since Chrome may send the event before React has
 * drawn anything. It keeps the event on the page (on `window`, under
 * `INSTALL_NAMES.kept`) for the person's own press on "התקנת האפליקציה"
 * (`app/(app)/notifications/install-button.tsx`), and, where this site can
 * offer that button, stops Chrome's own bar, which would cover the tab bar
 * at the foot of the screen; where it can't (no notifications to the phone
 * set up, so no card and no switch to draw it beside), the bar is left to
 * Chrome. It never calls `prompt()`: only a press does. `appinstalled` lets
 * the event go, and this browser keeps that the app is installed
 * (localStorage, inside try/catch), as it does when the page is opened from
 * the home screen (`display-mode: standalone`): on Android the app and the
 * browser keep the same storage, and Chrome sends no event while the app is
 * installed, so the menu's words aren't said either. A new event clears
 * that mark: Chrome sends one only while the app isn't installed. Never on
 * the clock station's pages, whose own manifest installs the station, not
 * the app. Nothing on the server: the page's script is this function's own
 * source, and whether the site offers the button.
 */

/** Where the page keeps what it caught, what it says on each change, and this browser's mark. */
export type InstallNames = {
  kept: string;
  changed: string;
  installed: string;
};

export const INSTALL_NAMES: InstallNames = {
  kept: "__conceptappInstall",
  changed: "conceptapp:install",
  installed: "conceptapp:app-installed",
};

/** Chrome's event, as far as it is used: one `prompt()`, then the person's answer. */
export type InstallPromptEvent = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<unknown>;
};

/** What the page caught: the event not used yet, and whether the app was installed meanwhile. */
export type InstallKept = {
  event: InstallPromptEvent | null;
  installed: boolean;
};

/** What the capture reads of the page. */
export type CaptureWindow = Pick<
  Window,
  "addEventListener" | "dispatchEvent" | "location" | "matchMedia"
> & { localStorage: Pick<Storage, "setItem" | "removeItem"> };

/**
 * Starts catching Chrome's event on `win`, once: called again, it leaves
 * what is there. `offered`: this site can offer the app's own button, so
 * Chrome's bar is stopped; else the event is kept all the same and the bar
 * left to Chrome. Written to run as the page's own inline script too
 * (`installCaptureScript`), so it reads nothing from outside itself but its
 * arguments and the browser's own `Event`.
 */
export function captureInstallPrompt(
  win: CaptureWindow,
  names: InstallNames,
  offered: boolean,
): void {
  const holder = win as unknown as Record<string, unknown>;
  if (holder[names.kept]) return;
  const kept: InstallKept = { event: null, installed: false };
  holder[names.kept] = kept;
  const onStation = () => /^\/station(\/|$)/.test(win.location.pathname);
  const mark = (installed: boolean) => {
    try {
      if (installed) win.localStorage.setItem(names.installed, "1");
      else win.localStorage.removeItem(names.installed);
    } catch {
      // Blocked storage: the menu's words may come again next time.
    }
  };
  try {
    if (!onStation() && win.matchMedia("(display-mode: standalone)").matches) {
      mark(true);
    }
  } catch {
    // No matchMedia: nothing is known yet.
  }
  win.addEventListener("beforeinstallprompt", (event) => {
    if (onStation()) return;
    if (offered) event.preventDefault();
    kept.event = event as InstallPromptEvent;
    kept.installed = false;
    mark(false);
    win.dispatchEvent(new Event(names.changed));
  });
  win.addEventListener("appinstalled", () => {
    if (onStation()) return;
    kept.event = null;
    kept.installed = true;
    mark(true);
    win.dispatchEvent(new Event(names.changed));
  });
}

/**
 * The root layout's inline script: the capture, started on the page as it
 * is read, `offered` as `captureInstallPrompt` takes it.
 */
export function installCaptureScript(offered: boolean): string {
  return `(${captureInstallPrompt.toString()})(window,${JSON.stringify(INSTALL_NAMES)},${offered ? "true" : "false"});`;
}
