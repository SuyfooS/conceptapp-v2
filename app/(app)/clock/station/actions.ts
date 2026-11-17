"use server";

import { lockStation } from "@db/clock-stations";
import { type LockResult, stationName } from "@domain/clock-station";
import { editsClock } from "@domain/time-clock";
import { z } from "zod";
import { signOut } from "../../../(auth)/actions";
import { currentModuleSettings } from "../../modules";
import { clockAccess } from "../clock";
import { deviceStation, rememberStation, STATION_PATH } from "./station";

const lockInput = z.object({ name: z.string() });

/**
 * Lock the device the person is on into the business's clock station (Orel,
 * 17 November 2026): it shows only the clock's code from now on, and nobody's
 * account. Whoever edits the clock, as themselves, where codes may show on a
 * station; the database checks the actor again. A device that is one of the
 * business's running stations already stays that one, so locking again never
 * piles stations up. Then it signs out here only, as signing out does (its
 * device, its business, its session; the person's own phone stays signed
 * in), and answers /station, which the screen opens as a whole new page, so
 * nothing of the person's screens stays on the device.
 */
export async function lockDeviceAction(input: unknown): Promise<LockResult> {
  const parsed = lockInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "name" };
  const access = await clockAccess();
  if (!access || !editsClock(access)) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const settings = await currentModuleSettings("time_clock");
  if (settings.codeDisplay === "manager") {
    return { ok: false, failure: "managerOnly" };
  }

  let device: Awaited<ReturnType<typeof deviceStation>> = null;
  try {
    device = await deviceStation();
  } catch (error) {
    // Unread, it gets a new station: locking still works.
    console.error(
      "reading this device's station failed",
      (error as Error).message,
    );
  }
  let token: string;
  if (
    device &&
    !device.station.stopped &&
    device.station.businessId === access.businessId
  ) {
    token = device.token;
  } else {
    const name = stationName.safeParse(parsed.data.name);
    if (!name.success) return { ok: false, failure: "name" };
    const made = await lockStation(access.userId, access.businessId, name.data);
    if (!made.ok) return made;
    token = made.value.token;
  }

  // Kept for 400 days from now, also when it was the same station.
  await rememberStation(token);
  await signOut();
  return { ok: true, to: STATION_PATH };
}
