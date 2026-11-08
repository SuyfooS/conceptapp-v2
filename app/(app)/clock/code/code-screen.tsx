"use client";

import { signInPath } from "@domain/passive-sign-in";
import {
  codePhase,
  type IssuedCode,
  issueResponse,
  nextFetchDelayMs,
  PUNCH_CODE_REFRESH_SECONDS,
  punchPayload,
  secondsToNextCode,
  spokenDigits,
} from "@domain/punch-code";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { CodeDisplay } from "@ui/code-display";
import { IconButton } from "@ui/icon-button";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ProgressRing } from "@ui/progress-ring";
import { QrCode } from "@ui/qr-code";
import { useWakeLock } from "@ui/use-wake-lock";
import { Maximize, Minimize } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { CodeScreenData } from "./code";

type Refusal = "noAccess" | "viewOnly" | "stationsOnly";

type Answer =
  | { kind: "issued"; code: IssuedCode }
  | { kind: "refused"; failure: Refusal }
  | { kind: "signedOut" }
  | { kind: "failed" };

/** Where this screen's links go; the demo keeps them inside the demo. */
export type CodePaths = { team: string; settings: string };

/**
 * One ask for a code. A signed-out phone gets the door's redirect, which
 * `redirect: "manual"` keeps as an answer instead of following it to a page.
 * Anything that isn't the route's answer counts as a failed try.
 */
async function requestCode(url: string, signal: AbortSignal): Promise<Answer> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (response.type === "opaqueredirect") return { kind: "signedOut" };
    const parsed = issueResponse.safeParse(await response.json());
    if (!parsed.success) return { kind: "failed" };
    const body = parsed.data;
    if (body.ok) {
      return {
        kind: "issued",
        code: {
          code: body.code,
          short: body.short,
          expiresAt: body.expiresAt,
          now: body.now,
        },
      };
    }
    return body.failure === "failed"
      ? { kind: "failed" }
      : { kind: "refused", failure: body.failure };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * The clock's code on an owner's or manager's own phone: a QR, and six digits
 * under it to type, a new code every 20 seconds. Timing runs on the server's
 * times and the phone's own clock since each answer, never its time of day. A
 * code that still works stays through a failed fetch or two, since the team's
 * phones may well be online; the screen stays awake while it shows one.
 */
