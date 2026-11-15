"use server";

import { begunShifts } from "@domain/running-week";
import { type ScheduledShift, sameShift } from "@domain/schedule";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import type { ScheduleState } from "../../../../../(app)/schedule/build/actions";
import { SHOP_NOW, shopRunningShifts } from "./shop";

// Stand-in for publishing the shop's week under way on the design demo. As
// the database does (20261115000300_running_week.sql), a shift that had begun
// at the demo's moment and was read is refused when it is sent changed or
// left out (`shiftStarted`): the screen leaves what has begun out of both,
// and sends the people put on a shift under way apart, as `joins`. Anything
// else goes out. Nothing is stored. (The demo's people are not real
// accounts, so the full check with ids runs only in the app.)
export async function demoPublishRunning(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  let shifts: ScheduledShift[];
  let basis: Record<string, string>;
  try {
    shifts = JSON.parse(String(form.get("shifts") ?? ""));
    basis = JSON.parse(String(form.get("basis") ?? ""));
    const joins: unknown = JSON.parse(String(form.get("joins") ?? ""));
    if (
      !Array.isArray(shifts) ||
      !Array.isArray(joins) ||
      typeof basis !== "object" ||
      !basis
    ) {
      return { failure: "invalid" };
    }
  } catch {
    return { failure: "invalid" };
  }
  const begun = begunShifts(
    shopRunningShifts,
    true,
    new Date(SHOP_NOW),
    ISRAEL_TIME_ZONE,
  );
  const refused = shopRunningShifts.some((was) => {
    if (!begun.has(was.id) || !(was.id in basis)) return false;
    const sent = shifts.find((shift) => shift.id === was.id);
    return !sent || !sameShift(sent, was);
  });
  if (refused) return { failure: "shiftStarted" };
  return { savedAt: new Date().toISOString(), published: true };
}
