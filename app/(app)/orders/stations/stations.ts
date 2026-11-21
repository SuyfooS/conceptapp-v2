import "server-only";
import { countRunningStations } from "@db/clock-stations";
import { getRunningOrderStations } from "@db/order-stations";
import { dateIn } from "@domain/availability";
import { stationSeen } from "@domain/clock-station";
import { timeIn } from "@domain/shabbat";
import { currentOn } from "../../clock/station/station";
import type { OrdersAccess } from "../orders-access";
import type {
  OrderStationRow,
  OrderStationsData,
  StationAction,
} from "./stations-types";

const ACTIONS: readonly string[] = [
  "ready",
  "putBack",
  "soldOut",
  "available",
  "close",
  "reopen",
] satisfies StationAction[];

const isAction = (what: string | null): what is StationAction =>
  what !== null && ACTIONS.includes(what);

/**
 * The prep screen's part for whoever runs orders, a view as one too (waiter
 * mode P8a): locking this device as the kitchen's screen or the till, each
 * keeping the screen it already is, and the screens running, by kind, when
 * each was last seen and what it last did. A device that is a running
 * station of another kind (the clock's, or the other one) isn't locked again
 * until that one is stopped; ten in the business of every kind is the most.
 * Null for anyone who doesn't run orders. The database checks every lock and
 * stop again.
 */
export async function orderStationsOffer(
  access: OrdersAccess,
  now = new Date(),
): Promise<OrderStationsData | null> {
  if (!access.reach.mode.runs) return null;
  const [running, total, device] = await Promise.all([
    getRunningOrderStations(access.businessId),
    countRunningStations(access.businessId),
    access.viewing ? Promise.resolve(null) : currentOn(access.businessId),
  ]);
  const names = running.map((station) => station.name);
  const count = total.ok ? { total: total.count } : {};
  const offerFor = (shows: "prep" | "till") => {
    if (device?.shows === shows) {
      // A kitchen's screen locked again keeps the department it shows.
      return {
        current: { name: device.name, department: device.departmentId },
        running: [],
      };
    }
    return {
      current: null,
      running: names,
      ...count,
      other: device ? { name: device.name, shows: device.shows } : null,
    };
  };
  const departmentName = (id: string | null) =>
    id ? (access.departments.find((d) => d.id === id)?.name ?? null) : null;
  const zone = access.timeZone;
  const rows = running.map((station): OrderStationRow => {
    const seen = stationSeen(station.lastSeenAt, now);
    return {
      id: station.id,
      name: station.name,
      shows: station.shows,
      department: departmentName(station.departmentId),
      every: station.shows === "prep" && station.departmentId === null,
      seen:
        seen.kind === "seen"
          ? {
              kind: "seen",
              date: dateIn(new Date(seen.at), zone),
              time: timeIn(new Date(seen.at), zone),
            }
          : seen,
      last:
        isAction(station.lastAction) && station.lastActionAt
          ? {
              what: station.lastAction,
              time: timeIn(new Date(station.lastActionAt), zone),
            }
          : null,
    };
  });
  return {
    kitchen: offerFor("prep"),
    till: offerFor("till"),
    departments: access.departments
      .filter((d) => d.archivedAt === null)
      .map((d) => ({ id: d.id, name: d.name })),
    rows,
    today: dateIn(now, zone),
    viewOnly: access.viewing,
  };
}
