"use server";

import {
  type LockResult,
  type StationStopResult,
  stationName,
} from "@domain/clock-station";

const BASE = "/design/order-taking/station";

// The demo's stand-ins for locking a device as the kitchen's screen or the
// till (waiter mode P8a): the same check on the name, nothing stored and
// nobody signed out, and on to the screen's twin, the kitchen's of every
// department when none was chosen. Its screens pass `clearsDevice: false`,
// so the device's own orders stay.
export async function demoLockOrderDevice(input: {
  name: string;
  department?: string | null;
  shows?: "prep" | "till";
}): Promise<LockResult> {
  if (!stationName.safeParse(input.name).success) {
    return { ok: false, failure: "name" };
  }
  if (input.shows === "till") {
    return { ok: true, to: `${BASE}/till?state=service` };
  }
  return {
    ok: true,
    to: `${BASE}/prep?state=${input.department === null ? "allDepartments" : "service"}`,
  };
}

// Stopping a screen and its "ביטול", on the twin: nothing stored, and the
// list keeps what it was told in memory.
export async function demoStopOrderStation(
  _station: string,
): Promise<StationStopResult> {
  return { ok: true };
}

export async function demoRestartOrderStation(
  _station: string,
): Promise<StationStopResult> {
  return { ok: true };
}
