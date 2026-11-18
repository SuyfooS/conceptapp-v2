"use client";

import { signInPath } from "@domain/passive-sign-in";
import { issueResponse } from "@domain/punch-code";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LockStation } from "../station/lock-station";
import type { LockAction, LockOffer } from "../station/station-types";
import type { CodeScreenData } from "./code";
import { CodeCard } from "./code-card";
import { type RotationAnswer, useCodeRotation } from "./code-rotation";

type Refusal = "noAccess" | "viewOnly" | "stationsOnly";

/** Where this screen's links go; the demo keeps them inside the demo. */
export type CodePaths = { clock: string; team: string; settings: string };

/** The issue route's answer; anything else counts as a failed try. */
function readIssueAnswer(body: unknown): RotationAnswer<Refusal> {
  const parsed = issueResponse.safeParse(body);
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
 * The clock's code on the phone of someone who edits the clock (an owner, or
 * whoever holds clock.edit): a QR, and six digits under it to type, a new
 * code every 20 seconds (`useCodeRotation`). A code that still works stays
 * through a failed fetch or two, since the team's phones may well be online;
 * the screen stays awake while it shows one. Under it, where the business may
 * have one, locking the device it is on into the business's clock station
 * (`lock`).
 */
export function CodeScreen({
  data,
  issueUrl,
  paths,
  lock,
}: {
  data: CodeScreenData;
  /** The route that makes codes; the demo's makes ones nothing stores. */
  issueUrl: string;
  paths: CodePaths;
  /** Locking this device into a station; null where it isn't offered. */
  lock?: { offer: LockOffer; action: LockAction } | null;
}) {
  const t = useTranslations("app.clock");
  const blocked = data.viewOnly || data.stationsOnly;
  const rotation = useCodeRotation({
    url: issueUrl,
    read: readIssueAnswer,
    blocked,
  });
  const { phase, failures, signedOut, refusal } = rotation;

  /** What stands in the QR's place while there is none to show. */
  let placeholder: ReactNode = null;
  if (data.viewOnly) placeholder = t("code.viewOnly");
  else if (data.stationsOnly) placeholder = t("code.stationsOnly");
  else if (!rotation.live && (phase === "loading" || phase === "stale")) {
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
  ) : refusal === "noAccess" ? (
    // Showing the code was taken away while the screen was open (clock.edit,
    // the roles plan's R4): they still punch, on the clock.
    <Card className="flex flex-col items-start gap-3">
      <p className="text-ink">{t("code.noAccess")}</p>
      <Button asChild variant="secondary">
        <Link href={paths.clock}>{t("code.toClock")}</Link>
      </Button>
    </Card>
  ) : refusal ? (
    <Card>
      <p className="text-ink">{t(`code.${refusal}`)}</p>
    </Card>
  ) : !blocked && phase === "offline" ? (
    <Card className="flex flex-col items-start gap-3">
      <p className="text-ink">{t("code.offline")}</p>
      <Button
        variant="secondary"
        loading={rotation.asking}
        onClick={rotation.retry}
      >
        {t("code.retry")}
      </Button>
    </Card>
  ) : null;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={
          // The team's hours went with the code: back to the clock instead.
          refusal === "noAccess"
            ? { href: paths.clock, label: t("team.back") }
            : { href: paths.team, label: t("team.title") }
        }
        eyebrow={data.businessName}
        title={t("code.title")}
      />

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {problem ?? (
          <CodeCard
            shown={rotation.shown}
            phase={phase}
            failures={failures}
            seconds={rotation.seconds}
            placeholder={placeholder}
          />
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
          {rotation.awake === "off" ? (
            <p className="text-ink-2 text-sm">{t("code.awakeOff")}</p>
          ) : null}
          {/* Showing the code taken away meanwhile takes locking with it. */}
          {lock && refusal !== "noAccess" ? (
            <div className="flex flex-col items-start gap-2 md:mt-2">
              <p className="text-ink-2 text-sm">{t("station.lock.hint")}</p>
              <LockStation offer={lock.offer} lock={lock.action} />
            </div>
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}
