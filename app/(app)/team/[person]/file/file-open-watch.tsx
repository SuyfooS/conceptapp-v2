"use client";

import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import {
  focusWhenGone,
  ignoreHeldEnter,
  onScreen,
  watchFocusIn,
} from "@ui/focus-after";
import { Spinner } from "@ui/spinner";
import { Lock, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { focusIfLost, titleAbove } from "./file-focus";
import {
  deviceFileTabs,
  FILE_TABS_CHANNEL,
  FILE_TABS_TWIN_CHANNEL,
  type FileTabs,
} from "./file-tabs";
import type { HolderFileActions } from "./holder-file-types";
import {
  closeAndDraw,
  type FileClose,
  type OpenFileMemory,
  watchOpenFile,
} from "./open-watch";

type Watched = Pick<HolderFileActions, "keepOpen" | "lock">;

/** "נעילת התיק" inside the open file: closes it on the whole device. */
const FileClosing = createContext<(() => void) | null>(null);

/**
 * How long the file stays hidden with nothing said: an answer within it
 * shows the file with no line flashing first; past it, a line says the
 * server is being asked.
 */
const CHECKING_AFTER_MS = 300;

/**
 * An open file, watched (profile H6a, `watchOpenFile`, whose comment has the
 * rule): only the server says whether it is open, and only "נעילת התיק" (or
 * signing out) closes it on the whole device, telling every tab
 * (`FileTabs`) and forgetting the step-up (`lockFileAction`). Anything else
 * closes it in this tab only: the server saying it is closed, a check that
 * fails or gets no answer, another tab's lock. Either way the file stops
 * showing here at once (`onClosed`: its place draws the locked card),
 * without waiting for the server, and the page is drawn again. A page put
 * away hides the file; coming back to it, Next showing the screen again, or
 * its own 15 minutes passing keep it hidden (invisible, inert) until the
 * server, asked at once, says it is still open, and the focus held in it
 * goes back where it was. While it is hidden for longer than a moment, a
 * quiet line with a spinner says so in its place ("בודקים שהתיק עדיין
 * פתוח"), so the file never just vanishes; an answer that doesn't come
 * closes it here within seconds. The watch starts in a layout effect, so a
 * screen Next shows again is hidden before it is painted. Opened by a code
 * here (`focusOnOpen`), the focus, which was on the code's boxes, goes to
 * the file's first heading. The twin, which keeps nothing, goes to its
 * locked state instead (`lockedHref`), and its tabs talk among themselves
 * only. A minute before it locks for want of activity, a line says so, at
 * once to a screen reader, with "להשאיר פתוח" (`IdleWarning`); kept open,
 * by it or by any activity, "התיק נשאר פתוח" is said. The warning keeps
 * nothing open by itself. On a phone it is what keeps a screen reader's
 * file open: a swipe there moves only the reader's own cursor, no focus,
 * so reading the file is no activity the page hears.
 */
export function FileOpenWatch({
  actions,
  lockedHref,
  onClosed,
  focusOnOpen = false,
  children,
}: {
  actions: Watched;
  lockedHref?: string;
  /** The file closed here: show the locked card in its place. */
  onClosed: () => void;
  /** Opened by a code on this screen: its first heading takes the focus. */
  focusOnOpen?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("app.team.file");
  const memory = useRef<OpenFileMemory>({ shown: false });
  const closing = useRef(false);
  const tabs = useRef<FileTabs | null>(null);
  const place = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  // What held the focus in the file as it was hidden: inert, it lost it.
  const heldFocus = useRef<HTMLElement | null>(null);
  const [held, setHeld] = useState(false);
  // The hold as the watch last gave it, before it is drawn.
  const holding = useRef(false);
  // The warning's own part of the page, and where its focus came from.
  const warningRoot = useRef<HTMLDivElement>(null);
  const warningFrom = useRef<Element | null>(null);
  // Held for longer than a moment: the line saying the server is asked.
  const [checking, setChecking] = useState(false);
  const checkingSoon = useRef<number | undefined>(undefined);
  const channel = lockedHref ? FILE_TABS_TWIN_CHANNEL : FILE_TABS_CHANNEL;
  const locale = useLocale();
  // A minute before it locks: the warning, and whether it was on screen
  // (given while the file was held, it was never seen, nor its end said).
  const [warned, setWarned] = useState(false);
  const warningSeen = useRef(false);
  // How many times a warning seen ended with the file still open.
  const [kept, setKept] = useState(0);
  const stayOpen = useRef<(() => void) | null>(null);

  function close(why: FileClose) {
    if (closing.current) return;
    closing.current = true;
    onClosed();
    void closeAndDraw(why, {
      tell: () => tabs.current?.tell({ kind: "closed" }),
      lock: actions.lock,
      draw: () => {
        if (lockedHref) router.push(lockedHref);
        else router.refresh();
      },
    });
  }

  const closeFromWatch = useEffectEvent((why: FileClose) => close(why));
  const keepOpen = useEffectEvent((slide: boolean) => actions.keepOpen(slide));
  const hold = useEffectEvent((next: boolean) => {
    holding.current = next;
    const active = document.activeElement;
    if (next && active instanceof HTMLElement) {
      if (place.current?.contains(active)) {
        heldFocus.current = active;
      } else if (warningRoot.current?.contains(active)) {
        // On "להשאיר פתוח", which goes with the hold: shown again, the
        // file takes the focus at the title of the part it came from, else
        // at its first heading (`landingIn`); closed, the locked card
        // takes it.
        heldFocus.current = landingIn(place.current, warningFrom.current);
      }
    }
    setHeld(next);
    // Each hold waits its own moment before saying anything.
    window.clearTimeout(checkingSoon.current);
    setChecking(false);
    if (next) {
      checkingSoon.current = window.setTimeout(
        () => setChecking(true),
        CHECKING_AFTER_MS,
      );
    }
  });

  const warn = useEffectEvent((soon: boolean) => {
    setWarned(soon);
    if (soon) return;
    if (warningSeen.current) setKept((count) => count + 1);
    warningSeen.current = false;
  });

  useLayoutEffect(() => {
    const device = deviceFileTabs(window, channel);
    tabs.current = device;
    const watching = watchOpenFile({
      memory: memory.current,
      keepOpen: (slide) => keepOpen(slide),
      close: (why) => closeFromWatch(why),
      hold: (next) => hold(next),
      warn: (soon) => warn(soon),
      page: document,
      win: window,
      tabs: device,
    });
    stayOpen.current = watching.stayOpen;
    return () => {
      watching.stop();
      stayOpen.current = null;
      window.clearTimeout(checkingSoon.current);
      // A watch that starts again counts afresh, with nothing to warn of.
      setWarned(false);
      warningSeen.current = false;
    };
  }, [channel]);

  // The warning on screen: its end is said.
  const warningShown = warned && !held;
  useLayoutEffect(() => {
    if (warningShown) warningSeen.current = true;
  }, [warningShown]);

  // Kept open after a warning that was on screen: said once, after the
  // focus its "להשאיר פתוח" held has gone back into the file (not again
  // when the screen is shown again).
  const keptSaid = useRef(0);
  useEffect(() => {
    if (kept === keptSaid.current) return;
    keptSaid.current = kept;
    announce(t("idle.kept"), { lang: locale });
  }, [kept, t, locale]);

  // Shown again: the focus the hiding took goes back, unless the person
  // put it somewhere else meanwhile.
  useLayoutEffect(() => {
    if (held) return;
    const back = heldFocus.current;
    heldFocus.current = null;
    if (back?.isConnected) focusIfLost(back, document);
  }, [held]);

  useLayoutEffect(() => {
    if (!focusOnOpen || focused.current) return;
    focused.current = true;
    focusIfLost(place.current?.querySelector("h2"), document);
  }, [focusOnOpen]);

  return (
    <FileClosing value={() => close("pressed")}>
      <div className="relative">
        {/* Always there, so what it comes to say is heard; over the hidden file's top. */}
        <p
          role="status"
          className="absolute inset-x-0 top-0 flex items-center gap-2 text-ink-2"
        >
          {held && checking ? (
            <>
              <Spinner />
              {t("checking")}
            </>
          ) : null}
        </p>
        <div
          ref={place}
          aria-busy={held || undefined}
          inert={held}
          className={held ? "invisible" : undefined}
        >
          {children}
        </div>
        {warningShown ? (
          <IdleWarning
            onStay={() => stayOpen.current?.()}
            place={place}
            closing={closing}
            held={holding}
            root={warningRoot}
            cameFrom={warningFrom}
          />
        ) : null}
      </div>
    </FileClosing>
  );
}

/**
 * The file is about to lock for want of activity: a line that says so, an
 * alert, so a screen reader says it at once wherever its reader is, and
 * "להשאיר פתוח", in the dock, within reach wherever the page is scrolled.
 * The line names the button and where it is, as a phone's reader, whose
 * swipes are no activity, comes to it after the whole file; the button is
 * described by the line. It doesn't take the focus: a press anywhere keeps
 * the file open too, asked of the server at once (`watchOpenFile`).
 * Gone with the focus on its button (kept open, by it or by anything else),
 * the focus goes to the title of the part of the file it came from, else
 * to the file's first heading (`landingIn`), never back to a control the
 * person was only passing, which an Enter meant for this button would
 * press; never when the file closed, whose locked card takes it, nor when
 * it went with the file held, inert (its 15 minutes' check, the page put
 * away): the file takes it as it shows again (`heldFocus`), or the locked
 * card. Enter held down on the button presses it once.
 */
function IdleWarning({
  onStay,
  place,
  closing,
  held,
  root,
  cameFrom,
}: {
  onStay: () => void;
  /** The file, where the focus goes back to. */
  place: RefObject<HTMLDivElement | null>;
  /** The file is closing: the locked card takes the focus. */
  closing: RefObject<boolean>;
  /** The file is held: the focus waits for it to show again, or to close. */
  held: RefObject<boolean>;
  /** The warning's own part of the page. */
  root: RefObject<HTMLDivElement | null>;
  /** Where the focus came to its button from. */
  cameFrom: RefObject<Element | null>;
}) {
  const t = useTranslations("app.team.file.idle");
  const warningId = useId();

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    // Each warning counts afresh.
    cameFrom.current = null;
    const watch = watchFocusIn(element);
    const from = (event: FocusEvent) => {
      const before = event.relatedTarget;
      if (before instanceof Element && !element.contains(before)) {
        cameFrom.current = before;
      }
    };
    element.addEventListener("focusin", from);
    return () => {
      element.removeEventListener("focusin", from);
      const had = watch.had();
      watch.stop();
      if (!had || closing.current || held.current) return;
      const back = landingIn(place.current, cameFrom.current);
      queueMicrotask(() => {
        focusWhenGone([back]);
      });
    };
  }, [place, closing, held, root, cameFrom]);

  return (
    <div ref={root}>
      <FloatingDock
        notice={
          <p
            id={warningId}
            role="alert"
            className="glass mx-auto w-fit rounded-[22px] px-4 py-2 text-center font-medium text-base"
          >
            {t("warning")}
          </p>
        }
      >
        <DockButton
          icon={<LockOpen aria-hidden="true" />}
          onClick={onStay}
          onKeyDown={ignoreHeldEnter}
          aria-describedby={warningId}
        >
          {t("keepOpen")}
        </DockButton>
      </FloatingDock>
    </div>
  );
}

/**
 * Where the focus lands in the file as the warning goes with it: the title
 * of the part it came from, else the file's first heading (`titleAbove`),
 * among the titles on screen. Null without a file.
 */
function landingIn(
  file: HTMLElement | null,
  from: Element | null,
): HTMLElement | null {
  if (!file) return null;
  const titles = [...file.querySelectorAll<HTMLElement>("h2")].filter(onScreen);
  return titleAbove(from && file.contains(from) ? from : null, titles);
}

/** "נעילת התיק": the file closes here at once, and in every tab of the device. */
export function LockFileButton() {
  const t = useTranslations("app.team.file.lock");
  const close = use(FileClosing);
  if (!close) throw new Error("LockFileButton is drawn inside FileOpenWatch");
  return (
    <Button variant="secondary" onClick={close} className="self-start">
      <Lock aria-hidden="true" />
      {t("action")}
    </Button>
  );
}
