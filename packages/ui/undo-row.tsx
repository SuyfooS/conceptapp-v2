"use client";

import { useLocale, useTranslations } from "next-intl";
import { type Ref, useEffect, useId, useRef } from "react";
import { announce } from "./announcer";
import { Button } from "./button";
import { cn } from "./cn";
import { type FocusCandidate, onScreen } from "./focus-after";
import { useFocusWhenGone } from "./use-focus-after";
import { useUndoWait } from "./use-undo-wait";

export type UndoRowProps = {
  /** What was just removed or changed, in a short sentence. */
  message: string;
  onUndo: () => void;
  /** The way back is on its way: the button spins and waits. */
  pending?: boolean;
  /**
   * "ביטול" takes the focus as it appears: for when what was pressed went
   * with what it removed.
   */
  autoFocus?: boolean;
  /**
   * Says nothing as it appears: for a row the screen brings the focus to
   * itself (a sheet's `returnFocus`), whose focus says its words.
   */
  quiet?: boolean;
  /**
   * Hears when the way back is being reached (the rule of `@ui/undo-wait`)
   * and when it is left: a held write can pause as long.
   */
  onWaitingChange?: (waiting: boolean) => void;
  /**
   * Where the focus goes when the row goes while it holds it (undone, or its
   * time up), in order; the page's title after them.
   */
  focusAfter?: () => readonly FocusCandidate[];
  /** Its button, for a screen that brings the focus there (a sheet's `returnFocus`). */
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
};

/**
 * What was just removed, with the way back, where the person is looking.
 * A status a screen's checks find by its role, said once as it appears,
 * through the page's announcer (a status drawn with its words already in it
 * is often not heard), unless its own focus says it. Its button is
 * described by its words ("ביטול, נועה כהן הוסרה מהצוות"), its way back
 * waits while it is being reached, and when it goes holding the focus the
 * focus goes where the screen says (`focusAfter`), else to the page's title.
 */
export function UndoRow({
  message,
  onUndo,
  pending = false,
  autoFocus = false,
  quiet = false,
  onWaitingChange,
  focusAfter,
  buttonRef,
  className,
}: UndoRowProps) {
  const t = useTranslations("ui.undoRow");
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const messageId = useId();
  const { handlers } = useUndoWait(root, onWaitingChange);
  useFocusWhenGone(root, focusAfter);
  /**
   * The words last said: a screen shown again from a hidden <Activity>
   * says nothing new, and neither do the same words drawn again.
   */
  const said = useRef<string | null>(null);

  useEffect(() => {
    if (said.current === message) return;
    said.current = message;
    if (quiet) return;
    const row = root.current;
    // The other shape of a two-shape screen, hidden, says nothing; nor
    // does one whose focus came in with it (`autoFocus`) and says it.
    if (!row || !onScreen(row) || row.contains(document.activeElement)) return;
    announce(message, { lang: locale });
  }, [message, quiet, locale]);

  return (
    <div
      ref={root}
      role="status"
      // Said through the page's announcer instead, once. Its own aria-live
      // also keeps it out of what a sheet hides, so it can be reached as
      // the sheet closes.
      aria-live="off"
      {...handlers}
      className={cn(
        "flex min-h-[3.25rem] items-center justify-between gap-3 rounded-card bg-surface-2 ps-4 pe-1.5",
        className,
      )}
    >
      <span id={messageId} className="min-w-0 text-base">
        {message}
      </span>
      <Button
        ref={buttonRef}
        variant="ghost"
        loading={pending}
        onClick={onUndo}
        autoFocus={autoFocus}
        aria-describedby={messageId}
        className="shrink-0"
      >
        {t("undo")}
      </Button>
    </div>
  );
}
