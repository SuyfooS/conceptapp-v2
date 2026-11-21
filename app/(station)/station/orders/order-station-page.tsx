import type { StationOfToken } from "@db/clock-stations";
import { getStationDepartment, getStationWording } from "@db/order-stations";
import { accentTokens } from "@domain/color";
import { accentProps } from "@ui/accent";
import { wordingFrom } from "@/app/(app)/wording";
import { WordingProvider } from "@/app/(app)/wording-provider";
import { StationApp } from "./station-app";

/**
 * A kitchen's screen or the till, on the device locked as one (waiter mode
 * P8a): in its business's colour and words (its template's and its own,
 * read with the secret key, since nobody is signed in here), with nothing of
 * anyone's: no token, no person's id, the station's own name. Its orders
 * come from the routes, by the device's cookie.
 */
export async function OrderStationPage({
  station,
  signInHref,
}: {
  station: StationOfToken;
  signInHref: string;
}) {
  const [stored, department] = await Promise.all([
    getStationWording(station.businessId),
    station.shows === "prep" && station.departmentId
      ? getStationDepartment(station.businessId, station.departmentId)
      : Promise.resolve(null),
  ]);
  const { overrides } = wordingFrom(stored);
  return (
    <div {...accentProps(accentTokens(station.accent))}>
      <WordingProvider overrides={overrides}>
        <StationApp
          kind={station.shows === "till" ? "till" : "prep"}
          facts={{
            businessName: station.businessName,
            timeZone: station.timeZone,
            name: station.name,
            department,
          }}
          signInHref={signInHref}
        />
      </WordingProvider>
    </div>
  );
}
