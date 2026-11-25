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
import { Button, type ButtonProps } from "@ui/button";
import { Card } from "@ui/card";
import {
  type FocusCandidate,
  focusFirst,
  inClosingSheet,
} from "@ui/focus-after";
import { PunchCircle } from "@ui/punch-circle";
import { StatusToast } from "@ui/status-toast";
import { useFocusWhenGone } from "@ui/use-focus-after";
import { preloadQrReader } from "@ui/use-qr-camera";
import { useSheetWrite } from "@ui/use-sheet-write";
import { Coffee, Fingerprint, LogOut, ScanQrCode } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type Ref,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  type ClockPress,
  clockState,
  ignoreHeldEnter,
  pressOver,
} from "./clock-focus";
import type { ClockActionResult, ClockActions, ClockData } from "./clock-types";
import { PunchCodeSheet } from "./punch-code-sheet";
import { ScanPunch } from "./scan-punch";
import { WithoutCodeSheet } from "./without-code-sheet";

type Kind = "in" | "out" | "break" | "back" | "undo";
type Direction = "in" | "out";
/** What started a scan: the circle, or "End shift" during a break. */
type ScanFrom = "circle" | "endShift";
type Failure = Exclude<ClockActionResult, { ok: true }>["failure"];
/** What a press says once it is over: the toast's words, or why it was refused. */
type Said = { text: string } | { failure: Failure };

