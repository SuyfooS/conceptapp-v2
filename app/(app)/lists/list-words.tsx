import { dateIn } from "@domain/availability";
import { dayMonth } from "@domain/availability-form";
import {
  type ListHolder,
  type ListStatus,
  type ListSummary,
  listState,
} from "@domain/lists";
import { timeIn } from "@domain/shabbat";
import type { ReactNode } from "react";
import type { Translator } from "../wording";
import type { ListLookups, ListsTiming } from "./list-types";

/**
 * A list as words, the same on Lists, on a list's own screen and on Today:
 * who it is for, who asked, by when, and how it closed. Times read left to
 * right inside the Hebrew.
 */

type T = Translator<"app.lists">;

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** A person's name as the business has it, or a word for nobody named. */
export function personName(
  t: T,
  lookups: ListLookups,
  userId: string | null,
): string {
  return (userId && lookups.people[userId]?.name) || t("noName");
}

/**
 * Who a list is for. `for` stands on its own, on a card or a details row:
 * "For you", "For the kitchen". `to` sits inside a sentence: "Sent by Shiran
 * to the kitchen" (the same "ל…" in Hebrew).
 */
export function holderWords(
  t: T,
  holder: ListHolder,
  lookups: ListLookups,
  userId: string,
  form: "for" | "to" = "for",
): string {
  const to = form === "to";
  switch (holder.kind) {
    case "person": {
      const [only] = holder.people;
      if (holder.people.length !== 1 || !only) {
        const count = holder.people.length;
        return to
          ? t("card.to.people", { count })
          : t("card.for.people", { count });
      }
      if (only === userId) return to ? t("card.to.you") : t("card.for.you");
      const name = personName(t, lookups, only);
      return to
        ? t("card.to.person", { name })
        : t("card.for.person", { name });
    }
    case "shift": {
      const count = holder.people.length;
      return to
        ? t("card.to.shift", { count })
        : t("card.for.shift", { count });
    }
    case "department": {
      const name =
        lookups.departments[holder.department] ?? t("card.aDepartment");
      return to
        ? t("card.to.department", { name })
        : t("card.for.department", { name });
    }
    case "role":
      return to
        ? t("card.to.role", { role: holder.role })
        : t("card.for.role", { role: holder.role });
  }
}

/** "The list went to the kitchen", for the words after sending. */
export function sentWords(
  t: T,
  holder: ListHolder,
  lookups: ListLookups,
  userId: string,
): string {
  return t("send.sent", { to: holderWords(t, holder, lookups, userId, "to") });
}

/** The department that asked for it, on an order. */
export function fromWords(
  t: T,
  list: Pick<ListSummary, "fromDepartment">,
  lookups: ListLookups,
): string | null {
  if (!list.fromDepartment) return null;
  const name = lookups.departments[list.fromDepartment];
  return name ? t("card.from", { name }) : null;
}

/** An instant's time and, when it isn't today, its day. */
function timeAndDay(instant: string, now: Date, timeZone: string) {
  const at = new Date(instant);
  const day = dateIn(at, timeZone);
  return {
    time: timeIn(at, timeZone),
    date: day === dateIn(now, timeZone) ? null : dayMonth(day),
  };
}

/** By when a list is due, as words: "עד 09:30", with its day if not today. */
export function dueWords(
  t: T,
  dueAt: string,
  now: Date,
  timeZone: string,
): ReactNode {
  const { time, date } = timeAndDay(dueAt, now, timeZone);
  return date === null
    ? t.rich("card.due", { time, ltr })
    : t.rich("card.dueOn", { time, date, ltr });
}

/**
 * By when an open list is due: a chip, louder once it's near or late. Late,
 * it still says by when, so a phone, which has no due column, keeps the time.
 */
export function dueChip(
  t: T,
  list: Pick<ListSummary, "status" | "dueAt">,
  now: Date,
  timeZone: string,
  timing: ListsTiming,
): { tone: "neutral" | "warning"; label: ReactNode } | null {
  if (list.status !== "open" || list.dueAt === null) return null;
  const state = listState(list, now, timing);
  if (state === "late") {
    const { time, date } = timeAndDay(list.dueAt, now, timeZone);
    return {
      tone: "warning",
      label:
        date === null
          ? t.rich("card.lateDue", { time, ltr })
          : t.rich("card.lateDueOn", { time, date, ltr }),
    };
  }
  return {
    tone: state === "dueSoon" ? "warning" : "neutral",
    label: dueWords(t, list.dueAt, now, timeZone),
  };
}

/** When a list opened: its time, with its day when that wasn't today. */
export function openedWords(
  list: Pick<ListSummary, "opensAt">,
  now: Date,
  timeZone: string,
): string {
  const { time, date } = timeAndDay(list.opensAt, now, timeZone);
  return date === null ? time : `${date}, ${time}`;
}

/** How a closed list ended: who finished it and when, missed, cancelled. */
export function closedWords(
  t: T,
  list: Pick<ListSummary, "status" | "finishedAt" | "finishedBy">,
  lookups: ListLookups,
  timeZone: string,
): ReactNode {
  const ended: Record<Exclude<ListStatus, "open" | "finished">, string> = {
    missed: t("card.missed"),
    cancelled: t("card.cancelled"),
  };
  if (list.status === "open") return null;
  if (list.status !== "finished") return ended[list.status];
  return list.finishedAt
    ? t.rich("card.finishedBy", {
        time: timeIn(new Date(list.finishedAt), timeZone),
        name: personName(t, lookups, list.finishedBy),
        ltr,
      })
    : t("card.finished");
}

/** "3 of 6". */
export function progressWords(
  t: T,
  progress: { done: number; total: number },
): string {
  return t("card.progress", { done: progress.done, total: progress.total });
}
