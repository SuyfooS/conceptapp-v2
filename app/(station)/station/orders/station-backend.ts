import {
  type OrderStationRefusal,
  STATION_WRITE_PATH,
  type StationAnswer,
  type StationKnown,
  type StationWrite,
  type StationWriteAnswer,
  stationAnswerSchema,
  stationQueryHref,
  stationWriteAnswer,
} from "@domain/order-stations";

/** What one read of a station brought. */
export type StationReading =
  | { kind: "same" }
  | { kind: "answer"; answer: Extract<StationAnswer, { ok: true }> }
  | { kind: "refused"; failure: Exclude<OrderStationRefusal, "failed"> }
  | { kind: "failed" };

/**
 * How a station of the orders reaches its orders (waiter mode P8a): the
 * app's goes to its two routes by the device's cookie; the twin's reads and
 * writes its store. The screens are the same either way.
 */
export type StationBackend = {
  read: (known: StationKnown) => Promise<StationReading>;
  write: (body: StationWrite) => Promise<StationWriteAnswer>;
};

/** An answer as the routes give it, read with their schema: a boundary. */
export function readingOf(status: number, body: unknown): StationReading {
  if (status === 204) return { kind: "same" };
  const parsed = stationAnswerSchema.safeParse(body);
  if (!parsed.success) return { kind: "failed" };
  const answer = parsed.data;
  if (answer.ok) return { kind: "answer", answer };
  return answer.failure === "failed"
    ? { kind: "failed" }
    : { kind: "refused", failure: answer.failure };
}

/**
 * The app's: `GET /station/tickets` with what the station knows (never kept
 * by a cache), and `POST /station/write`. Anything that isn't an answer in
 * the routes' shape, no connection included, is a failed try.
 */
export const fetchBackend: StationBackend = {
  async read(known) {
    try {
      const response = await fetch(stationQueryHref(known), {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body =
        response.status === 204
          ? null
          : await response.json().catch(() => null);
      return readingOf(response.status, body);
    } catch {
      return { kind: "failed" };
    }
  },
  async write(body) {
    try {
      const response = await fetch(STATION_WRITE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
      });
      const parsed = stationWriteAnswer.safeParse(
        await response.json().catch(() => null),
      );
      return parsed.success ? parsed.data : { ok: false, failure: "failed" };
    } catch {
      return { ok: false, failure: "failed" };
    }
  },
};
