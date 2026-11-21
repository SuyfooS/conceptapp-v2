"use client";

import type { StationStopFailure } from "@domain/clock-station";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { ChefHat, Receipt, Tablet } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { LockStation } from "../../clock/station/lock-station";
import type {
  OrderStationRow,
  OrderStationsActions,
  OrderStationsData,
} from "./stations-types";

/** As long as the toast keeps a "ביטול"; the database allows two minutes. */
const UNDO_SHOWN_MS = 10_000;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

type Toast = { text: string; stamp: string; undo?: () => void };

/**
 * "מסך במטבח או בקופה" on the prep screen, for whoever runs orders (waiter
 * mode P8a, the section Orel saw in S0): this device locked as the
 * kitchen's screen or as the till, each with what it does, and "המסכים
 * שפועלים": each running screen by its name and kind, whether it is open now
 * or when it was last seen, what it last did, and "הפסקת המסך", which stops
 * it at once with "ביטול" in the toast. Phone: the two locks stacked;
 * tablet up: side by side. A view reads it all and locks and stops nothing.
 * Always mounted once a screen was stopped from it, so its toast and way
 * back stay with the last one.
 */
export function OrderStations({
  stations,
  actions,
}: {
  stations: OrderStationsData;
  actions: OrderStationsActions;
}) {
  const t = useTranslations("app.orders.stations");
  const lockWords = useTranslations("app.orders.stations.lock");
  return (
    <PageSection title={t("title")}>
      <div className="grid gap-4 md:max-w-3xl md:grid-cols-2">
        <Card className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent [&_svg]:size-6"
            >
              <ChefHat />
            </span>
            <span className="font-semibold text-md">{t("prep.lock")}</span>
          </span>
          <p className="text-ink-2">{t("prep.hint")}</p>
          {stations.viewOnly ? (
            <p className="text-ink-2 text-sm">
              {lockWords("failure.viewOnly")}
            </p>
          ) : (
            <LockStation
              kind="prep"
              offer={stations.kitchen}
              departments={stations.departments}
              lock={(input) => actions.lock({ ...input, shows: "prep" })}
              clearsDevice={actions.clearsDevice}
              label={t("prep.lock")}
            />
          )}
        </Card>
        <Card className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent [&_svg]:size-6"
            >
              <Receipt />
            </span>
            <span className="font-semibold text-md">{t("till.lock")}</span>
          </span>
          <p className="text-ink-2">{t("till.hint")}</p>
          {stations.viewOnly ? (
            <p className="text-ink-2 text-sm">
              {lockWords("failure.viewOnly")}
            </p>
          ) : (
            <LockStation
              kind="till"
              offer={stations.till}
              lock={(input) => actions.lock({ ...input, shows: "till" })}
              clearsDevice={actions.clearsDevice}
              label={t("till.lock")}
            />
          )}
        </Card>
      </div>
      <RunningScreens stations={stations} actions={actions} />
    </PageSection>
  );
}

/** "המסכים שפועלים": nothing until one runs, or one was stopped from here. */
function RunningScreens({
  stations,
  actions,
}: {
  stations: OrderStationsData;
  actions: OrderStationsActions;
}) {
  const t = useTranslations("app.orders.stations");
  const format = useFormatter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [pending, start] = useTransition();
  const [, startUndo] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<StationStopFailure | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [kept, setKept] = useState(false);
  /** Stopped here, until the list is read again without them (the twin reads nothing again). */
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
  const kind = (row: OrderStationRow) =>
    row.shows === "till"
      ? t("kind.till")
      : row.every || row.department === null
        ? t("kind.prepAll")
        : t("kind.prep", { department: row.department });
  const seen = (row: OrderStationRow) => {
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

  function stopOne(row: OrderStationRow) {
    setKept(true);
    setBusy(row.id);
    setFailure(null);
    start(async () => {
      try {
        const result = await actions.stop(row.id);
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
  function restartOne(row: OrderStationRow) {
    startUndo(async () => {
      let text: string;
      try {
        const result = await actions.restart(row.id);
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

  if (rows.length === 0 && !kept) return null;

  return (
    <section className="flex flex-col gap-3 md:max-w-2xl">
      <h3
        ref={heading}
        tabIndex={-1}
        className="px-1 font-semibold text-md outline-none"
      >
        {t("running")}
      </h3>
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
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="relative flex flex-col gap-2 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line xl:flex-row xl:items-center xl:gap-3"
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
                    <span className="text-ink-2 text-sm">{kind(row)}</span>
                    <span className="text-ink-2 text-sm">{seen(row)}</span>
                    {row.last ? (
                      <span className="text-ink-2 text-sm">
                        {t.rich("last", {
                          what: t(`what.${row.last.what}`),
                          time: row.last.time,
                          ltr,
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="ps-[52px] xl:ms-auto xl:ps-0">
                  <Button
                    variant="secondary"
                    aria-label={t("stopLabel", { name: row.name })}
                    loading={pending && busy === row.id}
                    disabled={pending || stations.viewOnly}
                    onClick={() => stopOne(row)}
                  >
                    {t("stop")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
