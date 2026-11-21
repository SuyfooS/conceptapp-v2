"use client";

import {
  nextStationPoll,
  type OrderStationRefusal,
  type StationKnown,
  type StationMenu,
  type StationPrep,
  type StationTill,
  stationConnection,
} from "@domain/order-stations";
import { useEffect, useRef, useState } from "react";
import type { StationBackend } from "./station-backend";

/** While taking orders is off, a station asks again this often. */
const OFF_RETRY_MS = 60_000;

/**
 * A refusal the page says itself (stopped, no station, someone signed in)
 * reads the page again at most this often, as the clock's station does.
 */
const READ_AGAIN_MS = 10_000;

/** How often the screen's clock moves between reads: ages follow it. */
const TICK_MS = 10_000;

export type StationPoll = {
  prep: StationPrep | null;
  /** The senders on the tickets shown, by id. */
  names: Record<string, string>;
  menu: StationMenu | null;
  till: StationTill | null;
  /** Failed asks in a row. */
  failures: number;
  connection: "ok" | "down";
  /** Why the station shows no orders, or null. */
  refusal: Exclude<OrderStationRefusal, "failed"> | null;
  /** The server's clock, in milliseconds, moving every 10 seconds between reads. */
  now: number;
  /** Asks at once: after the station's own write. */
  pollNow: () => void;
};

/**
 * A station's reads (waiter mode P8a): one ask at a time, at once as it
 * starts, when the page shows again, when the device is back online and after
 * each of its own writes, and otherwise at the prep screen's pace
 * (`nextStationPoll`: every 5 seconds, longer after failures, none while
 * hidden); every minute while taking orders is off. Each ask says what the
 * station has, and keeps what didn't change. A refusal the page says itself
 * (`leave`) reads the page again, at most every 10 seconds. Nothing asks
 * until `enabled`: the kitchen's screen reads nothing before its gate.
 */
export function useStationPoll(
  backend: StationBackend,
  { enabled, leave }: { enabled: boolean; leave: () => void },
): StationPoll {
  const [prep, setPrep] = useState<StationPrep | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<StationMenu | null>(null);
  const [till, setTill] = useState<StationTill | null>(null);
  const [failures, setFailures] = useState(0);
  const [online, setOnline] = useState(true);
  const [refusal, setRefusal] = useState<StationPoll["refusal"]>(null);
  /** The server's clock at the last read, and the device's then. */
  const [clock, setClock] = useState<{ server: number; local: number } | null>(
    null,
  );
  const [local, setLocal] = useState(0);
  const poke = useRef<() => void>(() => undefined);
  const leaving = useRef(leave);
  useEffect(() => {
    leaving.current = leave;
  }, [leave]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asking = false;
    let again = false;
    let failed = 0;
    let refused: StationPoll["refusal"] = null;
    let readAgainAt = Number.NEGATIVE_INFINITY;
    const known: StationKnown = { version: null, menu: null };

    const schedule = () => {
      clearTimeout(timer);
      if (stopped) return;
      const delay =
        refused === "off"
          ? OFF_RETRY_MS
          : nextStationPoll(failed, document.visibilityState === "visible");
      if (delay !== null) timer = setTimeout(() => void ask(), delay);
    };

    const ask = async () => {
      if (stopped) return;
      if (asking) {
        again = true;
        return;
      }
      asking = true;
      clearTimeout(timer);
      const reading = await backend.read({ ...known });
      asking = false;
      if (stopped) return;
      if (reading.kind === "failed") {
        failed += 1;
        setFailures(failed);
      } else {
        failed = 0;
        setFailures(0);
        refused = reading.kind === "refused" ? reading.failure : null;
        setRefusal(refused);
      }
      if (reading.kind === "answer") {
        const { answer } = reading;
        if (answer.shows === "prep") {
          if (answer.prep) {
            known.version = answer.prep.version;
            setPrep(answer.prep);
            setNames(answer.names);
            setClock({
              server: Date.parse(answer.prep.now),
              local: performance.now(),
            });
          }
          if (answer.menu) {
            known.menu = answer.menu.version;
            setMenu(answer.menu);
          }
        } else if (answer.till) {
          known.version = answer.till.version;
          setTill(answer.till);
          setClock({
            server: Date.parse(answer.till.now),
            local: performance.now(),
          });
        }
      }
      if (
        refused === "stopped" ||
        refused === "notStation" ||
        refused === "signedIn" ||
        refused === "notOrders"
      ) {
        if (performance.now() - readAgainAt >= READ_AGAIN_MS) {
          readAgainAt = performance.now();
          leaving.current();
        }
      }
      if (again) {
        again = false;
        void ask();
        return;
      }
      schedule();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void ask();
      else clearTimeout(timer);
    };
    const onOnline = () => {
      setOnline(true);
      void ask();
    };
    const onOffline = () => setOnline(false);
    poke.current = () => void ask();
    setOnline(navigator.onLine);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
      poke.current = () => undefined;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, backend]);

  // The screen's clock moves between reads, so ages count on with no
  // connection too.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setLocal(performance.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  const now = clock
    ? clock.server + Math.max(0, Math.max(local, clock.local) - clock.local)
    : Date.now();

  return {
    prep,
    names,
    menu,
    till,
    failures,
    connection: stationConnection(failures, online),
    refusal,
    now,
    pollNow: () => poke.current(),
  };
}
