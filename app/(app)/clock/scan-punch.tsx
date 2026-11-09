"use client";

import { type PunchProof, parsePunchScan } from "@domain/punch-code-format";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ListRow } from "@ui/list-row";
import { isAppleHomeScreenApp } from "@ui/qr-camera";
import { ScanCircle, type ScanCircleState } from "@ui/scan-circle";
import {
  type QrCameraState,
  type QrTextAnswer,
  useQrCamera,
} from "@ui/use-qr-camera";
import { Check, Keyboard } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ClockActionResult } from "./clock-types";

type Direction = "in" | "out";
type Failure = Exclude<ClockActionResult, { ok: true }>["failure"];

/** How long the check and the time stay before the clock comes back. */
const READ_HOLD_MS = 1200;
/** "That isn't the clock's code" at most this often. */
const NOT_OURS_MS = 3000;
/** A code that failed for the connection's sake is read again after this. */
const RETRY_AFTER_MS = 3000;
/**
 * Nothing read for this long from the press (the camera opening, asked about
 * or aiming): it turns off, and the circle is back.
 */
const GIVE_UP_MS = 120_000;

/**
 * Refusals answered here, with the camera reading on, each with its words. A
 * code refused for itself is never sent again from this screen, so a camera
 * still pointed at it doesn't ask over and over. Anything else (already in,
 * no access…) goes back to the circle, which says it.
 */
const SCAN_FAILURES = {
  code: "failure.codeScan",
  ownCode: "failure.ownCode",
  stationsOnly: "failure.stationsOnly",
  failed: "failure.failed",
} as const;
type ScanFailure = keyof typeof SCAN_FAILURES;

function isScanFailure(failure: Failure): failure is ScanFailure {
  return Object.hasOwn(SCAN_FAILURES, failure);
}

/** What the circle shows while the camera is in this state. */
function circleState(camera: QrCameraState): ScanCircleState {
  switch (camera) {
    case "aiming":
      return "aiming";
    case "denied":
    case "unavailable":
      return "problem";
    default:
      return "starting";
  }
}

/**
 * Clocking in or out by scanning the code a manager shows: the circle becomes
 * the camera, a code read clocks in or out at once, and the check and the time
 * show before the clock comes back. Typing the digits and going ahead without
 * a code stay one press away under it, and become the way on when there is no
 * camera, with a way to try the camera again. The camera is on only while this
 * shows and scans: never while a code read is sent, or its answer shows.
 */
