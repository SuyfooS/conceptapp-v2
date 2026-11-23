"use client";

import { useLocale, useTranslations } from "next-intl";
import { type Ref, useEffect, useId, useRef, useState } from "react";
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
 * Whether the page's announcer says an UndoRow's words as it first
 * appears: not when `quiet`, not from a shape of the screen that isn't
 * drawn (the other shape of a two-shape screen), and not when the focus
 * came in with it (`autoFocus`, `active` inside it) and says them.
 */
export function saidAsItAppears(
  row: unknown,
  { quiet, active }: { quiet: boolean; active: unknown },
): boolean {
  return !quiet && onScreen(row) && !row.contains(active as Node | null);
}

/**
 * What was just removed, with the way back, where the person is looking.
 * A status a screen's checks find by its role. As it appears it is said
 * once, through the page's announcer (a status drawn with its words already
 * in it is often not heard), unless its own focus says it; from then on it
 * is a status of its own, so a change of its words (a way back that failed)
 * is heard wherever the focus is. Its button is described by its words
 * ("ביטול, נועה כהן הוסרה מהצוות"), its way back waits while it is being
 * reached, and when it goes holding the focus the focus goes where the
 * screen says (`focusAfter`), else to the page's title.
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
   * It has appeared: said by then if it was to be. A ref, so a screen shown
   * again from a hidden <Activity>, or React's second run of the effect in
   * dev, says nothing new.
   */
  const appeared = useRef(false);
  // Its own status from its first effect on: quiet until then.
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (appeared.current) return;
    appeared.current = true;
    setLive(true);
    const active = document.activeElement;
    if (saidAsItAppears(root.current, { quiet, active })) {
      announce(message, { lang: locale });
    }
  }, [message, quiet, locale]);

  return (
    <div
      ref={root}
      role="status"
      // Quiet as it appears, said then through the page's announcer. Then
      // its role's own: a change of its words is heard, and with no
      // aria-live of its own, a sheet opened over it hides it with the rest
      // of the page (Radix spares what has one).
      aria-live={live ? undefined : "off"}
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
