"use client";

import {
  defaultStationName,
  type LockFailure,
  lockOpen,
  MAX_STATIONS,
  STATION_NAME_MAX,
} from "@domain/clock-station";
import { orderStationName } from "@domain/order-stations";
import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { Sheet } from "@ui/sheet";
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
import type { LockAction, LockOffer } from "./station-types";

/** What the device is locked as: the clock's code, a kitchen's screen, or the till. */
export type LockKind = "clock" | "prep" | "till";

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
 * that is a station of another kind says what it is, to stop it first.
 * Waiter mode's records on the device go as it locks, everyone's (P7): with
 * an order that hasn't gone, one more line says how many and where. Not on
 * /design's twins (`clearsDevice`), whose lock locks nothing: the device's
 * own orders are neither read nor cleared there. The same sheet locks the
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
}: {
  offer: LockOffer;
  lock: LockAction;
  /** The button's words, where the place says it otherwise. */
  label?: string;
  /** The screen's main action, where locking is what it is for. */
  primary?: boolean;
  /**
   * Whether locking clears waiter mode's records on the device, and the
   * sheet says what hasn't gone: false on /design's twins, which lock
   * nothing.
   */
  clearsDevice?: boolean;
  kind?: LockKind;
  /** A kitchen's screen's departments to choose from: the live ones, in order. */
  departments?: readonly { id: string; name: string }[];
}) {
  const tc = useTranslations("app.clock.station.lock");
  const ts = useTranslations("app.orders.stations.lock");
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
  const clock = kind === "clock";

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

  if (!lockOpen(offer)) {
    return (
      <p className="text-ink-2 text-sm">
        {offer.other
          ? clock
            ? tc("other", { name: offer.other.name })
            : ts("other", { name: offer.other.name })
          : clock
            ? tc("full", { count: MAX_STATIONS })
            : ts("full", { count: MAX_STATIONS })}
      </p>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    start(async () => {
      try {
        const result = await lock(
          kind === "prep" ? { name, department: department || null } : { name },
        );
        if (result.ok) {
          // A whole new page, as signing out opens: nothing of the person's
          // screens stays in this one, nor anyone's orders kept on the
          // device, cleared before it goes.
          if (clearsDevice) await clearAllOrders();
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
    </>
  );
}
