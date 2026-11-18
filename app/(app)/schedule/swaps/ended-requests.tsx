"use client";

import type { EndedSwap } from "@domain/swaps";
import { Avatar } from "@ui/avatar";
import { cn } from "@ui/cn";
import { useTranslations } from "next-intl";
import {
  dayLabel,
  endedRequestLine,
  nameOf,
  photoOf,
  type ShiftData,
  timeRange,
} from "../shifts/shift-text";

type Names = Pick<ShiftData, "people">;

const th = "px-4 py-3 text-start align-bottom font-medium text-ink-2 text-sm";
const td = "px-4 py-3 align-middle";

/**
 * "כבר לא מחכות להחלטה": the requests a colleague took that were decided or
 * cancelled since, from today on (`noLongerWaiting`), so a decision made
 * here, or elsewhere, is still in sight after the screen is read again. As
 * the waiting ones: phone, one card under the other; tablet, two columns;
 * desktop, a table. Statuses only, nothing to press.
 */
export function EndedRequests({
  rows,
  names,
  viewer,
}: {
  rows: readonly EndedSwap[];
  names: Names;
  /** The person reading, for "אישרת". */
  viewer: string;
}) {
  const t = useTranslations("app");
  const title = t("swaps.ended.title");
  const columns = ["day", "shift", "from", "to", "outcome"] as const;
  const person = (userId: string | null) => {
    const name = nameOf(t, names, userId);
    return (
      <span className="flex items-center gap-2.5">
        <Avatar name={name} photo={photoOf(names, userId)} size="sm" />
        <span className="min-w-0 font-medium">{name}</span>
      </span>
    );
  };
  const outcome = (swap: EndedSwap) =>
    cn("font-medium", swap.outcome === "approved" ? "text-success" : null);

  return (
    <section className="mt-4 flex flex-col gap-4">
      <h2 className="px-1 font-bold text-lg">{title}</h2>
      <ul
        aria-label={title}
        className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4 xl:hidden"
      >
        {rows.map((swap) => (
          <li
            key={swap.id}
            className="flex min-w-0 flex-col gap-1 rounded-[28px] bg-surface p-4 shadow-card"
          >
            <h3 className="font-bold text-lg">{dayLabel(t, swap.shift.day)}</h3>
            <p className="text-base text-ink-2">
              {swap.shift.name} · {timeRange(t, swap.shift)}
            </p>
            <p className="text-base text-ink-2">
              {t("swaps.people", {
                from: nameOf(t, names, swap.requestedBy),
                to: nameOf(t, names, swap.takenBy),
              })}
            </p>
            <p className={cn("pt-1 text-base", outcome(swap))}>
              {endedRequestLine(t, names, swap, viewer)}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-card bg-surface shadow-card xl:block">
        <table className="w-full border-collapse text-base">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className={th}>
                  {t(`swaps.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((swap) => (
              <tr key={swap.id} className="border-line border-t">
                <th scope="row" className={cn(td, "text-start font-medium")}>
                  {dayLabel(t, swap.shift.day)}
                </th>
                <td className={td}>
                  {swap.shift.name}
                  <span className="block text-ink-2 text-sm">
                    {timeRange(t, swap.shift)}
                  </span>
                </td>
                <td className={td}>{person(swap.requestedBy)}</td>
                <td className={td}>{person(swap.takenBy)}</td>
                <td className={cn(td, outcome(swap))}>
                  {endedRequestLine(t, names, swap, viewer)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
