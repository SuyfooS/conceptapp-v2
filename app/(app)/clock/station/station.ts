import "server-only";
import {
  getRunningStations,
  type StationOfToken,
  stationByToken,
} from "@db/clock-stations";
import {
  STATION_COOKIE,
  stationCookieOptions,
  stationToken,
} from "@domain/clock-station";
import { editsClock } from "@domain/time-clock";
import { cookies } from "next/headers";
import { cache } from "react";
import { requestOrigin } from "@/app/origin";
import { currentModuleSettings } from "../../modules";
import { clockAccess } from "../clock";
import type { LockOffer } from "./station-types";

/** Where a locked device goes, and stays. */
export const STATION_PATH = "/station";

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
 * This device's station when it is a running one of `businessId`, by name.
 * Reading it never stops the screen that asks: when it fails, the device
 * counts as none, and locking it makes a new station.
 */
async function currentOn(businessId: string): Promise<{ name: string } | null> {
  const device = await deviceStation().catch((error: Error) => {
    console.error("reading this device's station failed", error.message);
    return null;
  });
  const held = device?.station;
  return held && !held.stopped && held.businessId === businessId
    ? { name: held.name }
    : null;
}

/**
 * Locking this device into the business's station, for the signed-in person
 * who may (`lockerBusiness`); null for anyone else. The names of those
 * running are read only for a device that isn't one of them: the name
 * offered and the limit of ten are a new station's.
 */
export async function currentLockOffer(): Promise<LockOffer | null> {
  const businessId = await lockerBusiness();
  if (!businessId) return null;
  const current = await currentOn(businessId);
  if (current) return { current, running: [] };
  const running = await getRunningStations(businessId);
  return { current: null, running: running.map((station) => station.name) };
}

/**
 * Home's reminder: the offer, only on a device that is one of the business's
 * running stations, unlocked by someone who may lock it again. Reads no list.
 */
export async function currentStationReminder(): Promise<LockOffer | null> {
  const businessId = await lockerBusiness();
  if (!businessId) return null;
  const current = await currentOn(businessId);
  return current ? { current, running: [] } : null;
}