/** A toast's words, stamped, so the same words show again. */
const toastOf = (text: string) => ({ text, stamp: new Date().toISOString() });

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
 * code. Each press's button gives way to what it drew ("יציאה להפסקה" to
 * "יציאה מהמשמרת", the undo card to the shift again), and so does a sheet
 * that closes: the keyboard's focus goes on to the screen's main control
 * now, "יציאה מהמשמרת" during a break and the circle otherwise, whose name
 * says the time running and what pressing it does, as it does when "ביטול
 * היציאה" goes once its time is up. What a press says (the toast, or why it
 * was refused) comes after the focus has landed, never before.
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
  const state = clockState(open, pause);

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
  // The press without a code holds its sheet until the answer (`noneHeld`),
  // and its buttons until the page read again after it is drawn.
  const {
    pending: noneBusy,
    start: startNone,
    held: noneHeld,
  } = useSheetWrite();
  const [noneFailure, setNoneFailure] = useState<Failure | null>(null);
  // The screen's own buttons wait for both: a refusal without a code lets its
  // sheet close before the page read again after it is drawn, and until then
  // the screen still shows what was there before (an open shift, say, that
  // another device closed), so nothing here may send a write against it.
  const busy = pending || noneBusy;
  /** The press of the screen's own buttons on its way, until it is over. */
  const pressed = useRef<ClockPress | null>(null);
  /**
   * What held the focus as it was pressed: after a refusal, still there, it
   * takes the focus back; after a step, gone, the main control does.
   */
  const pressedOn = useRef<Element | null>(null);
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

  /**
   * The words a press says once it is over (`pressOver`): after the focus
   * has landed on what the press drew, as a focus moved while they are said
   * cuts them off.
   */
  const held = useRef<Said | null>(null);

  /** Says them now, the toast's words or why it was refused. */
  function utter(words: Said) {
    if ("failure" in words) setFailure(words.failure);
    else setToast(toastOf(words.text));
  }

  /** Holds a press's words until it is over, or says them if it is already. */
  function sayWhenOver(words: Said) {
    if (pressed.current) held.current = words;
    else utter(words);
  }

  function run(kind: Kind, action: () => Promise<ClockActionResult>) {
    setRunning(kind);
    setFailure(null);
    pressed.current = { from: state, refused: false };
    pressedOn.current = document.activeElement;
    held.current = null;
    start(async () => {
      try {
        const result = await action();
        setRunning(null);
        if (result.ok) {
          sayWhenOver({ text: t(`done.${kind}`) });
        } else {
          refused();
          sayWhenOver({ failure: result.failure });
        }
      } catch (error) {
        // A press with no signal stays on this screen. A redirect is not a
        // failure: the demo moves between its states that way.
        unstable_rethrow(error);
        refused();
        setRunning(null);
        sayWhenOver({ failure: "failed" });
      }
    });
  }

  /** The press was refused: the screen stays as it was, nothing to wait for. */
  function refused() {
    if (pressed.current)
      pressed.current = { ...pressed.current, refused: true };
  }

  /**
   * A punch with a code, from the camera or a sheet, which says what went
   * wrong itself. One that went through is a press like the screen's own:
   * over once the screen it led to is drawn and the sheet or the camera gave
   * the focus back, when the focus goes on from "יציאה מהמשמרת" if that went
   * meanwhile, and then the toast says it.
   */
  async function punchWith(
    to: Direction,
    proof: PunchProof,
  ): Promise<ClockActionResult> {
    setFailure(null);
    const from = state;
    try {
      const result = await (to === "in"
        ? actions.clockIn(proof)
        : actions.clockOut(proof));
      if (!result.ok && result.failure === "codeLocked") setLocked(true);
      if (result.ok) {
        // What the database recorded, not what was asked: with codes switched
        // off since the page loaded, nothing waits for a manager.
        const none = result.marked === true;
        pressed.current = { from, refused: false };
        pressedOn.current = null;
        held.current = {
          text: t(
            to === "in"
              ? none
                ? "done.inNone"
                : "done.in"
              : none
                ? "done.outNone"
                : "done.out",
          ),
        };
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

  /**
   * The screen's main control now, where the focus goes once what held it
   * went: "יציאה מהמשמרת" during a break, the circle otherwise (both are
   * there during a break, "יציאה מהמשמרת" first). Neither while the camera
   * is on: its own "ביטול" has the focus then.
   */
  const mainControl = () => endShiftRef.current ?? circleRef.current;

  /**
   * A sheet gave the focus back as it left the page (its `returnFocus`, the
   * main control): counted, so a press it held over goes on (`handedBack`).
   */
  const [handedBack, noteHandedBack] = useReducer((n: number) => n + 1, 0);
  const sheetGaveBack = () => {
    noteHandedBack();
    return mainControl();
  };

  // A press is over: the button pressed gave way to what it drew (the break's
  // start to "יציאה מהמשמרת", leaving to the undo card, the undo card to the
  // shift again), or was busy while its answer came, and the focus went with
  // it. Only where it was lost, once the screen the press led to is drawn,
  // it goes back to what was pressed when that is still there (a refusal,
  // the circle), else on to the main control. A sheet open or the camera on
  // keep it until they give it back (a code's punch). So does a sheet still
  // sliding away with the focus in it: Radix keeps the rest of the page
  // hidden from screen readers (aria-hidden) until it has gone, so a focus
  // put there now may go unsaid. It gives the focus back once gone, and
  // that runs this again (`handedBack`). Then the press's words: the toast,
  // or why it was refused.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a sheet handing the focus back is what lets a press it held go on
  useEffect(() => {
    if (!pressOver(pressed.current, { busy, state })) return;
    if (scanning || sheet) return;
    const active = document.activeElement;
    if (active && inClosingSheet(active)) return;
    pressed.current = null;
    const was = pressedOn.current;
    pressedOn.current = null;
    focusFirst([was, endShiftRef.current, circleRef.current], { title: false });
    const words = held.current;
    held.current = null;
    if (!words) return;
    if ("failure" in words) setFailure(words.failure);
    else setToast(toastOf(words.text));
  }, [busy, state, scanning, sheet, handedBack]);

  function goWithoutCode() {
    setNoneFailure(null);
    pressed.current = { from: state, refused: false };
    pressedOn.current = null;
    startNone(async () => {
      const result = await punchWith(direction, { kind: "none" });
      if (result.ok) {
        setSheet(null);
      } else {
        // The sheet stays, saying why, with the focus in it.
        pressed.current = null;
        setNoneFailure(result.failure);
      }
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
          pending={busy}
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
          disabled={busy || data.viewOnly}
          onClick={() => run("break", actions.startBreak)}
          onKeyDown={ignoreHeldEnter}
        >
          <Coffee aria-hidden="true" />
          {t("startBreak")}
        </Button>
      ) : null}
      {pause && !scanning ? (
        <Button
          ref={endShiftRef}
          data-clock="end-shift"
          variant="secondary"
          size="lg"
          loading={running === "out"}
          disabled={busy || data.viewOnly}
          onClick={() => punch("out", "endShift")}
          onKeyDown={ignoreHeldEnter}
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
          <UndoLeaving
            main={() => [endShiftRef.current, circleRef.current]}
            variant="ghost"
            className="shrink-0"
            loading={running === "undo"}
            disabled={busy}
            onClick={() =>
              run("undo", () => actions.undoClockOut(undoLeft.entryId))
            }
            onKeyDown={ignoreHeldEnter}
          >
            {t("undo")}
          </UndoLeaving>
        </Card>
      ) : null}

      {needsCode ? (
        <>
          <PunchCodeSheet
            open={sheet === "code"}
            onOpenChange={(next) => setSheet(next ? "code" : null)}
            // Opened from the camera, which went as it opened: closed, back
            // to the main control, never the top of the page, and then a
            // punch it held goes on to its words.
            returnFocus={sheetGaveBack}
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
              // The answer to a press under way belongs on this sheet, and
              // only the answer: a refusal shows before the page comes back.
              if (!noneHeld()) setSheet(next ? "none" : null);
            }}
            returnFocus={sheetGaveBack}
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
        data-clock="circle"
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
        onKeyDown={ignoreHeldEnter}
      />
    );
  }

  if (pause) {
    return (
      <PunchCircle
        ref={circleRef}
        data-clock="circle"
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
        onKeyDown={ignoreHeldEnter}
      />
    );
  }

  return (
    <PunchCircle
      ref={circleRef}
      data-clock="circle"
      tone="live"
      progress={data.shift ? share(data.shift, now) : null}
      figure={
        <span dir="ltr">{formatElapsed(entryMs(open, new Date(now)))}</span>
      }
      label={t(needsCode ? "circle.scanOut" : "circle.out")}
      loading={running === "out"}
      disabled={disabled}
      onClick={() => onPunch("out")}
      onKeyDown={ignoreHeldEnter}
    />
  );
}

/** How much of the person's shift has gone by. */
function share(shift: { from: string; to: string }, now: number): number {
  const from = Date.parse(shift.from);
  return (now - from) / (Date.parse(shift.to) - from);
}

/**
 * "ביטול היציאה". It goes with its card, pressed or once its time is up
 * (the server's window, while the person may be resting on it): holding the
 * focus, it gives it to the screen's main control (`main`), never the body.
 */
function UndoLeaving({
  main,
  ...props
}: Omit<ButtonProps, "ref"> & { main: () => readonly FocusCandidate[] }) {
  const button = useRef<HTMLButtonElement>(null);
  useFocusWhenGone(button, main);
  return <Button ref={button} {...props} />;
}
