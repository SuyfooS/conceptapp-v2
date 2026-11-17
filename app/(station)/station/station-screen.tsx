"use client";

import {
  type StationRefusal,
  stationCodeResponse,
} from "@domain/clock-station";
import { accentTokens } from "@domain/color";
import { accentProps } from "@ui/accent";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { PageBody } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { CodeCard } from "@/app/(app)/clock/code/code-card";
import {
  type RotationAnswer,
  useCodeRotation,
} from "@/app/(app)/clock/code/code-rotation";

/** What a running station shows besides its code. Never anyone's name. */
export type StationScreenData = {
  businessName: string;
  /** The business's colour, as stored. */
  accent: string;
  timeZone: string;
  /** The station's own name, as whoever locked it named it. */
  name: string;
  /** The server's time when the page was made, for the date until a code comes. */
  now: string;
};

/**
 * A refusal asks again this long after, on a screen nobody looks after: the
 * clock switched on again, or codes allowed on stations again, show by
 * themselves.
 */
const RETRY_REFUSED_MS = 60_000;

/** The station route's answer; anything else counts as a failed try. */
function readStationAnswer(body: unknown): RotationAnswer<StationRefusal> {
  const parsed = stationCodeResponse.safeParse(body);
  if (!parsed.success) return { kind: "failed" };
  const answer = parsed.data;
  if (answer.ok) {
    return {
      kind: "issued",
      code: {
        code: answer.code,
        short: answer.short,
        expiresAt: answer.expiresAt,
        now: answer.now,
      },
    };
  }
  return answer.failure === "failed"
    ? { kind: "failed" }
    : { kind: "refused", failure: answer.failure };
}

/**
 * A running station: the business's name and today's date on its colour, the
 * clock's code (the code screen's card, a new one every 20 seconds, awake
 * and in full screen where the device has them), how to clock in with it,
 * and the station's name small. No one's name anywhere. At the bottom, a
 * quiet way to sign in, with the SMS code to that person's own phone: the
 * only way to an account here. Stopped meanwhile, no station any more, or
 * someone signed in on it: the page is read again, and says so.
 */
export function StationScreen({
  data,
  codeUrl,
  signInHref,
}: {
  data: StationScreenData;
  /** The route that makes the station's codes; the demo's stores nothing. */
  codeUrl: string;
  signInHref: string;
}) {
  const t = useTranslations("station");
  const tCode = useTranslations("app.clock.code");
  const format = useFormatter();
  const router = useRouter();
  const rotation = useCodeRotation({
    url: codeUrl,
    read: readStationAnswer,
    blocked: false,
    retryRefusedMs: RETRY_REFUSED_MS,
  });
  const { phase, failures, refusal } = rotation;

  // The page says these itself, read again: no code, and no state kept.
  const leaving =
    refusal === "stopped" || refusal === "notStation" || refusal === "signedIn";
  useEffect(() => {
    if (leaving) router.refresh();
  }, [leaving, router]);

  // The date by the database's time once a code came with it, so a wrong
  // clock on the device changes nothing, and it turns over at midnight.
  const at = rotation.issued
    ? Date.parse(rotation.issued.now) + rotation.elapsedMs
    : Date.parse(data.now);
  const date = format.dateTime(new Date(at), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: data.timeZone,
  });

  let placeholder: ReactNode = null;
  if (leaving) placeholder = t("checking");
  else if (!rotation.live && (phase === "loading" || phase === "stale")) {
    placeholder = (
      <>
        {tCode("loading")}
        {failures > 0 ? <span className="block">{tCode("failed")}</span> : null}
      </>
    );
  }

  const problem =
    refusal === "clockOff" || refusal === "managerOnly" ? (
      <Card>
        <p className="text-ink">{t(`refused.${refusal}`)}</p>
      </Card>
    ) : refusal === null && phase === "offline" ? (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-ink">{t("offline")}</p>
        <Button
          variant="secondary"
          loading={rotation.asking}
          onClick={rotation.retry}
        >
          {tCode("retry")}
        </Button>
      </Card>
    ) : null;

  return (
    <div {...accentProps(accentTokens(data.accent))}>
      <PageBody className={cn(pageGlowClass, "min-h-dvh")}>
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] md:items-start md:gap-x-8 md:gap-y-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:gap-x-12">
          <Card
            tone="hero"
            padding="lg"
            className="flex flex-col gap-1 md:col-start-1 md:row-start-1"
          >
            <p className="text-base">{date}</p>
            <h1 className="text-balance font-bold text-2xl">
              {data.businessName}
            </h1>
          </Card>

          <div className="md:col-start-2 md:row-span-2 md:row-start-1">
            {problem ?? (
              <CodeCard
                shown={rotation.shown}
                phase={phase}
                failures={failures}
                seconds={rotation.seconds}
                placeholder={placeholder}
                className="md:max-w-[460px] xl:max-w-[560px]"
                qrClassName="w-[min(100%,52dvh)] md:max-w-[420px] xl:max-w-[500px]"
              />
            )}
          </div>

          <div className="flex flex-col gap-3 md:col-start-1 md:row-start-2">
            <p className="text-center text-ink md:text-start md:text-md xl:text-lg">
              {t("how")}
            </p>
            {rotation.awake === "off" ? (
              <p className="text-center text-ink-2 text-sm md:text-start">
                {t("awakeOff")}
              </p>
            ) : null}
            <p className="text-center text-ink-2 text-sm md:text-start">
              {t("name", { name: data.name })}
            </p>
          </div>
        </div>

        <div className="mt-auto flex justify-center pt-2 md:justify-start">
          <Button asChild variant="ghost">
            <Link href={signInHref}>
              <LogIn aria-hidden="true" className="rtl:-scale-x-100" />
              {t("signIn")}
            </Link>
          </Button>
        </div>
      </PageBody>
    </div>
  );
}
