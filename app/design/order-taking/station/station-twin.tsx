"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StationBackend } from "../../../(station)/station/orders/station-backend";
import { cancelLine, markSeen, sendRound, stationWrite } from "../changes";
import { demoDraft, orderDemoPeople, READER } from "../data";
import { useOrderDemo } from "../demo-store";
import {
  twinStationMenu,
  twinStationPrep,
  twinStationTill,
} from "../real-orders";
import type { DemoData } from "../scenario";

/** The twin's names for the senders, by id. */
const NAMES = Object.fromEntries(orderDemoPeople.map((p) => [p.id, p.name]));

/** What a twin station opens with, beyond the evening's rows. */
export type StationTwinState = "offline" | "arrives" | "late" | "struck" | null;

/** Since when a ticket waits, set so it crosses the late mark a few seconds on. */
const ALMOST_LATE_MS = (14 * 60 + 54) * 1000;

/**
 * A twin station's way to its orders (waiter mode P8a): it reads and writes
 * the demo's store as the routes read and write the database
 * (real-orders.ts, changes.ts), at once, so the real screens run with no
 * server and no timer of their own. A read marks what it shows as seen, as
 * the kitchen's does. `offline` fails every read; from the first read,
 * `arrives` sends table 6 a round five seconds on, `late` sets table 4's
 * round back so it waits too long a few seconds on, and `struck` cancels the
 * pasta of table 9 three seconds on.
 */
export function useTwinStationBackend(
  kind: "prep" | "till",
  department: string | null,
  state: StationTwinState,
): StationBackend {
  const { data, now, update } = useOrderDemo();
  // A version that moves with every change to the rows, as the server's does.
  const [seen, setSeen] = useState({ data, version: 1 });
  if (seen.data !== data) setSeen({ data, version: seen.version + 1 });
  const latest = useRef<{ data: DemoData; now: number; version: number }>({
    data,
    now,
    version: seen.version,
  });
  useEffect(() => {
    latest.current = { data, now, version: seen.version };
  }, [data, now, seen.version]);
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return useMemo<StationBackend>(() => {
    /** What happens a moment after the screen first reads, by its state. */
    function start() {
      if (started.current) return;
      started.current = true;
      const later = (ms: number, change: (d: DemoData) => DemoData) =>
        timers.current.push(setTimeout(() => update(change), ms));
      if (state === "late") {
        update((d) => ({
          ...d,
          orders: d.orders.map((order) => ({
            ...order,
            rounds: order.rounds.map((round) =>
              round.id === "round-4a"
                ? { ...round, at: latest.current.now - ALMOST_LATE_MS }
                : round,
            ),
          })),
        }));
      }
      if (state === "arrives") {
        later(
          5000,
          (d) =>
            sendRound(
              d,
              { orderId: null, placeId: "table-6" },
              demoDraft().filter((line) => !line.held),
              READER,
              latest.current.now,
            ).data,
        );
      }
      if (state === "struck") {
        later(3000, (d) =>
          cancelLine(d, "l12", "guest", READER, latest.current.now),
        );
      }
    }

    return {
      async read(known) {
        if (state === "offline") return { kind: "failed" };
        start();
        const { data: rows, now: at, version } = latest.current;
        if (kind === "till") {
          return known.version === version
            ? { kind: "same" }
            : {
                kind: "answer",
                answer: {
                  ok: true,
                  shows: "till",
                  till: twinStationTill(rows, at, version),
                },
              };
        }
        const prep =
          known.version === version
            ? null
            : twinStationPrep(rows, department, at, version);
        const menu =
          known.menu === version
            ? null
            : twinStationMenu(rows, department, version);
        if (!prep && !menu) return { kind: "same" };
        const unseen = (prep?.tickets ?? [])
          .filter((ticket) => ticket.status === "new")
          .map((ticket) => ticket.id);
        if (unseen.length > 0) update((d) => markSeen(d, unseen));
        return {
          kind: "answer",
          answer: { ok: true, shows: "prep", prep, names: NAMES, menu },
        };
      },
      async write(body) {
        const { data: rows, now: at, version } = latest.current;
        const written = stationWrite(rows, body, { department, now: at });
        if (written.answer.ok && written.data !== rows) {
          // Read at once by the station's next ask, as the database's would
          // be, before the store has drawn the screen again: one version on,
          // as the store's own count goes once it has.
          latest.current = {
            data: written.data,
            now: at,
            version: version + 1,
          };
          update(() => written.data);
        }
        return written.answer;
      },
    };
  }, [kind, department, state, update]);
}
