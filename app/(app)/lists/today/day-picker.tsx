"use client";

import { cn } from "@ui/cn";
import { type WeekDay, WeekStrip } from "@ui/week-strip";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * The days of the overview's week in one line, today last: picking one opens
 * that day's lists (`hrefs`, by day), the history of the business's lists.
 * The day picked shows as picked at once, and the strip reads as busy until
 * its lists arrive.
 */
export function DayPicker({
  days,
  value,
  label,
  hrefs,
}: {
  days: WeekDay[];
  value: string;
  label: string;
  hrefs: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState(value);
  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "transition-opacity duration-150 motion-reduce:transition-none",
        pending && "opacity-70",
      )}
    >
      <WeekStrip
        days={days}
        value={pending ? picked : value}
        label={label}
        onChange={(day) => {
          const href = hrefs[day];
          if (!href || day === (pending ? picked : value)) return;
          setPicked(day);
          start(() => router.push(href));
        }}
      />
    </div>
  );
}
