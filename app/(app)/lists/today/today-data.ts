import type { ListReading } from "@db/lists";
import { addDays, dateIn } from "@domain/availability";
import {
  byUrgency,
  type ListSummary,
  type ListTemplate,
  listState,
  type SchedulePlaces,
  scheduleGone,
} from "@domain/lists";
import type {
  DayFlags,
  DayReading,
  ListLookups,
  ListsTiming,
  ListsTodayData,
  SendWay,
  WeekReadings,
} from "../list-types";

/** How many days the overview's history reaches back, today included. */
export const HISTORY_DAYS = 7;

/** The overview's week, oldest first, ending today. */
export function overviewWeek(today: string): string[] {
  return Array.from({ length: HISTORY_DAYS }, (_, at) =>
    addDays(today, at - (HISTORY_DAYS - 1)),
  );
}

/**
 * The manager's overview of a day from what was read, the same for the app
 * (under RLS) and the demo: the day's lists by where they stand, the day's
 * readings and the week's, what each day of the week has to look at, and
 * the templates whose times open nothing since what they follow is gone.
 * `current` is today's: every open list, whenever it opened, and the day's
 * closed ones; a past day is the week's lists that opened on it.
 */
export function listsTodayData({
  now,
  timeZone,
  timing,
  lookups,
  userId,
  day,
  week,
  current,
  weekLists,
  readings,
  templates,
  places,
  send,
  viewOnly,
}: {
  now: Date;
  timeZone: string;
  timing: ListsTiming;
  lookups: ListLookups;
  userId: string;
  day: string;
  week: readonly string[];
  current: readonly ListSummary[] | null;
  weekLists: readonly ListSummary[];
  readings: readonly ListReading[];
  /** The business's templates, with their times, and its live places. */
  templates: readonly ListTemplate[];
  places: SchedulePlaces;
  send: SendWay | null;
  viewOnly: boolean;
}): ListsTodayData {
  const today = dateIn(now, timeZone);
  const dayOf = (list: ListSummary) => dateIn(new Date(list.opensAt), timeZone);
  const shown =
    day === today && current
      ? [...current]
      : weekLists.filter((list) => dayOf(list) === day);
  const open = byUrgency(
    shown.filter((list) => list.status === "open"),
    now,
    timing,
  );
  const late = open.filter((list) => listState(list, now, timing) === "late");
  const closedAt = (list: ListSummary) =>
    Date.parse(list.finishedAt ?? list.closedAt ?? list.opensAt);

  const byId = new Map([...weekLists, ...shown].map((list) => [list.id, list]));
  const shownIds = new Set(shown.map((list) => list.id));
  const dayReadings: DayReading[] = readings
    .flatMap((r) => {
      const list = byId.get(r.listId);
      return r.reading === null || !list || !shownIds.has(r.listId)
        ? []
        : [
            {
              listId: r.listId,
              listName: list.name,
              label: r.label,
              unit: r.unit,
              min: r.min,
              max: r.max,
              reading: r.reading,
              doneAt: r.doneAt,
              doneBy: r.doneBy,
              outOfRange: r.outOfRange,
            },
          ];
    })
    .sort(
      (a, b) =>
        Number(b.outOfRange) - Number(a.outOfRange) ||
        (a.doneAt ?? "").localeCompare(b.doneAt ?? ""),
    );

  // The week's number items, a row each: a template's item across its lists.
  const rows = new Map<string, WeekReadings>();
  for (const r of readings) {
    const list = byId.get(r.listId);
    if (!list || r.reading === null || !week.includes(dayOf(list))) continue;
    const key = r.templateItemId ?? r.itemId;
    const row = rows.get(key) ?? {
      key,
      label: r.label,
      listName: list.name,
      unit: r.unit,
      min: r.min,
      max: r.max,
      days: Object.fromEntries(week.map((d) => [d, null])),
    };
    // The last reading of a day stands for it.
    row.days[dayOf(list)] = { reading: r.reading, outOfRange: r.outOfRange };
    rows.set(key, row);
  }

  // What each day of the week has to look at, by the day its lists opened.
  const weekFlags: Record<string, DayFlags> = {};
  const flag = (day: string, key: keyof DayFlags) => {
    if (!week.includes(day)) return;
    const flags = weekFlags[day] ?? { missed: 0, late: 0, outOfRange: 0 };
    flags[key] += 1;
    weekFlags[day] = flags;
  };
  for (const list of byId.values()) {
    if (list.status === "missed") flag(dayOf(list), "missed");
    else if (
      list.status === "open" &&
      listState(list, now, timing) === "late"
    ) {
      flag(dayOf(list), "late");
    }
  }
  for (const r of readings) {
    const list = byId.get(r.listId);
    if (list && r.reading !== null && r.outOfRange) {
      flag(dayOf(list), "outOfRange");
    }
  }

  return {
    now: now.toISOString(),
    timeZone,
    timing,
    lookups,
    userId,
    day,
    today: day === today,
    week: [...week],
    late,
    open: open.filter((list) => !late.includes(list)),
    closed: shown
      .filter(
        (list) => list.status === "finished" || list.status === "cancelled",
      )
      .sort((a, b) => closedAt(b) - closedAt(a)),
    missed: shown.filter((list) => list.status === "missed"),
    readings: dayReadings,
    weekReadings: [...rows.values()].sort(
      (a, b) =>
        a.listName.localeCompare(b.listName) || a.label.localeCompare(b.label),
    ),
    weekFlags,
    stopped: templates
      .filter(
        (t) =>
          t.archivedAt === null &&
          t.schedules.some(
            (s) =>
              s.active && scheduleGone(s, places.departments, places.shifts),
          ),
      )
      .map((t) => ({ id: t.id, name: t.name })),
    send,
    viewOnly,
  };
}
