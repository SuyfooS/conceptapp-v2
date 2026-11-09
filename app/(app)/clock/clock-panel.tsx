"use client";

import {
  PUNCH_TYPING_BLOCK_MINUTES,
  type PunchProof,
} from "@domain/punch-code-format";
import type { TimeBreak, TimeEntry } from "@domain/time-clock";
import {
  entryMs,
  entryOverdue,
  formatElapsed,
  formatHours,
} from "@domain/time-clock-format";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PunchCircle } from "@ui/punch-circle";
import { StatusToast } from "@ui/status-toast";
import { preloadQrReader } from "@ui/use-qr-camera";
import { Coffee, Fingerprint, LogOut, ScanQrCode } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ClockActionResult, ClockActions, ClockData } from "./clock-types";
import { PunchCodeSheet } from "./punch-code-sheet";
import { ScanPunch } from "./scan-punch";
import { WithoutCodeSheet } from "./without-code-sheet";

type Kind = "in" | "out" | "break" | "back" | "undo";
type Direction = "in" | "out";
/** What started a scan: the circle, or "End shift" during a break. */
type ScanFrom = "circle" | "endShift";
type Failure = Exclude<ClockActionResult, { ok: true }>["failure"];

/** The time now, ticking each second while `running`. */
function useNow(initial: string, running: boolean): number {
  const [now, setNow] = useState(() => Date.parse(initial));
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  return now;
}

/**
 * The circle and what goes with it: pressing it records the moment, the ring
 * and the time run while the person is at work, and leaving can be taken back
 * for a short while. When the business asks for a code, pressing to come or
 * go turns the circle into a camera for the code a manager is showing, with
 * typing its digits and going ahead without one under it. Breaks never need a
 * code.
 */
