"use client";

import {
  type CodePhase,
  codePhase,
  type IssuedCode,
  nextFetchDelayMs,
  secondsToNextCode,
} from "@domain/punch-code";
import { useWakeLock, type WakeLockState } from "@ui/use-wake-lock";
import { useEffect, useRef, useState } from "react";

/*
 * The clock's code turning over, for the screens that show it: the code
 * screen on the phone of whoever edits the clock, and a station
 * (app/(station)/station). Each has its own route and its own refusals; the
 * timing is the same.
 */

/** One answer of a route that makes codes, as a screen reads it. */
export type RotationAnswer<Refusal extends string> =
  | { kind: "issued"; code: IssuedCode }
  | { kind: "refused"; failure: Refusal }
  | { kind: "signedOut" }
  | { kind: "failed" };

/** Reads a route's body. Kept at module level, so its identity never changes. */
export type ReadAnswer<Refusal extends string> = (
  body: unknown,
) => RotationAnswer<Refusal>;

/**
 * One ask for a code. A signed-out phone gets the door's redirect, which
 * `redirect: "manual"` keeps as an answer instead of following it to a page.
 * Anything that isn't the route's answer counts as a failed try.
 */
async function requestCode<Refusal extends string>(
  url: string,
  read: ReadAnswer<Refusal>,
  signal: AbortSignal,
): Promise<RotationAnswer<Refusal>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (response.type === "opaqueredirect") return { kind: "signedOut" };
    return read(await response.json());
  } catch {
    return { kind: "failed" };
  }
}

export type CodeRotation<Refusal extends string> = {
  /** The code to show now, or null while there is none to show. */
  shown: IssuedCode | null;
  /** The last code that came, shown or not. */
  issued: IssuedCode | null;
  /** The device's monotonic time since `issued` came, in ms. */
  elapsedMs: number;
  phase: CodePhase;
  failures: number;
  signedOut: boolean;
  refusal: Refusal | null;
  /** Asking now, for the retry button. */
  asking: boolean;
  /** Whole seconds until the next code. */
  seconds: number;
  /** A code is on screen: the screen stays awake while it is. */
  live: boolean;
  awake: WakeLockState;
  /** Ask again now. */
  retry: () => void;
};

/**
 * Ask `url` for a code, then again 20 s after each answer, sooner after a
 * failed try. Nothing while the page is hidden; at once when it shows again.
 * Timing runs on the server's times and the device's own clock since each
 * answer, never its time of day. A code that still works stays through a
 * failed fetch or two. A refusal stops the asking: the screen says why, and
 * showing it again asks, or `retryRefusedMs` later for a screen nobody looks
 * after (a station). `blocked`: nothing is asked at all.
 */
export function useCodeRotation<Refusal extends string>({
  url,
  read,
  blocked,
  retryRefusedMs,
}: {
  url: string;
  read: ReadAnswer<Refusal>;
  blocked: boolean;
  retryRefusedMs?: number;
}): CodeRotation<Refusal> {
  const [issued, setIssued] = useState<
    (IssuedCode & { receivedAt: number }) | null
  >(null);
  const [failures, setFailures] = useState(0);
  const [signedOut, setSignedOut] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [asking, setAsking] = useState(false);
  /** The device's monotonic clock at the last tick (performance.now()). */
  const [clock, setClock] = useState(0);
  const askNow = useRef<() => void>(() => {});

  useEffect(() => {
    if (blocked) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let failed = 0;
    let stopped = false;

    async function ask() {
      clearTimeout(timer);
      inFlight?.abort();
      const mine = new AbortController();
      inFlight = mine;
      setAsking(true);
      const answer = await requestCode(url, read, mine.signal);
      if (stopped || mine.signal.aborted) return;
      setAsking(false);
      setSignedOut(answer.kind === "signedOut");
      setRefusal(answer.kind === "refused" ? answer.failure : null);
      if (answer.kind === "signedOut" || answer.kind === "refused") {
        // Nothing to wait for: the screen says why, and showing it again asks.
        if (
          answer.kind === "refused" &&
          retryRefusedMs !== undefined &&
          document.visibilityState === "visible"
        ) {
          timer = setTimeout(() => void ask(), retryRefusedMs);
        }
        return;
      }
      if (answer.kind === "issued") {
        failed = 0;
        const receivedAt = performance.now();
        setIssued({ ...answer.code, receivedAt });
        setClock(receivedAt);
      } else {
        failed += 1;
      }
      setFailures(failed);
      if (document.visibilityState === "visible") {
        timer = setTimeout(() => void ask(), nextFetchDelayMs(failed));
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void ask();
      else clearTimeout(timer);
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) void ask();
    }

    askNow.current = () => void ask();
    void ask();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [blocked, url, read, retryRefusedMs]);

  // A step a second while the page shows, for the countdown and the phase.
  useEffect(() => {
    if (blocked) return;
    let ticking: ReturnType<typeof setInterval> | undefined;
    const tick = () => setClock(performance.now());
    function startTicking() {
      clearInterval(ticking);
      tick();
      ticking = setInterval(tick, 1000);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") startTicking();
      else clearInterval(ticking);
    }
    startTicking();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", startTicking);
    return () => {
      clearInterval(ticking);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", startTicking);
    };
  }, [blocked]);

  const elapsedMs = issued ? Math.max(0, clock - issued.receivedAt) : 0;
  const phase = codePhase({ issued, elapsedMs, failures });
  const live =
    !blocked &&
    !signedOut &&
    refusal === null &&
    (phase === "showing" || phase === "reconnecting");
  const awake = useWakeLock(live);

  return {
    shown: live ? issued : null,
    issued,
    elapsedMs,
    phase,
    failures,
    signedOut,
    refusal,
    asking,
    seconds: secondsToNextCode(elapsedMs),
    live,
    awake,
    retry: () => askNow.current(),
  };
}
