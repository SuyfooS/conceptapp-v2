"use client";

import {
  defaultStationName,
  type LockFailure,
  lockOpen,
  MAX_STATIONS,
  STATION_NAME_MAX,
  type StationStopFailure,
} from "@domain/clock-station";
import { orderStationName } from "@domain/order-stations";
import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { TextField } from "@ui/text-field";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState, useTransition } from "react";
import { usePlaceWords } from "../../orders/orders-parts";
import {
  clearAllOrders,
  type UnsentOnDevice,
  unsentOnDevice,
} from "../../orders/orders-storage";
import { closeFilesOnDevice } from "../../team/[person]/file/file-tabs";
import {
  type LockAction,
  type LockKind,
  type LockOffer,
  lockInputOf,
  type StopOther,
} from "./station-types";

/** As long as the stop's toast keeps a "ביטול"; the database allows two minutes. */
const UNDO_SHOWN_MS = 10_000;

type Toast = { text: string; stamp: string; undo?: () => void };

/** A failure in the clock's words: its lock never meets a department, and the clock off reads as no access. */
const clockKey = (
  failure: LockFailure,
): Exclude<LockFailure, "department" | "off"> =>
  failure === "department"
    ? "failed"
    : failure === "off"
      ? "noAccess"
      : failure;

/** A failure in the orders' words: codes on a manager's phone are the clock's alone. */
const orderKey = (failure: LockFailure): Exclude<LockFailure, "managerOnly"> =>
  failure === "managerOnly" ? "failed" : failure;

/**
 * "נעילת המכשיר על הקוד": a sheet that says what locking does (the device
 * shows only the clock's code, without the person's account; using it here
 * again takes signing in with a code to their phone; their own phone stays
 * signed in), names the station, and locks. A device that is the business's
 * station already keeps its name. Once locked, the device opens the station
 * as a whole new page, as signing out does. With ten stations running and
 * this device none of them, a line says why there is no button; a device
 * that is a station of another kind says what it is, to stop it first, and
 * the clock's lock offers that stop on the business's kitchen's screen or
 * till (`stopOther`, taking orders on or off), with "ביטול" for whoever may
 * start it again; once stopped, the screen is read again and the lock opens.
 * Waiter mode's records on the device go as it locks, everyone's (P7): with
 * an order that hasn't gone, one more line says how many and where. Not on
 * /design's twins (`clearsDevice`), whose lock locks nothing: the device's
 * own orders are neither read nor cleared there, nor its hiring files
 * closed, as they are on a real lock (H6a). The same sheet locks the
 * kitchen's screen (`kind` "prep", with the department it shows, or every
 * one) and the till (P8a), each in its own words, its name offered from its
 * department ("מטבח"), "הכנה" or "קופה", numbered when one runs by it.
 */
