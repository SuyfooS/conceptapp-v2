import "server-only";
import {
  countRunningStations,
  getRunningStations,
  type StationOfToken,
  stationByToken,
} from "@db/clock-stations";
import {
  afterSignOutPath,
  runsFor,
  STATION_COOKIE,
  stationCookieOptions,
  stationToken,
} from "@domain/clock-station";
import { signInPath } from "@domain/passive-sign-in";
import { editsClock } from "@domain/time-clock";
import { cookies } from "next/headers";
import { cache } from "react";
import { requestOrigin } from "@/app/origin";
import { currentMember } from "../../member";
import { currentModuleSettings } from "../../modules";
import { ordersAccess } from "../../orders/orders-access";
import { clockAccess } from "../clock";
import type { LockOffer, StationHome } from "./station-types";

/**
 * The station this device holds the secret of, stopped or not, with the
 * secret; null when it holds none, or one that is no station's. Read once
 * per request. A failed read throws: it is not "no station".
 */
export const deviceStation = cache(
  async (): Promise<{ token: string; station: StationOfToken } | null> => {
    const token = stationToken.safeParse(
      (await cookies()).get(STATION_COOKIE)?.value,
    );
    if (!token.success) return null;
    const station = await stationByToken(token.data);
    return station ? { token: token.data, station } : null;
  },
);

/** This device is a station of the business from now on: its secret, kept. */
export async function rememberStation(token: string): Promise<void> {
  const secure = (await requestOrigin()).startsWith("https://");
  (await cookies()).set(STATION_COOKIE, token, stationCookieOptions(secure));
}

/**
 * Where this device goes once signed out (`afterSignOutPath`): its running
 * station's code, or the door. A failed read is the door: it never stops the
 * sign-out, which is done before this is asked.
 */
export async function signedOutPath(): Promise<string> {
  try {
    return afterSignOutPath((await deviceStation())?.station ?? null);
  } catch (error) {
    console.error(
      "reading this device's station failed",
      (error as Error).message,
    );
    return signInPath;
  }
}

/**
 * Who may lock the device they are on: whoever edits the clock (`editsClock`),
 * as themselves, where codes may show on a station (`codeDisplay` isn't
 * "manager"). Their business, or null.
 */
async function lockerBusiness(): Promise<string | null> {
  const access = await clockAccess();
  if (!access || !editsClock(access) || access.viewOnly) return null;
  const settings = await currentModuleSettings("time_clock");
  return settings.codeDisplay === "manager" ? null : access.businessId;
}

/**
 * This device's station when it is a running one of `businessId`, of any
 * kind. Reading it never stops the screen that asks: when it fails, the
 * device counts as none, and locking it makes a new station.
 */
export async function currentOn(
  businessId: string,
): Promise<StationOfToken | null> {
  const device = await deviceStation().catch((error: Error) => {
    console.error("reading this device's station failed", error.message);
    return null;
  });
  const held = device?.station ?? null;
  return held && runsFor(held, businessId) ? held : null;
}

/**
 * Whether the signed-in person may lock the device they are on as the
 * business's kitchen's screen or till (waiter mode P8a): they run orders, as
 * themselves, with taking orders on (`ordersAccess`, which is null while
 * it is off). Their business, or null.
 */
export async function orderLockerBusiness(): Promise<string | null> {
  const access = await ordersAccess();
  if (!access?.reach.mode.runs || access.viewing) return null;
  return access.businessId;
}

/**
 * Locking this device into the business's clock station, for the signed-in
 * person who may (`lockerBusiness`); null for anyone else. The names of
 * those running are read only for a device that isn't one of them: the name
 * offered and the limit of ten (of every kind together) are a new station's.
 * A device that is the business's kitchen's screen or till says so
 * (`other`), and isn't locked on the code until that one is stopped.
 */
export async function currentLockOffer(): Promise<LockOffer | null> {
  const businessId = await lockerBusiness();
  if (!businessId) return null;
  const held = await currentOn(businessId);
  if (held?.shows === "clock_code") {
    return { current: { name: held.name }, running: [] };
  }
  const [running, total] = await Promise.all([
    getRunningStations(businessId),
    countRunningStations(businessId),
  ]);
  return {
    current: null,
    running: running.map((station) => station.name),
    ...(total.ok ? { total: total.count } : {}),
    other: held ? { name: held.name, shows: held.shows } : null,
  };
}

/**
 * Home's card on the business's station, of the kind it shows: whoever may
 * lock it again gets the lock (the clock's `lockerBusiness`, or
 * `orderLockerBusiness` for the kitchen's screen and the till), and anyone
 * else signed in is told to sign out when done (Orel, 20 November 2026).
 * Null on any other device, a stopped station's, or another business's
 * station. The device is read first, so a Home on a device with no station's
 * cookie reads nothing more. Reads no list.
 */
export async function currentStationHome(): Promise<StationHome | null> {
  const businessId = (await currentMember())?.membership?.business.id;
  if (!businessId) return null;
  const held = await currentOn(businessId);
  if (!held) return null;
  const locker =
    held.shows === "clock_code"
      ? await lockerBusiness()
      : await orderLockerBusiness();
  return locker === businessId
    ? {
        kind: "lock",
        shows: held.shows,
        offer: { current: { name: held.name }, running: [] },
      }
    : { kind: "signOut", shows: held.shows };
}
