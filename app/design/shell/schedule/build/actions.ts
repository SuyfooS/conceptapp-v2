"use server";

import { type ScheduledShift, sameShift } from "@domain/schedule";
import type { ScheduleState } from "../../../../(app)/schedule/build/actions";
import {
  meanwhileBasis,
  meanwhileNow,
  meanwhileShift,
  meanwhileSwapsNow,
} from "./demo";

// Stand-in for saving or publishing the schedule on the design demo: the form must
// hold a list of shifts, and nothing is stored. (The demo's people are
// not real accounts, so the full check with ids runs only in the app.)
export async function demoSaveSchedule(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  try {
    const shifts: unknown = JSON.parse(String(form.get("shifts") ?? ""));
    if (!Array.isArray(shifts)) return { failure: "invalid" };
  } catch {
    return { failure: "invalid" };
  }
  return {
    savedAt: new Date().toISOString(),
    published: form.get("intent") === "publish",
  };
}

// Stand-in for publishing the demo's published week (`?state=meanwhile`)
// while another manager approves Maya taking Noa's Sunday morning: as the
// database does (20261115000100_week_in_place.sql), a publish that changed
// or removed that morning from what it read before is refused (`weekMoved`)
// with the morning as it is now, and any other publish goes out. Nothing is
// stored.
export async function demoPublishMeanwhile(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  let shifts: ScheduledShift[];
  let basis: Record<string, string>;
  try {
    shifts = JSON.parse(String(form.get("shifts") ?? ""));
    basis = JSON.parse(String(form.get("basis") ?? ""));
    if (!Array.isArray(shifts) || typeof basis !== "object" || !basis) {
      return { failure: "invalid" };
    }
  } catch {
    return { failure: "invalid" };
  }
  const id = meanwhileShift.id;
  const sent = shifts.find((shift) => shift.id === id);
  // Read before the approval, and not sent as it was read.
  if (
    basis[id] === meanwhileBasis[id] &&
    !(sent && sameShift(sent, meanwhileShift))
  ) {
    return {
      failure: "weekMoved",
      moved: { shifts: [meanwhileNow], gone: [], swaps: meanwhileSwapsNow },
    };
  }
  return { savedAt: new Date().toISOString(), published: true };
}
