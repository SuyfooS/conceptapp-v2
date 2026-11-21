import {
  getStationPeople,
  stationOrderMenu,
  stationOrderPrep,
  stationOrderTill,
} from "@db/order-stations";
import { hasSessionCookie } from "@db/supabase/server";
import {
  type OrderStationRefusal,
  readStationQuery,
  type StationAnswer,
} from "@domain/order-stations";
import { deviceStation } from "@/app/(app)/clock/station/station";
import { sameOriginRequest } from "@/app/origin";

const NO_STORE = { "Cache-Control": "no-store" };

/** Never kept by a cache on the way: each answer is the orders as they are. */
function answer(body: StationAnswer, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Nothing moved since what the station has. */
const unchanged = () => new Response(null, { status: 204, headers: NO_STORE });

/** A refusal's status: no station is 403, the station's state 409, a failure 500. */
function refused(failure: OrderStationRefusal): Response {
  const status =
    failure === "notStation" ? 403 : failure === "failed" ? 500 : 409;
  return answer({ ok: false, failure }, status);
}

/**
 * The orders a kitchen's screen or the till shows (waiter mode P8a), for the
 * station this device is (its cookie's secret), from what it has already
 * (`?v=` its orders' version, `?m=` its menu's): a kitchen's screen gets its
 * tickets with the names of their senders, and what it marks sold out, each
 * only when it moved; the till its orders; 204 when nothing moved. A route,
 * outside the proxy's matcher, so each ask is one invocation, every five
 * seconds; and for the same reason as /station/code, a station stays open
 * across deploys. Asked only by the station's own page; never while someone
 * is signed in on this device (`hasSessionCookie`), and never for the
 * clock's station (409 `notOrders`). Only an error's message is logged,
 * never a secret.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return refused("notStation");
  if (await hasSessionCookie()) return refused("signedIn");
  let held: Awaited<ReturnType<typeof deviceStation>>;
  try {
    held = await deviceStation();
  } catch (error) {
    console.error("reading a station failed", (error as Error).message);
    return refused("failed");
  }
  if (!held) return refused("notStation");
  if (held.station.stopped) return refused("stopped");
  const { token, station } = held;
  if (station.shows !== "prep" && station.shows !== "till") {
    return refused("notOrders");
  }
  const known = readStationQuery(new URL(request.url).searchParams);
  if (!known) return answer({ ok: false, failure: "failed" }, 400);

  try {
    if (station.shows === "till") {
      const till = await stationOrderTill(token, known.version);
      if (!till.ok) return refused(till.failure);
      if (till.value === "same") return unchanged();
      return answer({ ok: true, shows: "till", till: till.value });
    }
    const [prep, menu] = await Promise.all([
      stationOrderPrep(token, known.version),
      stationOrderMenu(token, known.menu),
    ]);
    if (!prep.ok) return refused(prep.failure);
    if (!menu.ok) return refused(menu.failure);
    if (prep.value === "same" && menu.value === "same") return unchanged();
    const tickets = prep.value === "same" ? null : prep.value;
    // Only the senders of the tickets shown, by the business's names.
    const senders = (tickets?.tickets ?? []).flatMap((ticket) =>
      ticket.sentBy ? [ticket.sentBy] : [],
    );
    return answer({
      ok: true,
      shows: "prep",
      prep: tickets,
      names: tickets ? await getStationPeople(station.businessId, senders) : {},
      menu: menu.value === "same" ? null : menu.value,
    });
  } catch (error) {
    console.error(
      "reading a station's orders failed",
      (error as Error).message,
    );
    return refused("failed");
  }
}
