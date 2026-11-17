"use client";

import type { StationStopFailure } from "@domain/clock-station";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { Tablet } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { StationRow, TeamActions, TeamStations } from "./team-types";

/** As long as the person's page keeps a "ביטול"; the database allows two minutes. */
const UNDO_SHOWN_MS = 10_000;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

type Toast = { text: string; stamp: string; undo?: () => void };

/**
 * The business's clock stations: each running one by its name, whether it
 * shows the code now or when it last did, and "הפסקת העמדה", which stops it
 * at once, with "ביטול" in the toast to start it again. Under them, or alone
 * where the business asks for the code, how to leave a device as one. The
 * same list on every device. Always mounted: with none to show it shows
 * nothing, until a stop from it, after which it stays, its toast, way back
 * and failure with it, also with its last station stopped.
 */
export function StationsCard({
  stations,
  stop,
  restart,
  viewOnly,
}: {
  stations: TeamStations;
  stop: TeamActions["stopStation"];
  restart: TeamActions["restartStation"];
  viewOnly: boolean;
}) {
  const t = useTranslations("app.clock.team.stations");
  const format = useFormatter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [pending, start] = useTransition();
  const [, startUndo] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<StationStopFailure | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** A station was stopped from here: the list stays, whatever is left in it. */
  const [kept, setKept] = useState(false);
  /**
   * Stopped here, until the list is read again without them (the demo's
   * stand-in reads nothing again).
   */
  const [gone, setGone] = useState<readonly string[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list read again is what clears it
  useEffect(() => {
    setGone([]);
  }, [stations.rows]);
  const rows = stations.rows.filter((row) => !gone.includes(row.id));

  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
  const seen = (row: StationRow) => {
    switch (row.seen.kind) {
      case "showing":
        return t("showing");
      case "never":
        return t("never");
      case "seen":
        return row.seen.date === stations.today
          ? t.rich("seenToday", { time: row.seen.time, ltr })
          : t.rich("seenOn", {
              day: day(row.seen.date),
              time: row.seen.time,
              ltr,
            });
    }
  };

  function stopOne(row: StationRow) {
    setKept(true);
    setBusy(row.id);
    setFailure(null);
    start(async () => {
      try {
        const result = await stop(row.id);
        if (result.ok) {
          setGone((ids) => [...ids, row.id]);
          setToast({
            text: t("stopped", { name: row.name }),
            stamp: `stop-${Date.now()}`,
            undo: () => restartOne(row),
          });
        } else {
          setFailure(result.failure);
        }
      } catch {
        setFailure("failed");
      }
      setBusy(null);
    });
  }

  /** The toast's "ביטול"; when it can't, the toast says why. */
  function restartOne(row: StationRow) {
    startUndo(async () => {
      let text: string;
      try {
        const result = await restart(row.id);
        if (result.ok) setGone((ids) => ids.filter((id) => id !== row.id));
        text = result.ok
          ? t("restarted", { name: row.name })
          : t(`failure.${result.failure}`);
      } catch {
        text = t("failure.failed");
      }
      setToast({ text, stamp: `restart-${Date.now()}` });
    });
  }

  // Nothing to show, and no stop made here whose toast would go with it.
  if (rows.length === 0 && !stations.shownEmpty && !kept) return null;

  return (
    <PageSection title={t("title")} headingRef={heading}>
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={toast?.undo ? UNDO_SHOWN_MS : 4000}
        action={
          toast?.undo
            ? {
                label: t("undo"),
                onClick: () => {
                  const undo = toast.undo;
                  setToast(null);
                  undo?.();
                },
              }
            : null
        }
        // The row went with the stop, and its button: on to "ביטול".
        focusAction={toast?.undo !== undefined}
        onFocusLeave={() => heading.current?.focus({ preventScroll: true })}
      />
      {rows.length > 0 ? (
        <Card padding="none" className="overflow-hidden md:max-w-2xl">
          {failure ? (
            <p role="alert" className="px-4 pt-3 font-medium text-danger">
              {t(`failure.${failure}`)}
            </p>
          ) : null}
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="relative flex flex-col gap-2 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line md:flex-row md:items-center md:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
                  >
                    <Tablet />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">{row.name}</span>
                    <span className="text-ink-2 text-sm">{seen(row)}</span>
                  </div>
                </div>
                <div className="ps-[52px] md:ms-auto md:ps-0">
                  <Button
                    variant="secondary"
                    aria-label={t("stopLabel", { name: row.name })}
                    loading={pending && busy === row.id}
                    disabled={pending || viewOnly}
                    onClick={() => stopOne(row)}
                  >
                    {t("stop")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        // None running: how to leave a device as one, or, where codes show
        // on a manager's phone only, that none can be. A stop that failed on
        // the last one says so here.
        <Card className="flex flex-col gap-2 md:max-w-2xl">
          {failure ? (
            <p role="alert" className="font-medium text-danger">
              {t(`failure.${failure}`)}
            </p>
          ) : null}
          <p className="text-ink-2">
            {t(stations.howTo ? "howTo" : "noneManagerOnly")}
          </p>
        </Card>
      )}
      {stations.howTo && rows.length > 0 ? (
        <p className="px-1 text-ink-2 text-sm md:max-w-2xl">{t("howTo")}</p>
      ) : null}
    </PageSection>
  );
}
