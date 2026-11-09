import { type ListSummary, listState } from "@domain/lists";
import { Badge } from "@ui/badge";
import { cn } from "@ui/cn";
import { ProgressRing } from "@ui/progress-ring";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Translator } from "../wording";
import type { ListLookups, ListsTiming } from "./list-types";
import {
  closedWords,
  dueChip,
  dueWords,
  fromWords,
  holderWords,
  openedWords,
  progressWords,
} from "./list-words";

type T = Translator<"app.lists">;

export type ListShown = {
  t: T;
  lookups: ListLookups;
  userId: string;
  now: Date;
  timeZone: string;
  timing: ListsTiming;
  /** Where a list's screen is, inside the demo or the app. */
  href: (id: string) => string;
};

/**
 * One list as a card: its progress as a ring, its name, who it is for and who
 * asked, and by when, or how it closed. The whole card leads to the list.
 */
export function ListCard({
  list,
  shown,
  className,
}: {
  list: ListSummary;
  shown: ListShown;
  className?: string;
}) {
  const { t, lookups, userId, now, timeZone, timing } = shown;
  const chip = dueChip(t, list, now, timeZone, timing);
  const from = fromWords(t, list, lookups);
  const closed =
    list.status === "open" ? null : closedWords(t, list, lookups, timeZone);
  return (
    <Link
      href={shown.href(list.id)}
      className={cn(
        "pressable flex min-h-[5.5rem] items-center gap-4 rounded-card bg-surface p-4 shadow-card",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
        className,
      )}
    >
      <ProgressRing
        value={list.progress.done}
        max={list.progress.total}
        className="size-12"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-md text-ink">{list.name}</span>
        <span className="text-ink-2 text-sm">
          {holderWords(t, list.holder, lookups, userId)}
          {from ? ` · ${from}` : null}
        </span>
        <span className="text-ink-2 text-sm">
          {closed ?? progressWords(t, list.progress)}
        </span>
      </span>
      {chip ? (
        <Badge tone={chip.tone} className="shrink-0">
          {chip.label}
        </Badge>
      ) : null}
      <ChevronRight
        aria-hidden="true"
        className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
      />
    </Link>
  );
}

const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-4 py-3 align-middle";

/**
 * Lists as a table, for a computer: the same words, one column each. By when
 * has its own column, in the warning colour once it is near or late; the
 * status says open, late, or how it closed.
 */
export function ListTable({
  lists,
  shown,
  caption,
}: {
  lists: readonly ListSummary[];
  shown: ListShown;
  caption: string;
}) {
  const { t, lookups, userId, now, timeZone, timing } = shown;
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <table className="w-full border-collapse text-base">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t("columns.list")}
            </th>
            <th scope="col" className={th}>
              {t("columns.for")}
            </th>
            <th scope="col" className={th}>
              {t("columns.from")}
            </th>
            <th scope="col" className={th}>
              {t("columns.opened")}
            </th>
            <th scope="col" className={th}>
              {t("columns.due")}
            </th>
            <th scope="col" className={th}>
              {t("columns.progress")}
            </th>
            <th scope="col" className={th}>
              {t("columns.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {lists.map((list) => {
            const chip = dueChip(t, list, now, timeZone, timing);
            const due = list.dueAt
              ? dueWords(t, list.dueAt, now, timeZone)
              : null;
            return (
              <tr key={list.id}>
                <td className={td}>
                  <Link
                    href={shown.href(list.id)}
                    className="-my-2 flex min-h-11 items-center gap-3 rounded-[10px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ProgressRing
                      value={list.progress.done}
                      max={list.progress.total}
                      className="size-8"
                    />
                    {list.name}
                  </Link>
                </td>
                <td className={cn(td, "text-ink-2")}>
                  {holderWords(t, list.holder, lookups, userId)}
                </td>
                <td className={cn(td, "text-ink-2")}>
                  {fromWords(t, list, lookups) ?? "—"}
                </td>
                <td className={cn(td, "text-ink-2")}>
                  <span dir="ltr">{openedWords(list, now, timeZone)}</span>
                </td>
                <td className={cn(td, "text-ink-2")}>
                  {due === null ? (
                    "—"
                  ) : chip?.tone === "warning" ? (
                    <Badge tone="warning">{due}</Badge>
                  ) : (
                    due
                  )}
                </td>
                <td className={cn(td, "text-ink-2")}>
                  {progressWords(t, list.progress)}
                </td>
                <td className={td}>
                  {list.status === "open" ? (
                    listState(list, now, timing) === "late" ? (
                      <Badge tone="warning">{t("card.late")}</Badge>
                    ) : (
                      <span className="text-ink-2">{t("card.open")}</span>
                    )
                  ) : (
                    <span className="text-ink-2">
                      {closedWords(t, list, lookups, timeZone)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