export function LockStation({
  offer,
  lock,
  label,
  primary = false,
  clearsDevice = true,
  kind = "clock",
  departments = [],
  stopOther,
}: {
  offer: LockOffer;
  lock: LockAction;
  /** The button's words, where the place says it otherwise. */
  label?: string;
  /** The screen's main action, where locking is what it is for. */
  primary?: boolean;
  /**
   * Whether locking clears the device (waiter mode's records, and the sheet
   * says what hasn't gone; the hiring files open in its tabs and windows,
   * closed): false on /design's twins, which lock nothing.
   */
  clearsDevice?: boolean;
  kind?: LockKind;
  /** A kitchen's screen's departments to choose from: the live ones, in order. */
  departments?: readonly { id: string; name: string }[];
  /** The clock's lock's stop of the device's kitchen's screen or till (`offer.other`). */
  stopOther?: StopOther;
}) {
  const tc = useTranslations("app.clock.station.lock");
  const ts = useTranslations("app.orders.stations.lock");
  const tf = useTranslations("app.orders.stations.failure");
  const to = useTranslations("app.orders.outbox");
  const { placeTitle } = usePlaceWords();
  const group = useId();
  const [open, setOpen] = useState(false);
  const [unsent, setUnsent] = useState<UnsentOnDevice | null>(null);
  /** Null until the person types one: the name offered follows the department. */
  const [typed, setTyped] = useState<string | null>(null);
  const [department, setDepartment] = useState(departments[0]?.id ?? "");
  const [failure, setFailure] = useState<LockFailure | null>(null);
  const [pending, start] = useTransition();
  const [stopping, startStop] = useTransition();
  const [, startRestart] = useTransition();
  const [stopFailure, setStopFailure] = useState<StationStopFailure | null>(
    null,
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const clock = kind === "clock";
  const stopper = clock ? stopOther : undefined;

  const offered = (() => {
    if (clock) {
      return defaultStationName(offer.running, (n) => tc("defaultName", { n }));
    }
    const base =
      kind === "till"
        ? ts("defaultTill")
        : (departments.find((d) => d.id === department)?.name ??
          ts("defaultAll"));
    return orderStationName(base, offer.running, (n) =>
      ts("numbered", { name: base, n }),
    );
  })();
  const name = typed ?? offered;

  /** The device's kitchen's screen or till stopped, so the lock opens once the screen is read again. */
  function stopIt(stop: StopOther, stopped: string) {
    setStopFailure(null);
    startStop(async () => {
      try {
        const result = await stop.stop();
        if (!result.ok) {
          setStopFailure(result.failure);
          return;
        }
        const undo = result.undo;
        setToast({
          text: tc("stoppedOther", { name: stopped }),
          stamp: `stop-${Date.now()}`,
          ...(undo ? { undo: () => restartIt(stop, undo, stopped) } : {}),
        });
      } catch {
        setStopFailure("failed");
      }
    });
  }

  /** The toast's "ביטול"; when it can't, the toast says why. */
  function restartIt(stop: StopOther, stationId: string, stopped: string) {
    startRestart(async () => {
      let text: string;
      try {
        const result = await stop.restart(stationId);
        text = result.ok
          ? tc("restartedOther", { name: stopped })
          : tf(result.failure);
      } catch {
        text = tf("failed");
      }
      setToast({ text, stamp: `restart-${Date.now()}` });
    });
  }

  // Kept across the stop, by its key: the page read again opens the lock in
  // its place.
  const stopToast = stopper ? (
    <StatusToast
      key="stop-toast"
      message={toast?.text ?? null}
      stamp={toast?.stamp}
      duration={toast?.undo ? UNDO_SHOWN_MS : 4000}
      action={
        toast?.undo
          ? {
              label: tc("undo"),
              onClick: () => {
                const undo = toast.undo;
                setToast(null);
                undo?.();
              },
            }
          : null
      }
      // The stop's button went with the stop: on to "ביטול".
      focusAction={toast?.undo !== undefined}
    />
  ) : null;

  if (!lockOpen(offer)) {
    const other = offer.other;
    return (
      <>
        <p className="text-ink-2 text-sm">
          {other
            ? clock
              ? tc("other", { name: other.name })
              : ts("other", { name: other.name })
            : clock
              ? tc("full", { count: MAX_STATIONS })
              : ts("full", { count: MAX_STATIONS })}
        </p>
        {other && stopper ? (
          <Button
            variant="secondary"
            loading={stopping}
            onClick={() => stopIt(stopper, other.name)}
          >
            {tc("stopOther", { name: other.name })}
          </Button>
        ) : null}
        {stopFailure ? (
          <p role="alert" className="font-medium text-danger">
            {tf(stopFailure)}
          </p>
        ) : null}
        {stopToast}
      </>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    start(async () => {
      try {
        // Locked again as the screen it is: its own department, unchosen.
        const result = await lock(lockInputOf(kind, offer, department, name));
        if (result.ok) {
          // A whole new page, as signing out opens: nothing of the person's
          // screens stays in this one, nor anyone's orders kept on the
          // device, cleared before it goes. The session ended, and the
          // hiring files' step-up with it, so a file open in any tab or
          // window of the device closes now (H6a).
          if (clearsDevice) {
            closeFilesOnDevice(window);
            await clearAllOrders();
          }
          window.location.replace(result.to);
          return;
        }
        setFailure(result.failure);
      } catch {
        setFailure("failed");
      }
    });
  }

  const lines = clock
    ? [tc("onlyCode"), tc("signInAgain"), tc("ownPhone")]
    : [
        ts(kind === "prep" ? "prep.only" : "till.only"),
        ...(kind === "prep" ? [ts("prep.sound")] : []),
        tc("signInAgain"),
        tc("ownPhone"),
      ];
  const same = offer.current
    ? clock
      ? tc("same", { name: offer.current.name })
      : ts(kind === "prep" ? "samePrep" : "sameTill", {
          name: offer.current.name,
        })
    : null;
  const failed = failure
    ? clock
      ? tc(`failure.${clockKey(failure)}`, { count: MAX_STATIONS })
      : ts(`failure.${orderKey(failure)}`, { count: MAX_STATIONS })
    : null;

  return (
    <>
      <Button
        variant={primary ? "primary" : "secondary"}
        size={primary ? "lg" : "md"}
        onClick={() => {
          setFailure(null);
          setOpen(true);
          if (clearsDevice) void unsentOnDevice().then(setUnsent);
        }}
      >
        <Lock aria-hidden="true" />
        {label ?? tc("open")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={
          clock
            ? tc("title")
            : ts(kind === "prep" ? "prep.title" : "till.title")
        }
        closeLabel={tc("close")}
      >
        <form onSubmit={submit} className="flex flex-col gap-4 px-2 pt-1">
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-ink">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {unsent && unsent.count > 0 ? (
              <li className="font-medium text-warning">
                {to("lock", {
                  count: unsent.count,
                  places: [
                    ...new Set(unsent.places.map((where) => placeTitle(where))),
                  ].join(", "),
                })}
              </li>
            ) : null}
          </ul>
          {same ? (
            <p className="text-ink-2">{same}</p>
          ) : (
            <>
              {kind === "prep" ? (
                <ChoiceList
                  legend={ts("department")}
                  legendClassName="text-md"
                  groupClassName="bg-elevated shadow-none"
                >
                  {departments.map((d) => (
                    <ChoiceRow
                      key={d.id}
                      name={group}
                      value={d.id}
                      title={d.name}
                      checked={department === d.id}
                      onChange={() => setDepartment(d.id)}
                    />
                  ))}
                  <ChoiceRow
                    name={group}
                    value=""
                    title={ts("allDepartments")}
                    hint={ts("allHint")}
                    checked={department === ""}
                    onChange={() => setDepartment("")}
                  />
                </ChoiceList>
              ) : null}
              <TextField
                label={clock ? tc("name") : ts("name")}
                hint={clock ? tc("nameHint") : ts("nameHint")}
                value={name}
                onChange={(event) => setTyped(event.target.value)}
                maxLength={STATION_NAME_MAX}
                required
                autoComplete="off"
                enterKeyHint="done"
              />
            </>
          )}
          {failed ? (
            <p role="alert" className="font-medium text-danger">
              {failed}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            {tc("submit")}
          </Button>
        </form>
      </Sheet>
      {stopToast}
    </>
  );
}
