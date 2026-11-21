import { hasSessionCookie } from "@db/supabase/server";
import { STATION_RESTART_MS } from "@domain/clock-station";
import { signInPath } from "@domain/passive-sign-in";
import { PUNCH_CODE_REFRESH_SECONDS } from "@domain/punch-code";
import { PageSkeleton } from "@ui/skeleton";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { lockDeviceAction } from "@/app/(app)/clock/station/actions";
import {
  currentLockOffer,
  deviceStation,
  orderLockerBusiness,
} from "@/app/(app)/clock/station/station";
import { OrderStationPage } from "./orders/order-station-page";
import { ReadAgain } from "./read-again";
import { StationScreen } from "./station-screen";
import { NotAStation, SignedInHere, StoppedStation } from "./station-states";

/** The station's own manifest (station/manifest.webmanifest/route.ts). */
const STATION_MANIFEST = "/station/manifest.webmanifest";

/**
 * What this device shows, for its title and its home screen's name: a
 * kitchen's screen or the till by its kind; the clock's words otherwise (no
 * station, a stopped one, or one that can't be read).
 */
async function shownHere(): Promise<"prep" | "till" | null> {
  try {
    const held = (await deviceStation())?.station;
    return held && !held.stopped && held.shows !== "clock_code"
      ? held.shows
      : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("station");
  const kind = await shownHere();
  if (!kind) return { title: t("metaTitle") };
  return {
    title: t(`${kind}.metaTitle`),
    // Its own manifest's words: "Add to Home Screen" names the screen it is.
    manifest: `${STATION_MANIFEST}?kind=${kind}`,
    appleWebApp: {
      capable: true,
      title: t(`manifest.${kind}.shortName`),
      statusBarStyle: "default",
    },
  };
}

// A station (#78 phase 5; Orel's lock of 17 November 2026): the device
// someone who edits the clock locked from /clock/code, showing the clock's
// code, or since waiter mode's P8a the kitchen's screen or the till, locked
// from the prep screen by whoever runs orders. Public, so a device with
// nobody signed in reaches it, and in the proxy's matcher all the same, so a
// session left on it is refreshed and counted as one.
export default function StationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Station />
    </Suspense>
  );
}

function Loading() {
  const t = useTranslations("station");
  return <PageSkeleton label={t("loading")} />;
}

async function Station() {
  await connection();
  // Any session, valid or not: its refresh token signs someone in on the next
  // page, so nothing shows beside it.
  if (await hasSessionCookie()) return <Signed />;
  const held = await deviceStation();
  if (!held) return <NotAStation signInHref={signInPath} />;
  const { station } = held;
  if (station.stopped) {
    return (
      <>
        <StoppedStation signInHref={signInPath} shows={station.shows} />
        {/* A stop taken back in its two minutes shows the station again here. */}
        <ReadAgain
          every={PUNCH_CODE_REFRESH_SECONDS * 1000}
          during={STATION_RESTART_MS + 30_000}
        />
      </>
    );
  }
  if (station.shows === "prep" || station.shows === "till") {
    return <OrderStationPage station={station} signInHref={signInPath} />;
  }
  return (
    <StationScreen
      data={{
        businessName: station.businessName,
        accent: station.accent,
        timeZone: station.timeZone,
        name: station.name,
        // New with each reading: one read again after a refusal asks again.
        now: new Date().toISOString(),
      }}
      codeUrl="/station/code"
      signInHref={signInPath}
    />
  );
}

/**
 * Signed in on this device: on the business's kitchen's screen or till,
 * whoever runs orders locks it again as the screen it is; anywhere else,
 * the clock's lock, as before.
 */
async function Signed() {
  const kind = await shownHere();
  if (kind) {
    const held = (await deviceStation().catch(() => null))?.station;
    const locks = held && (await orderLockerBusiness()) === held.businessId;
    return (
      <SignedInHere
        shows={kind}
        lock={
          held && locks
            ? {
                offer: { current: { name: held.name }, running: [] },
                action: lockDeviceAction,
              }
            : null
        }
        homeHref="/home"
      />
    );
  }
  const offer = await currentLockOffer();
  return (
    <SignedInHere
      lock={offer ? { offer, action: lockDeviceAction } : null}
      homeHref="/home"
    />
  );
}