export function ClockPanel({
  data,
  actions,
}: {
  data: ClockData;
  actions: ClockActions;
}) {
  const t = useTranslations("app.clock");
  const { open, undo } = data;
  const { needsCode } = data.punch;
  const pause = open?.breaks.find((b) => b.endedAt === null) ?? null;

  const [pending, start] = useTransition();
  const [running, setRunning] = useState<Kind | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  // Both sheets stay mounted, closed, so they open inside the business's colour.
  const [sheet, setSheet] = useState<"code" | "none" | null>(null);
  const [direction, setDirection] = useState<Direction>("in");
  /** The circle is the camera, for coming or going. */
  const [scanning, setScanning] = useState<Direction | null>(null);
  /** Where the focus goes back to once the camera gives the circle back. */
  const [scanFrom, setScanFrom] = useState<ScanFrom>("circle");
  const [noneBusy, startNone] = useTransition();
  const [noneFailure, setNoneFailure] = useState<Failure | null>(null);
  const now = useNow(data.now, open !== null || sheet === "none");

  // Leaving the screen ends a scan. Next keeps a page it leaves (hidden, in
  // React's Activity) and runs its effects again when it comes back: without
  // this, coming back through the tab bar would open the camera with nobody
  // pressing. Back on the screen, the circle shows.
  useLayoutEffect(() => () => setScanning(null), []);

  // The decoder downloads when the clock opens, not at the press (and not at
  // all on a phone that reads QR codes itself).
  useEffect(() => {
    if (needsCode) preloadQrReader();
  }, [needsCode]);

  // Too many wrong digits block typing in the database for a while. The block
  // lives here, not in the sheet, so opening the sheet again doesn't offer the
  // slots (each try would only push the block further out). It lifts itself
  // once the database's window has surely passed.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!locked) return;
    const lift = setTimeout(
      () => setLocked(false),
      PUNCH_TYPING_BLOCK_MINUTES * 60_000,
    );
    return () => clearTimeout(lift);
  }, [locked]);

  function say(text: string) {
    setToast({ text, stamp: new Date().toISOString() });
  }

  function run(kind: Kind, action: () => Promise<ClockActionResult>) {
    setRunning(kind);
    setFailure(null);
    start(async () => {
      try {
        const result = await action();
        setRunning(null);
        if (result.ok) {
          say(t(`done.${kind}`));
        } else {
          setFailure(result.failure);
        }
      } catch (error) {
        // A press with no signal stays on this screen. A redirect is not a
        // failure: the demo moves between its states that way.
        unstable_rethrow(error);
        setRunning(null);
        setFailure("failed");
      }
    });
  }

  /** A punch with a code, from the camera or a sheet, which says what went wrong itself. */
  async function punchWith(
    to: Direction,
    proof: PunchProof,
  ): Promise<ClockActionResult> {
    setFailure(null);
    try {
      const result = await (to === "in"
        ? actions.clockIn(proof)
        : actions.clockOut(proof));
      if (!result.ok && result.failure === "codeLocked") setLocked(true);
      if (result.ok) {
        // What the database recorded, not what was asked: with codes switched
        // off since the page loaded, nothing waits for a manager.
        const none = result.marked === true;
        say(
          t(
            to === "in"
              ? none
                ? "done.inNone"
                : "done.in"
              : none
                ? "done.outNone"
                : "done.out",
          ),
        );
      }
      return result;
    } catch (error) {
      unstable_rethrow(error);
      return { ok: false, failure: "failed" };
    }
  }

  /** Coming or going: scanning the code when one is asked for, else one press. */
  function punch(to: Direction, from: ScanFrom = "circle") {
    if (!needsCode) {
      run(to, () =>
        to === "in"
          ? actions.clockIn({ kind: "plain" })
          : actions.clockOut({ kind: "plain" }),
      );
      return;
    }
    setFailure(null);
    setDirection(to);
    setScanFrom(from);
    setScanning(to);
  }

  /** From the camera to one of the sheets, the same way in or out: it turns off. */
  function scanToSheet(next: "code" | "none") {
    setScanning(null);
    if (next === "none") setNoneFailure(null);
    setSheet(next);
  }

  /** From a sheet back to the camera, the same way in or out. */
  function sheetToScan() {
    setSheet(null);
    setScanning(direction);
  }

  /** The camera gives the circle back, and the focus goes back where it started. */
  function endScan() {
    setScanning(null);
    setRefocus(true);
  }
  const circleRef = useRef<HTMLButtonElement>(null);
  const endShiftRef = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState(false);
  const paused = pause !== null;
  useEffect(() => {
    if (!refocus || scanning) return;
    // "End shift" while the break goes on; the circle otherwise, as after
    // clocking out from a break, when "End shift" is gone.
    (scanFrom === "endShift" && paused
      ? endShiftRef
      : circleRef
    ).current?.focus();
    setRefocus(false);
  }, [refocus, scanning, scanFrom, paused]);

  function goWithoutCode() {
    setNoneFailure(null);
    startNone(async () => {
      const result = await punchWith(direction, { kind: "none" });
      if (result.ok) setSheet(null);
      else setNoneFailure(result.failure);
    });
  }

  // How long taking it back stays open comes from the server's two times, so a
  // phone whose clock is off neither hides it early nor keeps it too long.
  const [expired, setExpired] = useState<string | null>(null);
  useEffect(() => {
    if (!undo) return;
    const close = setTimeout(
      () => setExpired(undo.entryId),
      Date.parse(undo.until) - Date.parse(data.now),
    );
    return () => clearTimeout(close);
  }, [undo, data.now]);
  const undoLeft = undo && !open && expired !== undo.entryId ? undo : null;

  // Pressing can't help here, so it says so before anyone tries.
  const shownFailure =
    failure ?? (open && entryOverdue(open, new Date(now)) ? "tooLong" : null);

  return (
    <div className="flex flex-col items-center gap-5">
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      {scanning ? (
        <ScanPunch
          key={scanning}
          direction={scanning}
          timeZone={data.timeZone}
          punchWith={punchWith}
          onDone={endScan}
          onFailure={(refusal) => {
            endScan();
            setFailure(refusal);
          }}
          onCancel={endScan}
          onType={() => scanToSheet("code")}
          onWithoutCode={() => scanToSheet("none")}
        />
      ) : (
        <Circle
          circleRef={circleRef}
          data={data}
          open={open}
          pause={pause}
          now={now}
          running={running}
          pending={pending}
          onPunch={punch}
          onBack={() => run("back", actions.endBreak)}
        />
      )}

      {needsCode && !open && !scanning ? (
        <p className="text-center text-ink-2 text-sm">{t("line.idleScan")}</p>
      ) : null}

      {open && !pause && !scanning ? (
        <Button
          variant="secondary"
          size="lg"
          loading={running === "break"}
          disabled={pending || data.viewOnly}
          onClick={() => run("break", actions.startBreak)}
        >
          <Coffee aria-hidden="true" />
          {t("startBreak")}
        </Button>
      ) : null}
      {pause && !scanning ? (
        <Button
          ref={endShiftRef}
          variant="secondary"
          size="lg"
          loading={running === "out"}
          disabled={pending || data.viewOnly}
          onClick={() => punch("out", "endShift")}
        >
          <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
          {t("endShift")}
        </Button>
      ) : null}

      {open && !scanning ? (
        <p className="text-center text-ink-2 text-sm">
          {t(data.unpaidBreaks ? "breakRule.unpaid" : "breakRule.paid")}
          {needsCode ? <span className="block">{t("breakNote")}</span> : null}
        </p>
      ) : null}

      {shownFailure ? (
        <p role="alert" className="text-center font-medium text-danger">
          {t(`failure.${shownFailure}`)}
        </p>
      ) : null}
      {data.viewOnly ? (
        <p className="text-center text-ink-2 text-sm">{t("viewOnly")}</p>
      ) : null}

      {undoLeft && !scanning ? (
        <Card
          tone="accent"
          className="flex w-full items-center justify-between gap-3"
        >
          <p className="min-w-0 text-ink">
            {t.rich("left", {
              time: undoLeft.out,
              hours: formatHours(undoLeft.minutes),
              ltr: (chunks) => <span dir="ltr">{chunks}</span>,
            })}
          </p>
          <Button
            variant="ghost"
            className="shrink-0"
            loading={running === "undo"}
            disabled={pending}
            onClick={() =>
              run("undo", () => actions.undoClockOut(undoLeft.entryId))
            }
          >
            {t("undo")}
          </Button>
        </Card>
      ) : null}

      {needsCode ? (
        <>
          <PunchCodeSheet
            open={sheet === "code"}
            onOpenChange={(next) => setSheet(next ? "code" : null)}
            direction={direction}
            locked={locked}
            punchWith={punchWith}
            onWithoutCode={() => {
              setNoneFailure(null);
              setSheet("none");
            }}
            // While typing is blocked, scanning is still the way in.
            onScan={sheetToScan}
          />
          <WithoutCodeSheet
            open={sheet === "none"}
            onOpenChange={(next) => {
              // The answer to a press under way belongs on this sheet.
              if (!noneBusy) setSheet(next ? "none" : null);
            }}
            direction={direction}
            now={now}
            timeZone={data.timeZone}
            pending={noneBusy}
            failure={noneFailure}
            onConfirm={goWithoutCode}
            // Scanning, which a typing block doesn't stop.
            onBack={sheetToScan}
          />
        </>
      ) : null}
    </div>
  );
}

