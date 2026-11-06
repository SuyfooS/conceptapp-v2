"use client";

import { timeIn } from "@domain/shabbat";
import {
  entryMs,
  formatElapsed,
  formatHours,
  type TimeBreak,
  type TimeEntry,
} from "@domain/time-clock";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PunchCircle } from "@ui/punch-circle";
import { StatusToast } from "@ui/status-toast";
import { Coffee, Fingerprint, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import type { ClockActionResult, ClockActions, ClockData } from "./clock-types";

type Kind = "in" | "out" | "break" | "back" | "undo";

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
 * for a short while.
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
  const pause = open?.breaks.find((b) => b.endedAt === null) ?? null;
  const now = useNow(data.now, open !== null || undo !== null);

  const [pending, start] = useTransition();
  const [running, setRunning] = useState<Kind | null>(null);
  const [failure, setFailure] = useState<
    Exclude<ClockActionResult, { ok: true }>["failure"] | null
  >(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );

  function run(kind: Kind, action: () => Promise<ClockActionResult>) {
    setRunning(kind);
    setFailure(null);
    start(async () => {
      const result = await action();
      setRunning(null);
      if (!result.ok) {
        setFailure(result.failure);
        return;
      }
      const at = new Date();
      setToast({
        text: t(`done.${kind}`, { time: timeIn(at, data.timeZone) }),
        stamp: at.toISOString(),
      });
    });
  }

  const undoLeft = undo && !open && Date.parse(undo.until) > now ? undo : null;

  return (
    <div className="flex flex-col items-center gap-5">
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <Circle
        data={data}
        open={open}
        pause={pause}
        now={now}
        running={running}
        pending={pending}
        run={run}
        actions={actions}
      />

      {open && !pause ? (
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
      {pause ? (
        <Button
          variant="secondary"
          size="lg"
          loading={running === "out"}
          disabled={pending || data.viewOnly}
          onClick={() => run("out", actions.clockOut)}
        >
          <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
          {t("endShift")}
        </Button>
      ) : null}

      {open ? (
        <p className="text-center text-ink-2 text-sm">
          {t(data.unpaidBreaks ? "breakRule.unpaid" : "breakRule.paid")}
        </p>
      ) : null}

      {failure ? (
        <p role="alert" className="text-center font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      {data.viewOnly ? (
        <p className="text-center text-ink-2 text-sm">{t("viewOnly")}</p>
      ) : null}

      {undoLeft ? (
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
    </div>
  );
}

function Circle({
  data,
  open,
  pause,
  now,
  running,
  pending,
  run,
  actions,
}: {
  data: ClockData;
  open: TimeEntry | null;
  pause: TimeBreak | null;
  now: number;
  running: Kind | null;
  pending: boolean;
  run: (kind: Kind, action: () => Promise<ClockActionResult>) => void;
  actions: ClockActions;
}) {
  const t = useTranslations("app.clock");
  const disabled = pending || data.viewOnly;

  if (!open) {
    return (
      <PunchCircle
        tone="off"
        figure={<Fingerprint aria-hidden="true" />}
        label={t("circle.in")}
        loading={running === "in"}
        disabled={disabled}
        onClick={() => run("in", actions.clockIn)}
      />
    );
  }

  if (pause) {
    return (
      <PunchCircle
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
        onClick={() => run("back", actions.endBreak)}
      />
    );
  }

  return (
    <PunchCircle
      tone="live"
      progress={data.shift ? share(data.shift, now) : null}
      figure={
        <span dir="ltr">{formatElapsed(entryMs(open, new Date(now)))}</span>
      }
      label={t("circle.out")}
      loading={running === "out"}
      disabled={disabled}
      onClick={() => run("out", actions.clockOut)}
    />
  );
}

/** How much of the person's shift has gone by. */
function share(shift: { from: string; to: string }, now: number): number {
  const from = Date.parse(shift.from);
  return (now - from) / (Date.parse(shift.to) - from);
}
