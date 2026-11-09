"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PersonAvatar } from "@ui/person-row";
import { StatusToast } from "@ui/status-toast";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import type { EntryFailure, EntryToConfirm, TeamActions } from "./team-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * Hours waiting for this viewer's approval: entries made without a code, and
 * those a manager set for themselves, for an owner. Each is approved here, or
 * opened to fix. A lifted card, not the accent one: the overdue shifts under
 * it are what needs action first. Nothing when nothing waits.
 */
export function ConfirmCard({
  rows,
  confirm,
  teamPath,
  viewOnly,
}: {
  rows: EntryToConfirm[];
  confirm: TeamActions["confirm"];
  /** The team's hours, whose person pages fix a shift. */
  teamPath: string;
  viewOnly: boolean;
}) {
  const t = useTranslations("app.clock.team");
  const format = useFormatter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<EntryFailure | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });

  function approve(entryId: string) {
    setBusy(entryId);
    setFailure(null);
    start(async () => {
      try {
        const result = await confirm(entryId);
        if (result.ok) setToast(new Date().toISOString());
        else setFailure(result.failure);
      } catch {
        setFailure("failed");
      }
      setBusy(null);
    });
  }

  return (
    <>
      <StatusToast
        message={toast ? t("confirm.done") : null}
        stamp={toast ?? undefined}
      />
      {rows.length > 0 ? (
        <Card tone="float" padding="none" className="overflow-hidden">
          <div className="flex flex-col gap-0.5 px-4 pt-4 pb-2">
            <h2 className="font-semibold text-ink text-md">
              {t("confirm.title", { count: rows.length })}
            </h2>
            <p className="text-ink-2 text-sm">{t("confirm.body")}</p>
          </div>
          {failure ? (
            <p role="alert" className="px-4 pb-2 font-medium text-danger">
              {t(`failure.${failure}`)}
            </p>
          ) : null}
          <ul>
            {rows.map((row) => {
              const name = row.name ?? t("noName");
              return (
                <li
                  key={row.entryId}
                  className="relative flex flex-col gap-2 px-4 py-3 before:absolute before:start-4 before:end-0 before:top-0 before:h-px before:bg-line md:flex-row md:items-center md:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <PersonAvatar name={row.name} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{name}</span>
                      <span className="text-ink-2 text-sm">
                        {t.rich("confirm.row", {
                          what: row.what,
                          day: day(row.date),
                          time: row.time,
                          ltr,
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 ps-[52px] md:ms-auto md:ps-0">
                    <Button
                      variant="secondary"
                      aria-label={t("confirm.approveLabel", { name })}
                      loading={pending && busy === row.entryId}
                      disabled={pending || viewOnly}
                      onClick={() => approve(row.entryId)}
                    >
                      {t("confirm.approve")}
                    </Button>
                    <Button asChild variant="ghost">
                      <Link
                        href={`${teamPath}/${row.userId}?month=${row.date.slice(0, 7)}`}
                        aria-label={t("confirm.fixLabel", { name })}
                      >
                        {t("confirm.fix")}
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
