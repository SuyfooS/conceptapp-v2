"use client";

import { formatShekels, moneyLocale } from "@domain/money";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { StatusToast } from "@ui/status-toast";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import type { MenuActionFailure } from "./menu-types";

/*
 * What the menu's screens share (waiter mode P2): prices in an LTR span, the
 * line that says why a save didn't go through, and the toast with its way
 * back.
 */

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Agorot as the screen's language writes them ("62.00 ₪"), for an LTR span. */
export function useShekels() {
  const locale = moneyLocale(useLocale());
  return (agorot: number) => formatShekels(agorot, locale);
}

export function Price({
  agorot,
  className,
}: {
  agorot: number;
  className?: string;
}) {
  const shekels = useShekels();
  return (
    <span dir="ltr" className={cn("tabular-nums", className)}>
      {shekels(agorot)}
    </span>
  );
}

/**
 * Why a save didn't go through, held under the title where it is seen and
 * read out as it comes.
 */
export function FailureLine({
  failure,
}: {
  failure: MenuActionFailure | null;
}) {
  const t = useTranslations("app.orders.menu.failed");
  if (!failure) return null;
  return (
    <Card
      tone="float"
      padding="md"
      role="alert"
      className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 font-medium text-danger xl:top-4"
    >
      {t(failure)}
    </Card>
  );
}

type Toast = {
  text: string;
  stamp: number;
  undo: (() => void) | null;
  /** What it undoes went with the focus: the way back takes it. */
  focus: boolean;
};

/**
 * What just happened, and for what can be undone its "ביטול" for 8 seconds
 * rather than an "are you sure". When what was pressed went away with the
 * change (a sheet that closed on a removal), the keyboard's focus goes to the
 * way back, and after it to `after`.
 */
export function useUndoToast(after?: () => HTMLElement | null | undefined) {
  const t = useTranslations("app.orders.menu.toast");
  const [toast, setToast] = useState<Toast | null>(null);
  const then = useRef(after);
  then.current = after;
  function say(
    text: string,
    undo?: () => void,
    options: { focus?: boolean } = {},
  ) {
    setToast({
      text,
      stamp: Date.now(),
      undo: undo ?? null,
      focus: Boolean(undo && options.focus),
    });
  }
  const element = (
    <StatusToast
      message={toast?.text ?? null}
      stamp={toast ? String(toast.stamp) : undefined}
      duration={toast?.undo ? 8000 : 4000}
      action={
        toast?.undo
          ? {
              label: t("undo"),
              onClick: () => {
                toast.undo?.();
                setToast(null);
              },
            }
          : null
      }
      focusAction={toast?.focus ?? false}
      onFocusLeave={() => then.current?.()?.focus({ preventScroll: true })}
    />
  );
  return { say, toast: element };
}

/** The live categories and places rows a menu screen leads on with. */
export type MenuPaths = {
  back: { href: string; label: string };
  menu: string;
  categories: string;
  places: string;
  import: string;
  departments: string;
};
