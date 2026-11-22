"use client";

import { Button } from "@ui/button";
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
} from "react";
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
 * An open file, watched (profile H6a, `watchOpenFile`): as it opens or is
 * shown again it tells the server, and activity on it (a press, a key)
 * tells it again at most once a minute, so its 15 minutes start again. 15
 * minutes with none, coming back to it after them, the server saying it is
 * closed, or no answer from the server, and the file stops showing here at
 * once (`onClosed`: its place draws the locked card), without waiting for
 * the server; then the files are locked (`lockFileAction`) and the page is
 * drawn again. The moment of the last activity is kept while Next hides the
 * screen and shows it again, and the watch starts in a layout effect, so a
 * screen shown again past its 15 minutes closes before it is painted. The
 * step-up is the device's, so a file locked in one tab is locked in all:
 * another tab's next touch hears it is closed. The twin, which keeps
 * nothing, goes to its locked state instead (`lockedHref`).
 */
export function FileOpenWatch({
  actions,
  lockedHref,
  onClosed,
  children,
}: {
  actions: Watched;
  lockedHref?: string;
  /** The file closed here: show the locked card in its place. */
  onClosed: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const memory = useRef<OpenFileMemory>({ lastActivity: null });
  const closing = useRef(false);

  function close(why: FileClose) {
    if (closing.current) return;
    closing.current = true;
    onClosed();
    void lockAndDraw(why, actions.lock, () => {
      if (lockedHref) router.push(lockedHref);
      else router.refresh();
    });
  }

  const closeFromWatch = useEffectEvent((why: FileClose) => close(why));
  const keepOpen = useEffectEvent(() => actions.keepOpen());

  useLayoutEffect(
    () =>
      watchOpenFile(
        memory.current,
        () => keepOpen(),
        (why) => closeFromWatch(why),
        document,
        window,
      ),
    [],
  );

  return <FileClosing value={() => close("pressed")}>{children}</FileClosing>;
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
