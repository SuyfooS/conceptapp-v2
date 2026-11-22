"use client";

import { Button } from "@ui/button";
import { Spinner } from "@ui/spinner";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { focusIfLost } from "./file-focus";
import {
  deviceFileTabs,
  FILE_TABS_CHANNEL,
  FILE_TABS_TWIN_CHANNEL,
  type FileTabs,
} from "./file-tabs";
import type { HolderFileActions } from "./holder-file-types";
import {
  type FileClose,
  lockAndDraw,
  type OpenFileMemory,
  watchOpenFile,
} from "./open-watch";

type Watched = Pick<HolderFileActions, "keepOpen" | "lock">;

/** "נעילת התיק" inside the open file: closes it here, as the idle lock does. */
const FileClosing = createContext<(() => void) | null>(null);

/**
 * How long the file stays hidden with nothing said: an answer within it
 * shows the file with no line flashing first; past it, a line says the
 * server is being asked.
 */
const CHECKING_AFTER_MS = 300;

/**
 * An open file, watched (profile H6a, `watchOpenFile`): as it opens or is
 * shown again it tells the server, and activity on it (a press, a key)
 * tells it again at most once a minute, so its 15 minutes start again. 15
 * minutes with none on any of the device's open files, coming back to it
 * after them, the server saying it is closed, no answer from the server, or
 * another tab locking the files, and the file stops showing here at once
 * (`onClosed`: its place draws the locked card), without waiting for the
 * server; then the device's other tabs are told (`FileTabs`), the files are
 * locked (`lockFileAction`) and the page is drawn again. A page put away
 * hides the file, and coming back to it, or Next showing the screen again,
 * keeps it hidden (invisible, inert) until the server, asked at once, says
 * it is still open, and the focus held in it goes back where it was. While
 * it is hidden for longer than a moment, a quiet line with a spinner says
 * so in its place ("בודקים שהתיק עדיין פתוח"), so the file never just
 * vanishes; an answer that doesn't come closes it within seconds. The watch
 * starts in a layout effect, so a screen Next shows again is hidden before
 * it is painted, whatever its own clock says: the server decides. Opened by
 * a code here (`focusOnOpen`), the focus, which was on the code's boxes,
 * goes to the file's first heading. The twin, which keeps nothing, goes to
 * its locked state instead (`lockedHref`), and its tabs talk among
 * themselves only.
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
  const memory = useRef<OpenFileMemory>({ lastActivity: null });
  const closing = useRef(false);
  const tabs = useRef<FileTabs | null>(null);
  const place = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  // What held the focus in the file as it was hidden: inert, it lost it.
  const heldFocus = useRef<HTMLElement | null>(null);
  const [held, setHeld] = useState(false);
  // Held for longer than a moment: the line saying the server is asked.
  const [checking, setChecking] = useState(false);
  const checkingSoon = useRef<number | undefined>(undefined);
  const channel = lockedHref ? FILE_TABS_TWIN_CHANNEL : FILE_TABS_CHANNEL;

  function close(why: FileClose) {
    if (closing.current) return;
    closing.current = true;
    onClosed();
    void lockAndDraw(why, {
      tell: () => tabs.current?.tell({ kind: "closed" }),
      lock: actions.lock,
      draw: () => {
        if (lockedHref) router.push(lockedHref);
        else router.refresh();
      },
    });
  }

  const closeFromWatch = useEffectEvent((why: FileClose) => close(why));
  const keepOpen = useEffectEvent(() => actions.keepOpen());
  const hold = useEffectEvent((next: boolean) => {
    const active = document.activeElement;
    if (
      next &&
      active instanceof HTMLElement &&
      place.current?.contains(active)
    ) {
      heldFocus.current = active;
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

  useLayoutEffect(() => {
    const device = deviceFileTabs(window, channel);
    tabs.current = device;
    const stop = watchOpenFile({
      memory: memory.current,
      keepOpen: () => keepOpen(),
      close: (why) => closeFromWatch(why),
      hold: (next) => hold(next),
      page: document,
      win: window,
      tabs: device,
    });
    return () => {
      stop();
      window.clearTimeout(checkingSoon.current);
    };
  }, [channel]);

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
      </div>
    </FileClosing>
  );
}

/** "נעילת התיק": the file closes here at once, and on this device. */
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
