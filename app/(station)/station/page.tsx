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
} from "@/app/(app)/clock/station/station";
import { ReadAgain } from "./read-again";
import { StationScreen } from "./station-screen";
import { NotAStation, SignedInHere, StoppedStation } from "./station-states";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("station");
  return { title: t("metaTitle") };
}

// The clock station (#78 phase 5; Orel's lock of 17 November 2026): the
// device someone who edits the clock locked from /clock/code. Public, so a
// device with nobody signed in reaches it, and in the proxy's matcher all the
// same, so a session left on it is refreshed and counted as one.
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
  // page, so no code shows beside it.
  if (await hasSessionCookie()) {
    const offer = await currentLockOffer();
    return (
      <SignedInHere
        lock={offer ? { offer, action: lockDeviceAction } : null}
        homeHref="/home"
      />
    );
  }
  const held = await deviceStation();
  if (!held) return <NotAStation signInHref={signInPath} />;
  if (held.station.stopped) {
    return (
      <>
        <StoppedStation signInHref={signInPath} />
        {/* A stop taken back in its two minutes shows the code again here. */}
        <ReadAgain
          every={PUNCH_CODE_REFRESH_SECONDS * 1000}
          during={STATION_RESTART_MS + 30_000}
        />
      </>
    );
  }
  const { station } = held;
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