export function CodeScreen({
  data,
  issueUrl,
  paths,
}: {
  data: CodeScreenData;
  /** The route that makes codes; the demo's makes ones nothing stores. */
  issueUrl: string;
  paths: CodePaths;
}) {
  const t = useTranslations("app.clock");
  const blocked = data.viewOnly || data.stationsOnly;

  const [issued, setIssued] = useState<
    (IssuedCode & { receivedAt: number }) | null
  >(null);
  const [failures, setFailures] = useState(0);
  const [signedOut, setSignedOut] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [asking, setAsking] = useState(false);
  /** The phone's monotonic clock at the last tick (performance.now()). */
  const [clock, setClock] = useState(0);
  const askNow = useRef<() => void>(() => {});

  // Ask for a code, then again 20 s after each answer, sooner after a failed
  // try. Nothing while the page is hidden; at once when it shows again.
  useEffect(() => {
    if (blocked) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let failed = 0;
    let stopped = false;

    async function ask() {
      clearTimeout(timer);
      inFlight?.abort();
      const mine = new AbortController();
      inFlight = mine;
      setAsking(true);
      const answer = await requestCode(issueUrl, mine.signal);
      if (stopped || mine.signal.aborted) return;
      setAsking(false);
      setSignedOut(answer.kind === "signedOut");
      setRefusal(answer.kind === "refused" ? answer.failure : null);
      // Nothing to wait for: the screen says why, and showing it again asks.
      if (answer.kind === "signedOut" || answer.kind === "refused") return;
      if (answer.kind === "issued") {
        failed = 0;
        const receivedAt = performance.now();
        setIssued({ ...answer.code, receivedAt });
        setClock(receivedAt);
      } else {
        failed += 1;
      }
      setFailures(failed);
      if (document.visibilityState === "visible") {
        timer = setTimeout(() => void ask(), nextFetchDelayMs(failed));
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void ask();
      else clearTimeout(timer);
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) void ask();
    }

    askNow.current = () => void ask();
    void ask();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [blocked, issueUrl]);

  // A step a second while the page shows, for the countdown and the phase.
  useEffect(() => {
    if (blocked) return;
    let ticking: ReturnType<typeof setInterval> | undefined;
    const tick = () => setClock(performance.now());
    function startTicking() {
      clearInterval(ticking);
      tick();
      ticking = setInterval(tick, 1000);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") startTicking();
      else clearInterval(ticking);
    }
    startTicking();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", startTicking);
    return () => {
      clearInterval(ticking);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", startTicking);
    };
  }, [blocked]);

  const elapsedMs = issued ? Math.max(0, clock - issued.receivedAt) : 0;
  const phase = codePhase({ issued, elapsedMs, failures });
  const live =
    !blocked &&
    !signedOut &&
    refusal === null &&
    (phase === "showing" || phase === "reconnecting");
  const awake = useWakeLock(live);

  // Read after mounting, so the server's page and the first render agree.
  // Phones without the API (an iPhone) never see the button. The button says
  // which way it goes, also when Escape or the system left full screen.
  const [canFullScreen, setCanFullScreen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCanFullScreen(document.fullscreenEnabled === true);
    const onChange = () =>
      setIsFullScreen(
        card.current !== null && document.fullscreenElement === card.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFullScreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void card.current?.requestFullscreen().catch(() => {});
    }
  }

  const seconds = secondsToNextCode(elapsedMs);
  const shown = live ? issued : null;

  /** What stands in the QR's place while there is none to show. */
  let placeholder: ReactNode = null;
  if (data.viewOnly) placeholder = t("code.viewOnly");
  else if (data.stationsOnly) placeholder = t("code.stationsOnly");
  else if (!live && (phase === "loading" || phase === "stale")) {
    placeholder = (
      <>
        {t("code.loading")}
        {failures > 0 ? (
          <span className="block">{t("code.failed")}</span>
        ) : null}
      </>
    );
  }

  const problem = signedOut ? (
    <Card className="flex flex-col items-start gap-3">
      <p className="text-ink">{t("code.signedOut")}</p>
      <Button asChild>
        <Link href={signInPath}>{t("code.signIn")}</Link>
      </Button>
    </Card>
  ) : refusal ? (
    <Card>
      <p className="text-ink">
        {refusal === "noAccess" ? t("failure.noAccess") : t(`code.${refusal}`)}
      </p>
    </Card>
  ) : !blocked && phase === "offline" ? (
    <Card className="flex flex-col items-start gap-3">
      <p className="text-ink">{t("code.offline")}</p>
      <Button
        variant="secondary"
        loading={asking}
        onClick={() => askNow.current()}
      >
        {t("code.retry")}
      </Button>
    </Card>
  ) : null;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.team, label: t("team.title") }}
        eyebrow={data.businessName}
        title={t("code.title")}
      />

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {problem ?? (
          <div
            ref={card}
            className="relative mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 rounded-card bg-qr-paper p-4 text-qr-ink shadow-float md:max-w-[420px] xl:max-w-[540px] [&:fullscreen]:max-w-none [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:shadow-none"
          >
            {shown && canFullScreen ? (
              <IconButton
                label={t(
                  isFullScreen ? "code.exitFullScreen" : "code.fullScreen",
                )}
                icon={
                  isFullScreen ? (
                    <Minimize aria-hidden="true" />
                  ) : (
                    <Maximize aria-hidden="true" />
                  )
                }
                onClick={toggleFullScreen}
                className="absolute end-2 top-2 z-10 text-qr-ink hover:bg-qr-ink/5 active:bg-qr-ink/10"
              />
            ) : null}
            <div className="w-[min(100%,48dvh)] md:w-full md:max-w-[380px] xl:max-w-[480px] [:fullscreen_&]:w-[min(90vw,65vh)] [:fullscreen_&]:max-w-none">
              {shown ? (
                <QrCode
                  value={punchPayload(shown.code)}
                  label={t("code.qrLabel")}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="aspect-square w-full rounded-control bg-qr-ink/5"
                />
              )}
            </div>
            {shown ? (
              <>
                <p className="font-medium text-qr-ink/70 text-sm">
                  {t("code.digitsLabel")}
                </p>
                <CodeDisplay
                  digits={shown.short}
                  spoken={t("code.digitsSpoken", {
                    digits: spokenDigits(shown.short),
                  })}
                />
                <p className="flex min-h-7 items-center gap-2 text-qr-ink/70 text-sm">
                  {phase === "reconnecting" ? (
                    t("code.reconnecting")
                  ) : failures === 0 && seconds > 0 ? (
                    <>
                      <ProgressRing
                        value={seconds}
                        max={PUNCH_CODE_REFRESH_SECONDS}
                        tone="paper"
                        className="size-6"
                      />
                      {t("code.next", { seconds })}
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <p className="min-h-7 text-center font-medium text-qr-ink/70">
                {placeholder}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <p className="text-center text-ink-2 md:text-start xl:text-lg">
            {t("code.how")}
          </p>
          {data.owner ? null : (
            <Card>
              <p className="text-ink">{t("code.notCounted")}</p>
            </Card>
          )}
          {data.required ? null : data.owner ? (
            <Card className="flex flex-col items-start gap-3">
              <p className="text-ink">{t("code.settingOffOwner")}</p>
              <Button asChild variant="secondary">
                <Link href={paths.settings}>{t("code.openSettings")}</Link>
              </Button>
            </Card>
          ) : (
            <Card>
              <p className="text-ink">{t("code.settingOffManager")}</p>
            </Card>
          )}
          {awake === "off" ? (
            <p className="text-ink-2 text-sm">{t("code.awakeOff")}</p>
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}
