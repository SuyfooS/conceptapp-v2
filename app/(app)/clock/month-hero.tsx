import { addMonths, formatHours } from "@domain/time-clock-format";
import { Card } from "@ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import type { Translator } from "../wording";
import { HoursCount } from "./hours-count";
import type { MonthWay } from "./month-press";
import { MonthRow } from "./month-row";

/**
 * A month's total on the business's colour, with the way to the months around
 * it. `overlap` leaves room for a list to rise over its lower edge. Pressing
 * an arrow keeps the focus on it in the month it leads to, or on that month's
 * title, and says the month and its hours (`MonthRow`).
 */
export function MonthHero({
  month,
  currentMonth,
  hrefFor,
  minutes,
  caption,
  countId,
  t,
  overlap = false,
}: {
  /** `YYYY-MM`. */
  month: string;
  /** The month it is now: there is nothing after it. */
  currentMonth: string;
  hrefFor: (month: string) => string;
  minutes: number;
  /** The words after the total ("שעות, 5 משמרות"), said with it too. */
  caption: string;
  /** Names the total, so it counts from the last month shown of the same list. */
  countId: string;
  /**
   * The words of app.clock.history: a server view builds them from the
   * business's words, a client one with useTranslations.
   */
  t: Translator<"app.clock.history">;
  overlap?: boolean;
}) {
  const format = useFormatter();
  const monthName = (value: string) =>
    format.dateTime(new Date(`${value}-15T12:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const earlier = addMonths(month, -1);
  const later = addMonths(month, 1);

  return (
    <Card
      tone="hero"
      padding="lg"
      className={overlap ? "pb-[76px]" : undefined}
    >
      <MonthRow
        list={countId}
        month={month}
        said={t("monthShown", {
          month: monthName(month),
          hours: formatHours(minutes),
          caption,
        })}
        saidOnTitle={t("monthHours", { hours: formatHours(minutes), caption })}
      >
        <MonthLink
          href={hrefFor(earlier)}
          label={t("earlier", { month: monthName(earlier) })}
          icon={<ChevronRight className="size-5 ltr:-scale-x-100" />}
          way="earlier"
        />
        <h2 className="font-semibold text-md">{monthName(month)}</h2>
        {month < currentMonth ? (
          <MonthLink
            href={hrefFor(later)}
            label={t("later", { month: monthName(later) })}
            icon={<ChevronLeft className="size-5 ltr:-scale-x-100" />}
            way="later"
          />
        ) : (
          <span className="size-11" />
        )}
      </MonthRow>
      <p className="mt-2 text-center">
        <HoursCount
          minutes={minutes}
          id={countId}
          className="block font-bold text-2xl tabular-nums"
        />
        <span className="text-base">{caption}</span>
      </p>
    </Card>
  );
}

export function MonthLink({
  href,
  label,
  icon,
  way,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  /**
   * Which arrow it is, for the hours card's row (`MonthRow`), which keeps
   * the focus on it in the month it leads to.
   */
  way?: MonthWay;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      data-month-way={way}
      className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-accent-press focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
    >
      {icon}
    </Link>
  );
}
