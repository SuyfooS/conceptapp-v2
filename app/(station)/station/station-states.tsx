import { Button } from "@ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LockStation } from "@/app/(app)/clock/station/lock-station";
import type {
  LockAction,
  LockOffer,
} from "@/app/(app)/clock/station/station-types";
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

/** Someone who edits the clock stopped this station, from the team's hours. */
export function StoppedStation({ signInHref }: { signInHref: string }) {
  const t = useTranslations("station.stopped");
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
 * Someone is signed in on this device, valid session or not: a station never
 * shows codes beside an account. Whoever edits the clock locks it (again)
 * from here, keeping the station it is; anyone else goes home.
 */
export function SignedInHere({
  lock,
  homeHref,
}: {
  lock: { offer: LockOffer; action: LockAction } | null;
  homeHref: string;
}) {
  const t = useTranslations("station.signedIn");
  return (
    <AuthScreen title={t("title")}>
      <div className="flex flex-col gap-6 px-1">
        <p className="text-ink-2 text-md">
          {t("body")}
          {lock ? (
            <span className="mt-2 block">
              {t(lock.offer.current ? "lockAgain" : "lockNew")}
            </span>
          ) : null}
        </p>
        <div className="flex flex-col gap-3 [&>*]:w-full">
          {lock ? (
            <LockStation
              offer={lock.offer}
              lock={lock.action}
              primary
              label={t("lock")}
            />
          ) : null}
          <Button asChild size="lg" variant={lock ? "ghost" : "primary"}>
            <Link href={homeHref}>{t("home")}</Link>
          </Button>
        </div>
      </div>
    </AuthScreen>
  );
}
