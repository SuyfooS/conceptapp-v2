import { MAX_STATIONS } from "@domain/clock-station";
import { ACCENT_PRESETS, BRAND } from "@domain/color";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { connection } from "next/server";
import { Suspense } from "react";
import { StationScreen } from "../../../(station)/station/station-screen";
import {
  NotAStation,
  SignedInHere,
  StoppedStation,
} from "../../../(station)/station/station-states";
import { demoStations } from "../clock/team/data";
import { business } from "../data";
import { demoLockDevice } from "./actions";

type Props = { searchParams: Promise<{ state?: string }> };

const SIGN_IN = "/design/screens/sign-in";
const HOME = "/design/shell";
/** The entrance's station, the first the team's hours list. */
const STATION = demoStations.rows[0]?.name ?? "";

// The real clock station (/station) with mock data, outside the demo's frame
// as the station is outside the app's, its codes from a stand-in route that
// stores nothing. `?state=clockOff` and `?state=managerOnly`: running, and
// refused a code; `?state=new`: a device that isn't a station; `?state=
// stopped`: one stopped from the team's hours; `?state=signedIn`: a manager
// signed in on the station, who locks it again; `?state=signedInFull`: a
// manager signed in on a device that is no station, with ten running, so it
// can't be one; `?state=signedInWorker`: someone signed in who doesn't edit
// the clock.
export default function ShellStation({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { state } = await searchParams;
  switch (state) {
    case "new":
      return <NotAStation signInHref={SIGN_IN} />;
    case "stopped":
      return <StoppedStation signInHref={SIGN_IN} />;
    case "signedIn":
      return (
        <SignedInHere
          lock={{
            offer: { current: { name: STATION }, running: [] },
            action: demoLockDevice,
          }}
          homeHref={HOME}
        />
      );
    case "signedInFull":
      return (
        <SignedInHere
          lock={{
            offer: {
              current: null,
              running: Array.from(
                { length: MAX_STATIONS },
                (_, i) => demoStations.rows[i]?.name ?? `${i + 1}`,
              ),
            },
            action: demoLockDevice,
          }}
          homeHref={HOME}
        />
      );
    case "signedInWorker":
      return <SignedInHere lock={null} homeHref={HOME} />;
  }
  const refused = state === "clockOff" || state === "managerOnly";
  return (
    <StationScreen
      data={{
        businessName: business.name,
        // The demo's colour, the app's default.
        accent: ACCENT_PRESETS[0]?.hex ?? BRAND,
        timeZone: ISRAEL_TIME_ZONE,
        name: STATION,
        now: new Date().toISOString(),
      }}
      codeUrl={`/design/shell/station/code${refused ? `?state=${state}` : ""}`}
      signInHref={SIGN_IN}
    />
  );
}
