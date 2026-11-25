"use client";

import { addMonths } from "@domain/time-clock-format";
import { announce } from "@ui/announcer";
import { focusFirst } from "@ui/focus-after";
import { useLocale } from "next-intl";
import { type ReactNode, useEffect, useRef } from "react";
import { createMonthPresses, monthWay } from "./month-press";

/** The page's presses of the hours card's arrows (`month-press.ts`). */
const presses = createMonthPresses();

/**
 * The hours card's row of arrows and month (`MonthHero`). A press of an
 * arrow is noted, and the month it leads to, drawn as a page of its own,
 * takes it: the focus, gone with the page the arrow was on, comes back to
 * the same arrow, so it can be pressed again, else to the month's title (the
 * month it is now has no "חודש הבא"); then `said`, the month and its hours,
 * is said through the page's announcer, or only the hours (`saidOnTitle`)
 * when the title took the focus and said the month itself. Only where the
 * focus was lost, and only once: the same month shown again later says
 * nothing.
 */
export function MonthRow({
  list,
  month,
  said,
  saidOnTitle,
  children,
}: {
  /** The card's list (`MonthHero`'s `countId`). */
  list: string;
  /** The month shown, `YYYY-MM`. */
  month: string;
  /** The month and its hours in words: "אוקטובר 2026: 12:30 שעות, 5 משמרות". */
  said: string;
  /**
   * The hours alone ("12:30 שעות, 5 משמרות"), for when the month's title has
   * the focus: it says the month as it takes it.
   */
  saidOnTitle: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const row = useRef<HTMLDivElement>(null);

  // A plain press of an arrow here: one that opens the month in another tab
  // or window leaves this page as it is.
  useEffect(() => {
    const root = row.current;
    if (!root) return;
    const pressed = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-month-way]")
          : null;
      const way = monthWay(link?.dataset.monthWay);
      if (!link || !way || !root.contains(link)) return;
      presses.note({
        list,
        month: addMonths(month, way === "earlier" ? -1 : 1),
        way,
      });
    };
    root.addEventListener("click", pressed);
    return () => root.removeEventListener("click", pressed);
  }, [list, month]);

  // Arrived by such a press: the focus first, then the words, which a focus
  // moved as they are said would cut off.
  useEffect(() => {
    const press = presses.take(list, month);
    if (!press) return;
    const root = row.current;
    const title = root?.querySelector("h2");
    const landed = focusFirst(
      [root?.querySelector(`[data-month-way="${press.way}"]`), title],
      { preventScroll: true },
    );
    announce(landed !== null && landed === title ? saidOnTitle : said, {
      lang: locale,
    });
  }, [list, month, said, saidOnTitle, locale]);

  return (
    <div ref={row} className="flex items-center justify-between gap-2">
      {children}
    </div>
  );
}
