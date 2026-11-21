import {
  type StationWritten,
  stationCloseOrder,
  stationReopenOrder,
  stationSetItemAvailable,
  stationSetTicketReady,
  stationUndoCloseOrder,
} from "@db/order-stations";
import { hasSessionCookie } from "@db/supabase/server";
import {
  STATION_WRITE_MAX,
  type StationWrite,
  type StationWriteAnswer,
  type StationWriteFailure,
  stationWriteBody,
  writeKind,
} from "@domain/order-stations";
import { deviceStation } from "@/app/(app)/clock/station/station";
import { sameOriginRequest } from "@/app/origin";

/** Never kept by a cache on the way. */
function answer(body: StationWriteAnswer, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** A refusal's status: not this device's to write 403, gone 404, a failure 500, the rest 409. */
function refused(failure: StationWriteFailure): Response {
  const status =
    failure === "notStation"
      ? 403
      : failure === "gone" || failure === "itemGone"
        ? 404
        : failure === "failed" || failure === "notYet"
          ? 500
          : failure === "invalid"
            ? 400
            : 409;
  return answer({ ok: false, failure }, status);
}

/** The body, at most `STATION_WRITE_MAX` bytes of JSON in the write's shape, or null. */
async function bodyOf(request: Request): Promise<StationWrite | null> {
  // Said to be larger: refused before it is read.
  if (Number(request.headers.get("content-length") ?? 0) > STATION_WRITE_MAX) {
    return null;
  }
  const text = await request.text().catch(() => null);
  if (
    text === null ||
    new TextEncoder().encode(text).length > STATION_WRITE_MAX
  ) {
    return null;
  }
  try {
    const parsed = stationWriteBody.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The write, as the database decides it by the station's secret. */
function written(token: string, body: StationWrite): Promise<StationWritten> {
  switch (body.do) {
    case "ready":
      return stationSetTicketReady(token, body.ticket, body.ready);
    case "available":
      return stationSetItemAvailable(token, body.item, body.available);
    case "close":
      return stationCloseOrder(token, body.order);
    case "reopen":
      return stationReopenOrder(token, body.order);
    case "undoClose":
      return stationUndoCloseOrder(token, body.order);
  }
}

/**
 * What a kitchen's screen or the till writes (waiter mode P8a): a ticket
 * ready or back, an item sold out or back, a close, a reopen and the close's
 * "ביטול", for the station this device is (its cookie's secret), each of its
 * own kind (a till marks nothing ready: 409 `notOrders`). The same gates as
 * the reads: the station's own page only, nobody signed in on the device, a
 * running station. Outside the proxy's matcher. The database decides each
 * write as it decides a person's.
 */
export async function POST(request: Request): Promise<Response> {
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
  const body = await bodyOf(request);
  if (!body) return refused("invalid");
  if (held.station.shows !== writeKind(body)) return refused("notOrders");
  try {
    const result = await written(held.token, body);
    return result.ok ? answer({ ok: true }) : refused(result.failure);
  } catch (error) {
    console.error("a station's write failed", (error as Error).message);
    return refused("failed");
  }
}
