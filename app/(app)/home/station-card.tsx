import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { LogOut, Tablet } from "lucide-react";
import { type SignOutAction, SignOutForm } from "@/app/sign-out-form";
import { LockStation } from "../clock/station/lock-station";
import type { LockAction, StationHome } from "../clock/station/station-types";
import type { Translator } from "../wording";

/**
 * On the business's station, signed in: it is the station (the clock's, or
 * since waiter mode's P8a the kitchen's screen or the till, each in its own
 * words). Whoever may lock it locks it again when done, with the lock's
 * sheet; anyone else signs out when done, and the device shows what it shows
 * again (Orel, 20 November 2026). Small, since it is not what Home is for: one row from tablet up, the
 * action under the words on a phone. Without a lock action (the accountant's
 * Home, whose people never lock) it is the sign-out, which is safe for anyone.
 */
export function StationCard({
  station,
  lock,
  clearsDevice,
  signOut,
  t,
}: {
  station: StationHome;
  /** Locking again (`lockDeviceAction`, or the demo's); none on a Home whose people never lock. */
  lock?: LockAction;
  /** Whether locking clears waiter mode's records on the device: not on the demo's. */
  clearsDevice?: boolean;
  signOut: SignOutAction;
  t: Translator<"app">;
}) {
  const locks =
    station.kind === "lock" && lock ? { offer: station.offer, lock } : null;
  return (
    <Card className="flex flex-col gap-3 md:max-w-2xl md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
        >
          <Tablet />
        </span>
        <p className="text-ink">
          {!locks
            ? t("clock.station.reminder.signOutBody")
            : station.shows === "prep"
              ? t("orders.stations.reminder.prep")
              : station.shows === "till"
                ? t("orders.stations.reminder.till")
                : t("clock.station.reminder.body")}
        </p>
      </div>
      <div className="ps-[52px] md:ps-0">
        {locks ? (
          <LockStation
            offer={locks.offer}
            lock={locks.lock}
            clearsDevice={clearsDevice}
            kind={station.shows === "clock_code" ? "clock" : station.shows}
            label={t("clock.station.reminder.lock")}
          />
        ) : (
          <SignOutForm action={signOut}>
            <Button type="submit" variant="secondary">
              <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
              {t("signOut")}
            </Button>
          </SignOutForm>
        )}
      </div>
    </Card>
  );
}
