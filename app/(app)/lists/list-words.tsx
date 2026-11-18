import { dateIn } from "@domain/availability";
import { dayMonth } from "@domain/availability-form";
import {
  fixedAfterClose,
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
    case "role": {
      // A role the business named, by its name; its base's words if it is
      // one the reader can't name.
      const name = holder.namedRole && lookups.roles[holder.namedRole];
      if (name) {
        return to
          ? t("card.to.namedRole", { name })
          : t("card.for.namedRole", { name });
      }
      return to
        ? t("card.to.role", { role: holder.role })
        : t("card.for.role", { role: holder.role });
    }
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
 * Until when someone given "תיקון רשימות שנסגרו" may still fix a closed list
 * (L6b-2): "אפשר לתקן עד 08:05", with its day when that isn't today.
 */
export function fixUntilWords(
  t: T,
  until: string,
  now: Date,
  timeZone: string,
): ReactNode {
  const { time, date } = timeAndDay(until, now, timeZone);
  return date === null
    ? t.rich("list.fix.until", { time, ltr })
    : t.rich("list.fix.untilOn", { time, date, ltr });
}

/**
 * When that window ended, for someone given "תיקון רשימות שנסגרו" whose
 * time is over (L6b-2), and who still fixes it: "הזמן לתקן את הרשימה נגמר
 * ב-08:05. מי שעורך את הרשימות עדיין יכול לתקן אותה.", with its day when
 * that wasn't today.
 */
export function fixOverWords(
  t: T,
  ended: string,
  now: Date,
  timeZone: string,
): ReactNode {
  const { time, date } = timeAndDay(ended, now, timeZone);
  return date === null
    ? t.rich("list.fix.over", { time, ltr })
    : t.rich("list.fix.overOn", { time, date, ltr });
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

/**
 * How a closed list ended: who finished it and when, with its day when that
 * wasn't today (yesterday's list, still to fix, beside today's of the same
 * name: "נסגרה ב-2.11, 08:20 על ידי נועה"), missed, cancelled. A list fixed
 * after it was finished (L6b-1) says when, after who closed it, with the day
 * when the fix wasn't on the day it closed: "נסגרה ב-08:05 על ידי נועה ·
 * תוקנה ב-14:20".
 */
export function closedWords(
  t: T,
  list: Pick<ListSummary, "status" | "finishedAt" | "finishedBy" | "fixedAt">,
  lookups: ListLookups,
  timeZone: string,
  now: Date,
): ReactNode {
  const ended: Record<Exclude<ListStatus, "open" | "finished">, string> = {
    missed: t("card.missed"),
    cancelled: t("card.cancelled"),
  };
  if (list.status === "open") return null;
  if (list.status !== "finished") return ended[list.status];
  if (!list.finishedAt) return t("card.finished");
  const finished = new Date(list.finishedAt);
  const name = personName(t, lookups, list.finishedBy);
  const at = timeAndDay(list.finishedAt, now, timeZone);
  const closed =
    at.date === null
      ? t.rich("card.finishedBy", { time: at.time, name, ltr })
      : t.rich("card.finishedByOn", {
          time: at.time,
          date: at.date,
          name,
          ltr,
        });
  if (!list.fixedAt || !fixedAfterClose(list.fixedAt, list)) return closed;
  const fixed = new Date(list.fixedAt);
  const time = timeIn(fixed, timeZone);
  const day = dateIn(fixed, timeZone);
  return (
    <>
      {closed}
      {" · "}
      {day === dateIn(finished, timeZone)
        ? t.rich("card.fixed", { time, ltr })
        : t.rich("card.fixedOn", { time, date: dayMonth(day), ltr })}
    </>
  );
}

/** "3 of 6". */
export function progressWords(
  t: T,
  progress: { done: number; total: number },
): string {
  return t("card.progress", { done: progress.done, total: progress.total });
}
