import { lockOpen, type StationShows } from "@domain/clock-station";
import { Button } from "@ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LockStation } from "@/app/(app)/clock/station/lock-station";
import type { StationLock } from "@/app/(app)/clock/station/station-types";
import { AuthScreen } from "@/app/(auth)/auth-screen";

/*
 * What /station says when it shows no code: each at the door's place, since
 * signing in is the way on from each.
 */

/** This device holds no station's secret: never locked, or the cookie went. */
export function NotAStation({ signInHref }: { signInHref: string }) {
  const t = useTranslations("station.notStation");
  return (
    <AuthScreen title={t("title")}>
      <div className="flex flex-col gap-6 px-1">
        <p className="text-ink-2 text-md">{t("body")}</p>
        <Button asChild size="lg">
          <Link href={signInHref}>{t("signIn")}</Link>
        </Button>
      </div>
    </AuthScreen>
  );
}

/**
 * Someone stopped this station: whoever edits the clock, from the team's
 * hours, or whoever runs orders, from the prep screen (a kitchen's screen
 * or the till, waiter mode P8a).
 */
export function StoppedStation({
  signInHref,
  shows = "clock_code",
}: {
  signInHref: string;
  shows?: StationShows;
}) {
  const t = useTranslations("station.stopped");
  return (
    <AuthScreen
      title={
        shows === "prep"
          ? t("prep.title")
          : shows === "till"
            ? t("till.title")
            : t("title")
      }
    >
      <div className="flex flex-col gap-6 px-1">
        <p className="text-ink-2 text-md">
          {shows === "clock_code" ? t("body") : t("ordersBody")}
        </p>
        <Button asChild size="lg">
          <Link href={signInHref}>{t("signIn")}</Link>
        </Button>
      </div>
    </AuthScreen>
  );
}

/**
 * Someone is signed in on this device, valid session or not: a station never
 * shows codes, nor orders, beside an account. Whoever may lock it locks it
 * (again) from here, keeping the station it is (whoever edits the clock the
 * clock's; whoever runs orders the kitchen's screen or the till, `shows`);
 * anyone else goes home. With ten stations running and this device none of
 * them, the lock's line says why it can't be one, and home is the way on.
 */
export function SignedInHere({
  lock,
  homeHref,
  shows = "clock_code",
}: {
  lock: StationLock | null;
  homeHref: string;
  shows?: StationShows;
}) {
  const t = useTranslations("station.signedIn");
  const locks = lock !== null && lockOpen(lock.offer);
  const orders = shows !== "clock_code";
  return (
    <AuthScreen title={t("title")}>
      <div className="flex flex-col gap-6 px-1">
        <p className="text-ink-2 text-md">
          {orders ? t("bodyOrders") : t("body")}
          {locks ? (
            <span className="mt-2 block">
              {orders
                ? t("lockAgainOrders")
                : t(lock.offer.current ? "lockAgain" : "lockNew")}
            </span>
          ) : null}
        </p>
        <div className="flex flex-col gap-3 [&>*]:w-full">
          {lock ? (
            <LockStation
              offer={lock.offer}
              lock={lock.action}
              clearsDevice={lock.clearsDevice}
              kind={orders ? (shows === "till" ? "till" : "prep") : "clock"}
              primary
              label={t("lock")}
            />
          ) : null}
          <Button asChild size="lg" variant={locks ? "ghost" : "primary"}>
            <Link href={homeHref}>{t("home")}</Link>
          </Button>
        </div>
      </div>
    </AuthScreen>
  );
}
