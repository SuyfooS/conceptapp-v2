"use server";

import { type LockResult, stationName } from "@domain/clock-station";
import type { SignedOut } from "../../../sign-out-form";

// The demo's stand-in for locking a device: the same check on the name,
// nothing stored and nobody signed out, and on to the station's twin. Its
// screens pass `clearsDevice: false`, so the device's own orders stay.
export async function demoLockDevice(input: {
  name: string;
}): Promise<LockResult> {
  return stationName.safeParse(input.name).success
    ? { ok: true, to: "/design/shell/station" }
    : { ok: false, failure: "name" };
}

// The demo's stand-in for signing out on the station's card: nobody signed
// out, and on to the station's twin, as the device goes back to its code.
// Nobody is named, so nothing of anyone's on the phone is asked about or
// goes but what expired.
export async function demoSignOutOfStation(): Promise<SignedOut> {
  return { to: "/design/shell/station", user: null };
}
