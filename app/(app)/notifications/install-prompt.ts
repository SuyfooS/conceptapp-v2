import {
  type InstallOutcome,
  type InstallStart,
  installChoice,
  installStart,
} from "@domain/install";
import {
  captureInstallPrompt,
  INSTALL_NAMES,
  type InstallKept,
} from "../../install-capture";
import { browserFacts } from "./push-client";

/**
 * The browser's half of the install button (closing the pilot, PR 7): what
 * the root layout's script caught (`app/install-capture.ts`), read as a
 * store a component subscribes to, and the press that asks Chrome. Only for
 * client components; on the server there is nothing to read.
 */

/** What the page caught, the capture started here if the layout's script never ran. */
function kept(): InstallKept | null {
  if (typeof window === "undefined") return null;
  captureInstallPrompt(window, INSTALL_NAMES);
  return (
    (window as unknown as Record<string, InstallKept | undefined>)[
      INSTALL_NAMES.kept
    ] ?? null
  );
}

/** Whether this browser saw the app installed before; no when storage can't say. */
function installedBefore(): boolean {
  try {
    return localStorage.getItem(INSTALL_NAMES.installed) !== null;
  } catch {
    return false;
  }
}

/** Calls `listener` whenever the page catches an event or sees the app installed. */
export function subscribeInstall(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  kept();
  window.addEventListener(INSTALL_NAMES.changed, listener);
  return () => window.removeEventListener(INSTALL_NAMES.changed, listener);
}

/** How the offer starts in this browser now (`installStart`). */
export function installStartHere(): InstallStart {
  const held = kept();
  if (!held) return "none";
  return installStart({
    browser: browserFacts(),
    caught: held.event !== null,
    installedNow: held.installed,
    installedBefore: installedBefore(),
  });
}

/**
 * Asks Chrome to install the app, from inside the person's press: its
 * `prompt()` is called before anything is awaited, while the press still
 * counts. The event is used once, as Chrome allows. What the person
 * answered, or "failed" when there was no event or Chrome refused to ask.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const held = kept();
  const event = held?.event;
  if (!held || !event) return "failed";
  held.event = null;
  try {
    await event.prompt();
    return installChoice(await event.userChoice);
  } catch {
    return "failed";
  }
}
