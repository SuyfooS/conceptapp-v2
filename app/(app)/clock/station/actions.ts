"use server";

import { lockStation } from "@db/clock-stations";
import {
  type LockResult,
  runsFor,
  STATION_PATH,
  stationName,
} from "@domain/clock-station";
import { editsClock } from "@domain/time-clock";
import { z } from "zod";
import { endSessionHere } from "../../../(auth)/end-session";
import { currentModuleSettings } from "../../modules";
import { clockAccess } from "../clock";
import { deviceStation, orderLockerBusiness, rememberStation } from "./station";

const lockInput = z.object({ name: z.string() });

/**
 * Lock the device the person is on into the business's clock station (Orel,
 * 17 November 2026): it shows only the clock's code from now on, and nobody's
 * account. Whoever edits the clock, as themselves, where codes may show on a
 * station; the database checks the actor again. A device that is one of the
 * business's running stations already stays that one, so locking again never
 * piles stations up: Home's and /station's "lock again" keep the kitchen's
 * screen or the till it is too (waiter mode P8a), for whoever runs orders,
 * and anyone else is refused (`otherStation`), the device locked on the code
 * only once that one is stopped. Then it ends the session here only, as
 * signing out does (`endSessionHere`: its device, its business, its session;
 * the person's own phone stays signed in), and answers /station, which the
 * screen opens as a whole new page, so nothing of the person's screens stays
 * on the device.
 */
export async function lockDeviceAction(input: unknown): Promise<LockResult> {
  const parsed = lockInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "name" };

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
  const held = device?.station ?? null;
  if (device && held && !held.stopped && held.shows !== "clock_code") {
    // The kitchen's screen or the till it is, kept for whoever runs orders
    // in its business.
    if ((await orderLockerBusiness()) !== held.businessId) {
      return { ok: false, failure: "otherStation" };
    }
    token = device.token;
  } else {
    const access = await clockAccess();
    if (!access || !editsClock(access)) {
      return { ok: false, failure: "noAccess" };
    }
    if (access.viewOnly) return { ok: false, failure: "viewOnly" };
    const settings = await currentModuleSettings("time_clock");
    if (settings.codeDisplay === "manager") {
      return { ok: false, failure: "managerOnly" };
    }
    if (device && runsFor(device.station, access.businessId, "clock_code")) {
      token = device.token;
    } else {
      const name = stationName.safeParse(parsed.data.name);
      if (!name.success) return { ok: false, failure: "name" };
      const made = await lockStation(
        access.userId,
        access.businessId,
        name.data,
      );
      if (!made.ok) return made;
      token = made.value.token;
    }
  }

  // Kept for 400 days from now, also when it was the same station.
  await rememberStation(token);
  // Its own answer, not signing out's: the station was just kept, so it is
  // read no second time.
  await endSessionHere();
  return { ok: true, to: STATION_PATH };
}
