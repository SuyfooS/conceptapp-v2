"use server";

import { type LockResult, stationName } from "@domain/clock-station";

// The demo's stand-in for locking a device: the same check on the name,
// nothing stored and nobody signed out, and on to the station's twin.
export async function demoLockDevice(input: {
  name: string;
}): Promise<LockResult> {
  return stationName.safeParse(input.name).success
    ? { ok: true, to: "/design/shell/station" }
    : { ok: false, failure: "name" };
}
