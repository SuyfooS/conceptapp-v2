import { addMonths } from "@domain/time-clock-format";
import { Card } from "@ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HoursCount } from "./hours-count";

/**
 * A month's total on the business's colour, with the way to the months around
 * it. `overlap` leaves room for a list to rise over its lower edge.
 */
export function MonthHero({
  month,
  currentMonth,
  hrefFor,
  minutes,
  caption,
  countId,
  overlap = false,
}: {
  /** `YYYY-MM`. */
  month: string;
  /** The month it is now: there is nothing after it. */
  currentMonth: string;
  hrefFor: (month: string) => string;
  minutes: number;
  caption: ReactNode;
  /** Names the total, so it counts from the last month shown of the same list. */
  countId: string;
  overlap?: boolean;
}) {
  const t = useTranslations("app.clock.history");
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
      <div className="flex items-center justify-between gap-2">
        <MonthLink
          href={hrefFor(earlier)}
          label={t("earlier", { month: monthName(earlier) })}
          icon={<ChevronRight className="size-5 ltr:-scale-x-100" />}
        />
        <h2 className="font-semibold text-md">{monthName(month)}</h2>
        {month < currentMonth ? (
          <MonthLink
            href={hrefFor(later)}
            label={t("later", { month: monthName(later) })}
            icon={<ChevronLeft className="size-5 ltr:-scale-x-100" />}
          />
        ) : (
          <span className="size-11" />
        )}
      </div>
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

function MonthLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-accent-press focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
    >
      {icon}
    </Link>
  );
}
