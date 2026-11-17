"use client";

import { pastRequestsFor } from "@domain/swaps";
import { cn } from "@ui/cn";
import { PageSection } from "@ui/page";
import { useTranslations } from "next-intl";
import { DayTile } from "./day-tile";
import { personRow } from "./shift-sheet";
import { dayLabel, ltr, pastRequestLine, type ShiftData } from "./shift-text";

/**
 * "מה קרה לבקשות שלך": what became of the requests the person asked for or
 * took that no longer wait, on shifts from today on, the newest on each
 * shift (`pastRequestsFor`), with the shift each asked for, which outlives
 * the shift. The same rows on every device. Statuses only, so nothing to
 * press: giving a shift away again is on the shift itself. Nothing when
 * there are none.
 */
export function PastRequests({ data }: { data: ShiftData }) {
  const t = useTranslations("app");
  const past = pastRequestsFor(
    data.endedSwaps,
    data.swaps,
    data.userId,
    data.today,
  );
  if (past.length === 0) return null;
  const title = t("shifts.past.title");
  return (
    <PageSection title={title}>
      <ul
        aria-label={title}
        className="m-0 list-none overflow-hidden rounded-card bg-surface p-0 shadow-card"
      >
        {past.map((item) => {
          const { shift } = item.swap;
          return (
            <li
              key={item.swap.id}
              className={cn(personRow, "items-start py-3.5")}
            >
              <DayTile date={shift.day} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* Nothing here went wrong, so nothing is in danger's colour. */}
                <span
                  className={cn(
                    "font-medium",
                    item.swap.outcome === "approved" ? "text-success" : null,
                  )}
                >
                  {pastRequestLine(t, data, item)}
                </span>
                <span className="text-ink-2 text-sm">
                  {dayLabel(t, shift.day)}
                </span>
                <span className="text-ink-2 text-sm">
                  {t.rich("shifts.mine.line", {
                    name: shift.name,
                    start: shift.start,
                    end: shift.end,
                    ltr,
                  })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