function Circle({
  circleRef,
  data,
  open,
  pause,
  now,
  running,
  pending,
  onPunch,
  onBack,
}: {
  /** The circle's button, for the focus to come back to after scanning. */
  circleRef: Ref<HTMLButtonElement>;
  data: ClockData;
  open: TimeEntry | null;
  pause: TimeBreak | null;
  now: number;
  running: Kind | null;
  pending: boolean;
  onPunch: (to: Direction) => void;
  onBack: () => void;
}) {
  const t = useTranslations("app.clock");
  const disabled = pending || data.viewOnly;
  const { needsCode } = data.punch;

  if (!open) {
    return (
      <PunchCircle
        ref={circleRef}
        tone="off"
        figure={
          needsCode ? (
            <ScanQrCode aria-hidden="true" />
          ) : (
            <Fingerprint aria-hidden="true" />
          )
        }
        label={t(needsCode ? "circle.scanIn" : "circle.in")}
        loading={running === "in"}
        disabled={disabled}
        onClick={() => onPunch("in")}
      />
    );
  }

  if (pause) {
    return (
      <PunchCircle
        ref={circleRef}
        tone="paused"
        progress={data.shift ? share(data.shift, now) : null}
        figure={
          <span dir="ltr">
            {formatElapsed(now - Date.parse(pause.startedAt))}
          </span>
        }
        label={t("circle.back")}
        loading={running === "back"}
        disabled={disabled}
        onClick={onBack}
      />
    );
  }

  return (
    <PunchCircle
      ref={circleRef}
      tone="live"
      progress={data.shift ? share(data.shift, now) : null}
      figure={
        <span dir="ltr">{formatElapsed(entryMs(open, new Date(now)))}</span>
      }
      label={t(needsCode ? "circle.scanOut" : "circle.out")}
      loading={running === "out"}
      disabled={disabled}
      onClick={() => onPunch("out")}
    />
  );
}

/** How much of the person's shift has gone by. */
function share(shift: { from: string; to: string }, now: number): number {
  const from = Date.parse(shift.from);
  return (now - from) / (Date.parse(shift.to) - from);
}
