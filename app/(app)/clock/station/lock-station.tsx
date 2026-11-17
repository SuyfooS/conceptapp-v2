"use client";

import {
  defaultStationName,
  type LockFailure,
  MAX_STATIONS,
  STATION_NAME_MAX,
} from "@domain/clock-station";
import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { TextField } from "@ui/text-field";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { LockAction, LockOffer } from "./station-types";

/**
 * "נעילת המכשיר על הקוד": a sheet that says what locking does (the device
 * shows only the clock's code, without the person's account; using it here
 * again takes signing in with a code to their phone; their own phone stays
 * signed in), names the station, and locks. A device that is the business's
 * station already keeps its name. Once locked, the device opens the station
 * as a whole new page, as signing out does. With ten stations running and
 * this device none of them, a line says why there is no button.
 */
export function LockStation({
  offer,
  lock,
  label,
  primary = false,
}: {
  offer: LockOffer;
  lock: LockAction;
  /** The button's words, where the place says it otherwise. */
  label?: string;
  /** The screen's main action, where locking is what it is for. */
  primary?: boolean;
}) {
  const t = useTranslations("app.clock.station.lock");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() =>
    defaultStationName(offer.running, (n) => t("defaultName", { n })),
  );
  const [failure, setFailure] = useState<LockFailure | null>(null);
  const [pending, start] = useTransition();

  if (!offer.current && offer.running.length >= MAX_STATIONS) {
    return (
      <p className="text-ink-2 text-sm">{t("full", { count: MAX_STATIONS })}</p>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    start(async () => {
      try {
        const result = await lock({ name });
        if (result.ok) {
          // A whole new page, as signing out opens: nothing of the person's
          // screens stays in this one.
          window.location.replace(result.to);
          return;
        }
        setFailure(result.failure);
      } catch {
        setFailure("failed");
      }
    });
  }

  return (
    <>
      <Button
        variant={primary ? "primary" : "secondary"}
        size={primary ? "lg" : "md"}
        onClick={() => {
          setFailure(null);
          setOpen(true);
        }}
      >
        <Lock aria-hidden="true" />
        {label ?? t("open")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        closeLabel={t("close")}
      >
        <form onSubmit={submit} className="flex flex-col gap-4 px-2 pt-1">
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-ink">
            <li>{t("onlyCode")}</li>
            <li>{t("signInAgain")}</li>
            <li>{t("ownPhone")}</li>
          </ul>
          {offer.current ? (
            <p className="text-ink-2">
              {t("same", { name: offer.current.name })}
            </p>
          ) : (
            <TextField
              label={t("name")}
              hint={t("nameHint")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={STATION_NAME_MAX}
              required
              autoComplete="off"
              enterKeyHint="done"
            />
          )}
          {failure ? (
            <p role="alert" className="font-medium text-danger">
              {t(`failure.${failure}`, { count: MAX_STATIONS })}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            {t("submit")}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
