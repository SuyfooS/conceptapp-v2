/**
 * A press of a month's arrows in the hours card (`MonthHero`), kept until
 * the month it leads to is drawn (accessibility, part 5). The month is in
 * the address, so each month is a page of its own: the arrow pressed goes
 * with the page it was on, and the new page says the month and its hours
 * and puts the focus back on the same arrow, or on the month's title when
 * that arrow is gone (the month it is now has no "חודש הבא"). No React here.
 */

/** Which arrow: to the month before, or the one after. */
export type MonthWay = "earlier" | "later";

export type MonthPress = {
  /** The card's list (`MonthHero`'s `countId`): the history, the team, a person. */
  list: string;
  /** The month the press leads to, `YYYY-MM`. */
  month: string;
  way: MonthWay;
  /** When it was pressed, in milliseconds. */
  at: number;
};

/**
 * How long a press waits for its month: a page that comes later than this
 * (or never, the press opened a new tab) came by some other way, and takes
 * no focus.
 */
export const MONTH_PRESS_MS = 15_000;

/** Whether a link's `data-month-way` is one of the two arrows. */
export function monthWay(value: string | null | undefined): MonthWay | null {
  return value === "earlier" || value === "later" ? value : null;
}

/** The presses of a page: the last one, taken once by the month it led to. */
export function createMonthPresses(now: () => number = Date.now) {
  let last: MonthPress | null = null;
  return {
    note(press: Omit<MonthPress, "at">) {
      last = { ...press, at: now() };
    },
    /**
     * The press that led to `month` of `list`, if it is the last one and
     * recent: taken, so the same page drawn again (shown again after another
     * month) never takes it twice. Anything else is left as it is.
     */
    take(list: string, month: string): MonthPress | null {
      const press = last;
      if (!press || press.list !== list || press.month !== month) return null;
      last = null;
      return now() - press.at <= MONTH_PRESS_MS ? press : null;
    },
  };
}
