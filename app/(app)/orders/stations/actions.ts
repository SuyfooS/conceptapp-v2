"use server";

import { setStationStopped } from "@db/clock-stations";
import { lockOrderStation } from "@db/order-stations";
import {
  type LockResult,
  runsFor,
  STATION_PATH,
  type StationStopResult,
  stationName,
} from "@domain/clock-station";
import { refresh } from "next/cache";
import { z } from "zod";
import { endSessionHere } from "../../../(auth)/end-session";
import { deviceStation, rememberStation } from "../../clock/station/station";
import { ordersAccess } from "../orders-access";

const lockInput = z.object({
  name: z.string(),
  shows: z.enum(["prep", "till"]),
  department: z.uuid().nullable().default(null),
});

/** Who locks and stops the kitchen's screens and the till: whoever runs orders, as themselves. */
async function runner(): Promise<
  | { ok: true; userId: string; businessId: string }
  | { ok: false; failure: "noAccess" | "viewOnly" }
> {
  const access = await ordersAccess();
  if (!access?.reach.mode.runs) return { ok: false, failure: "noAccess" };
  if (access.viewing) return { ok: false, failure: "viewOnly" };
  return { ok: true, userId: access.userId, businessId: access.businessId };
}

/**
 * Lock the device the person is on as the business's kitchen's screen (of
 * one department, or every one) or its till (waiter mode P8a): it shows only
 * that from now on, and nobody's account. Whoever runs orders, as themselves,
 * with taking orders on; the database checks the actor again. A device that
 * is that screen already (the same kind, and for the kitchen the same
 * department) stays that one; one that is a running station of another kind
 * is refused (`otherStation`) until that one is stopped. Then, as the clock's
 * lock, it ends the session here only and answers /station.
 */
export async function lockOrderDeviceAction(
  input: unknown,
): Promise<LockResult> {
  const parsed = lockInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "name" };
  const { shows, department } = parsed.data;
  if (shows === "till" && department !== null) {
    return { ok: false, failure: "failed" };
  }
  const who = await runner();
  if (!who.ok) return who;

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
  if (device && runsFor(device.station, who.businessId)) {
    const same =
      device.station.shows === shows &&
      (shows === "till" || device.station.departmentId === department);
    if (!same) return { ok: false, failure: "otherStation" };
    token = device.token;
  } else {
    const name = stationName.safeParse(parsed.data.name);
    if (!name.success) return { ok: false, failure: "name" };
    const made = await lockOrderStation(who.userId, who.businessId, {
      name: name.data,
      shows,
      department,
    });
    if (!made.ok) return made;
    token = made.value.token;
  }

  // Kept for 400 days from now, also when it was the same station.
  await rememberStation(token);
  // Its own answer, not signing out's: the station was just kept.
  await endSessionHere();
  return { ok: true, to: STATION_PATH };
}

/**
 * Stop a kitchen's screen or a till, or start it again within two minutes,
 * by whoever runs orders: the database checks they run the station's
 * business's orders (`set_clock_station_stopped`).
 */
async function orderStationStopped(
  stationId: string,
  stopped: boolean,
): Promise<StationStopResult> {
  const station = z.uuid().safeParse(stationId);
  if (!station.success) return { ok: false, failure: "gone" };
  const who = await runner();
  if (!who.ok) return who;
  const result = await setStationStopped(who.userId, station.data, stopped);
  refresh();
  return result.ok ? { ok: true } : result;
}

/** Stop a screen at once: it shows no order from its next ask (every 5 seconds). */
export async function stopOrderStationAction(
  stationId: string,
): Promise<StationStopResult> {
  return orderStationStopped(stationId, true);
}

/** The toast's "ביטול": the screen shows the orders again, within two minutes. */
export async function restartOrderStationAction(
  stationId: string,
): Promise<StationStopResult> {
  return orderStationStopped(stationId, false);
}