export function ScanPunch({
  direction,
  timeZone,
  punchWith,
  onDone,
  onFailure,
  onCancel,
  onType,
  onWithoutCode,
}: {
  direction: Direction;
  /** The business's, for the time shown once it went through. */
  timeZone: string;
  punchWith: (to: Direction, proof: PunchProof) => Promise<ClockActionResult>;
  /** It went through: back to the clock. */
  onDone: () => void;
  /** A refusal that isn't about the code, for the clock to say. */
  onFailure: (failure: Failure) => void;
  onCancel: () => void;
  /** To the six digits instead. */
  onType: () => void;
  onWithoutCode: () => void;
}) {
  const t = useTranslations("app.clock");
  const format = useFormatter();
  const [phase, setPhase] = useState<"scanning" | "sending" | "done">(
    "scanning",
  );
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [notOurs, setNotOurs] = useState(false);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const lastNotOurs = useRef(0);
  /** Codes not to send again, until when. */
  const refused = useRef(new Map<string, number>());
  const [, start] = useTransition();
  // Only ever shown after a press, so never drawn on the server.
  const [homeScreenApp] = useState(() => isAppleHomeScreenApp(globalThis));

  function onText(text: string): QrTextAnswer {
    // One code at a time: nothing more is read while one is sent or shown.
    if (phase !== "scanning") return "keep";
    const code = parsePunchScan(text);
    if (code === null) {
      const now = Date.now();
      if (now - lastNotOurs.current >= NOT_OURS_MS) {
        lastNotOurs.current = now;
        setNotOurs(true);
      }
      return "keep";
    }
    if ((refused.current.get(code) ?? 0) > Date.now()) return "keep";
    setPhase("sending");
    setFailure(null);
    setNotOurs(false);
    // In a transition, as the sheets do, so a redirect (the demo's) is the
    // router's to follow.
    start(() => send(code));
    return "stop";
  }

  // Off while a code is sent and while its answer shows; back to scanning
  // after a refusal opens it again.
  const camera = useQrCamera({ active: phase === "scanning", onText });

  async function send(code: string) {
    const result = await punchWith(direction, { kind: "scan", code });
    if (result.ok) {
      setReadAt(new Date());
      setPhase("done");
      return;
    }
    if (!isScanFailure(result.failure)) {
      onFailure(result.failure);
      return;
    }
    refused.current.set(
      code,
      result.failure === "failed"
        ? Date.now() + RETRY_AFTER_MS
        : Number.POSITIVE_INFINITY,
    );
    setFailure(result.failure);
    setPhase("scanning");
  }

  // The latest of what the parent passed, for the timers below.
  const latest = useRef({ onDone, onCancel });
  useEffect(() => {
    latest.current = { onDone, onCancel };
  });

  useEffect(() => {
    if (phase !== "done") return;
    const back = setTimeout(() => latest.current.onDone(), READ_HOLD_MS);
    return () => clearTimeout(back);
  }, [phase]);

  useEffect(() => {
    if (!notOurs) return;
    const quiet = setTimeout(() => setNotOurs(false), NOT_OURS_MS);
    return () => clearTimeout(quiet);
  }, [notOurs]);

  // A camera left on in a pocket turns itself off, counted from the press, so
  // one that never gets to aiming (stuck opening, or a question nobody
  // answers) turns off too.
  const cameraOn =
    phase === "scanning" &&
    (camera.state === "starting" ||
      camera.state === "asking" ||
      camera.state === "aiming");
  useEffect(() => {
    if (!cameraOn) return;
    const rest = setTimeout(() => latest.current.onCancel(), GIVE_UP_MS);
    return () => clearTimeout(rest);
  }, [cameraOn]);

  const scanning = phase === "scanning";
  const problem =
    scanning && (camera.state === "denied" || camera.state === "unavailable");

  let status: string;
  if (phase === "sending") status = t("scan.sending");
  else if (phase === "done") {
    status = t(direction === "in" ? "scan.readIn" : "scan.readOut");
  } else if (camera.state === "asking") status = t("scan.allow");
  else if (camera.state === "denied") {
    // A home-screen app on an iPhone has no settings to allow it in, and asks
    // again when it starts.
    status = t(homeScreenApp ? "scan.deniedApp" : "scan.denied");
  } else if (camera.state === "unavailable") status = t("scan.unavailable");
  else if (camera.state === "aiming") {
    status = t(notOurs ? "scan.notOurs" : "scan.aim");
  } else status = t("scan.starting");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <ScanCircle
        state={
          phase === "sending"
            ? "reading"
            : phase === "done"
              ? "read"
              : circleState(camera.state)
        }
        videoRef={camera.videoRef}
        frameRef={camera.frameRef}
        figure={
          phase === "done" && readAt ? (
            <>
              <Check aria-hidden="true" />
              <time dateTime={readAt.toISOString()} dir="ltr">
                {format.dateTime(readAt, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                  timeZone,
                })}
              </time>
            </>
          ) : undefined
        }
        status={status}
        cancel={{
          label: t("scan.cancel"),
          onClick: onCancel,
          disabled: !scanning,
          autoFocus: true,
        }}
      />

      {failure ? (
        <p role="alert" className="text-center font-medium text-danger">
          {t(SCAN_FAILURES[failure])}
        </p>
      ) : null}

      {problem ? (
        // No camera: typing is the way on now, and the camera can be tried
        // again once it is allowed.
        <>
          <Button size="lg" className="w-full" onClick={onType}>
            <Keyboard aria-hidden="true" />
            {t("type.open")}
          </Button>
          <Button variant="secondary" onClick={camera.restart}>
            {t("scan.retry")}
          </Button>
        </>
      ) : (
        <Card tone="float" padding="none" className="w-full overflow-hidden">
          <ListRow
            leading={<Keyboard aria-hidden="true" />}
            title={t("type.card")}
            subtitle={t("type.cardHint")}
            disabled={!scanning}
            onClick={onType}
          />
        </Card>
      )}
      <Button variant="ghost" disabled={!scanning} onClick={onWithoutCode}>
        {t("none.open")}
      </Button>
    </div>
  );
}
