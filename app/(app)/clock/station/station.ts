import "server-only";
import {
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
 * This device's station when it is a running one of `businessId`, by name.
 * Reading it never stops the screen that asks: when it fails, the device
 * counts as none, and locking it makes a new station.
 */
async function currentOn(businessId: string): Promise<{ name: string } | null> {
  const device = await deviceStation().catch((error: Error) => {
    console.error("reading this device's station failed", error.message);
    return null;
  });
  const held = device?.station ?? null;
  return held && runsFor(held, businessId) ? { name: held.name } : null;
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
 * Home's card on the business's clock station: whoever may lock it again gets
 * the lock (`lockerBusiness`), and anyone else signed in is told to sign out
 * when done (Orel, 20 November 2026). Null on any other device, a stopped
 * station's, or another business's station. The device is read first, so a
 * Home on a device with no station's cookie reads nothing more. Reads no list.
 */
export async function currentStationHome(): Promise<StationHome | null> {
  const businessId = (await currentMember())?.membership?.business.id;
  if (!businessId) return null;
  const current = await currentOn(businessId);
  if (!current) return null;
  return (await lockerBusiness()) === businessId
    ? { kind: "lock", offer: { current, running: [] } }
    : { kind: "signOut" };
}
