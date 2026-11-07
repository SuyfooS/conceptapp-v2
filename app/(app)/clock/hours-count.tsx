"use client";

import { formatHours } from "@domain/time-clock-format";
import { useCountUp } from "@ui/count-up";

/** Hours and minutes that run to their new value when it changes. */
export function HoursCount({
  minutes,
  id,
  className,
}: {
  minutes: number;
  /** Names this counter: the same across months, different between counters. */
  id: string;
  className?: string;
}) {
  const shown = useCountUp(minutes, id);
  return (
    <span dir="ltr" className={className}>
      {formatHours(shown)}
    </span>
  );
}
