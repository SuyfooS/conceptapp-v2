"use client";

import { useSyncExternalStore } from "react";
import {
  createAnnouncerStore,
  NOTHING_SAID,
  type Politeness,
} from "./announcer-store";
import { notePointerKinds } from "./undo-wait";

/** The page's one announcer, which every screen says through. */
const store = createAnnouncerStore();

// Loaded with the root layout, before any screen: the first press a way back
// asks about (`@ui/undo-wait`) is already noted.
if (typeof document !== "undefined") notePointerKinds(document);

/**
 * Says `text` to a screen reader, with nothing on screen: what just happened
 * where no line of the screen says it (a switch of business, a number
 * stepped). Politely by default, after what is being read. Never a code, an
 * ID number or anything secret: those are said where they show. Nothing on
 * the server.
 */
export function announce(
  text: string,
  options?: { politeness?: Politeness; lang?: string },
): void {
  if (typeof window === "undefined") return;
  store.announce(text, options);
}

/**
 * The page's two live regions, one polite and one assertive, drawn once in
 * the root layout before anything else, so a line said just before a
 * navigation is heard on the next screen. Each carries `aria-live` from the
 * first drawing, so an open or closing sheet (Radix hides what is outside
 * it, live regions aside) never hides them, and a line added later is a
 * change in a region that was already there. Each line is its own
 * paragraph, so only the new one is read; it goes after a few seconds.
 */
export function Announcer() {
  const { polite, assertive } = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    () => NOTHING_SAID,
  );
  return (
    <div data-announcer="" className="sr-only">
      <div aria-live="polite" data-announcer="polite">
        {polite.map((line) => (
          <p key={line.id} lang={line.lang}>
            {line.text}
          </p>
        ))}
      </div>
      <div aria-live="assertive" data-announcer="assertive">
        {assertive.map((line) => (
          <p key={line.id} lang={line.lang}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
