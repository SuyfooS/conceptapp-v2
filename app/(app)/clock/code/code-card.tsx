"use client";

import {
  type CodePhase,
  type IssuedCode,
  PUNCH_CODE_REFRESH_SECONDS,
  punchPayload,
  spokenDigits,
} from "@domain/punch-code";
import { cn } from "@ui/cn";
import { CodeDisplay } from "@ui/code-display";
import { IconButton } from "@ui/icon-button";
import { ProgressRing } from "@ui/progress-ring";
import { QrCode } from "@ui/qr-code";
import { Maximize, Minimize } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The clock's code on its paper: the QR, the six digits under it and when the
 * next comes, or what stands in the QR's place while there is none. Full
 * screen where the device has it (never on an iPhone), the button saying
 * which way it goes, also when Escape or the system left full screen. The
 * code screen's and a station's; each sizes it with `className` and
 * `qrClassName`.
 */
export function CodeCard({
  shown,
  phase,
  failures,
  seconds,
  placeholder,
  className,
  qrClassName,
}: {
  shown: IssuedCode | null;
  phase: CodePhase;
  failures: number;
  seconds: number;
  /** What stands in the QR's place while there is no code to show. */
  placeholder: ReactNode;
  className?: string;
  qrClassName?: string;
}) {
  const t = useTranslations("app.clock");

  // Read after mounting, so the server's page and the first render agree.
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

  return (
    <div
      ref={card}
      className={cn(
        "relative mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 rounded-card bg-qr-paper p-4 text-qr-ink shadow-float md:max-w-[420px] xl:max-w-[540px] [&:fullscreen]:max-w-none [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:shadow-none",
        className,
      )}
    >
      {shown && canFullScreen ? (
        <IconButton
          label={t(isFullScreen ? "code.exitFullScreen" : "code.fullScreen")}
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
      <div
        className={cn(
          "w-[min(100%,48dvh)] md:w-full md:max-w-[380px] xl:max-w-[480px] [:fullscreen_&]:w-[min(90vw,65vh)] [:fullscreen_&]:max-w-none",
          qrClassName,
        )}
      >
        {shown ? (
          <QrCode value={punchPayload(shown.code)} label={t("code.qrLabel")} />
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
  );
}
