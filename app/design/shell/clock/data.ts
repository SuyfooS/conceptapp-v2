import { timeIn } from "@domain/shabbat";
import { type ShiftRecord, UNDO_CLOCK_OUT_SECONDS } from "@domain/time-clock";
import type { ClockData } from "../../../(app)/clock/clock-types";

const HOUR = 3_600_000;
const ENTRY = "68000000-0000-4000-a000-000000000001";
const TIME_ZONE = "Asia/Jerusalem";

export const demoRecords: ShiftRecord[] = [
  {
    id: "68000000-0000-4000-a000-000000000011",
    date: "2026-11-05",
    in: "08:04",
    out: "16:10",
    minutes: 456,
    breakMinutes: 30,
    byManager: false,
    overdue: false,
  },
  {
    id: "68000000-0000-4000-a000-000000000012",
    date: "2026-11-04",
    in: "16:00",
    out: "23:42",
    minutes: 462,
    breakMinutes: 0,
    byManager: false,
    overdue: false,
  },
  {
    id: "68000000-0000-4000-a000-000000000013",
    date: "2026-11-02",
    in: "08:00",
    out: "16:00",
    minutes: 450,
    breakMinutes: 30,
    byManager: true,
    overdue: false,
  },
  {
    id: "68000000-0000-4000-a000-000000000014",
    date: "2026-11-01",
    in: "09:12",
    out: "15:30",
    minutes: 378,
    breakMinutes: 0,
    byManager: false,
    overdue: false,
  },
];

/** The screen in each of its states, the time running from now. */
export function demoClock(state: string | undefined, now: Date): ClockData {
  const at = (hoursAgo: number) =>
    new Date(now.getTime() - hoursAgo * HOUR).toISOString();
  const entry = {
    id: ENTRY,
    userId: "demo",
    clockIn: at(3.7),
    clockOut: null,
    source: "punch" as const,
  };
  const pause = {
    id: "68000000-0000-4000-a000-000000000002",
    startedAt: at(0.2),
    endedAt: null,
    unpaid: true,
  };
  const open =
    state === "working"
      ? { ...entry, breaks: [] }
      : state === "break"
        ? { ...entry, breaks: [pause] }
        : null;
  return {
    now: now.toISOString(),
    timeZone: TIME_ZONE,
    open,
    shift: {
      start: timeIn(new Date(at(4)), TIME_ZONE),
      end: timeIn(new Date(at(-4)), TIME_ZONE),
      from: at(4),
      to: at(-4),
    },
    scheduling: true,
    thisMonth: 86 * 60 + 30,
    lastMonth: 142 * 60 + 15,
    recent: demoRecords,
    undo:
      state === "left"
        ? {
            entryId: ENTRY,
            out: "16:04",
            minutes: 462,
            until: new Date(
              now.getTime() + UNDO_CLOCK_OUT_SECONDS * 1000,
            ).toISOString(),
          }
        : null,
    unpaidBreaks: true,
    canManage: true,
    team: { atWork: 2, overdue: state === "working" ? 0 : 1 },
    viewOnly: false,
  };
}
