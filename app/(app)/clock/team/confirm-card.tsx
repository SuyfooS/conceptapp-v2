"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { type FocusCandidate, focusFirst } from "@ui/focus-after";
import { PersonAvatar } from "@ui/person-row";
import { StatusToast } from "@ui/status-toast";
import { useFocusWhenGone } from "@ui/use-focus-after";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  afterApproval,
  CONFIRM_TITLE,
  type Refusal,
  refusalNow,
} from "./next-approval";
import type { EntryFailure, EntryToConfirm, TeamActions } from "./team-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * Hours waiting for this viewer's approval: entries made without a code, and
 * those a manager set for themselves, for an owner. Each is approved here, or
 * opened to fix. A lifted card, not the accent one: the overdue shifts under
 * it are what needs action first. Nothing when nothing waits. An approved
 * entry leaves the card at once, until the list is read again without it
 * (the demo's stand-in reads nothing again), and the toast names whose hours
 * were approved. The focus, gone with its "אישור", goes on to the next
 * entry's words (`afterApproval`), or to the page's title once the card is
 * gone; the toast's words come after it. A refusal keeps the entry, and
 * gives the focus back to its "אישור" (busy meanwhile, so it lost it) once
 * nothing is on its way, else to the card's title; then it says why, in the
 * card, or where it was when the list read again took the card along (the
 * last entry, cancelled meanwhile), for as long as that list is the one
 * drawn (`refusalNow`).
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
  const [failure, setFailure] = useState<Refusal<
    EntryFailure,
    EntryToConfirm[]
  > | null>(null);
  const [toast, setToast] = useState<{ name: string; stamp: string } | null>(
    null,
  );
  /**
   * A refusal, held until the write is over and the focus is back where it
   * was: said before that move, it would be cut off.
   */
  const refusal = useRef<{
    failure: EntryFailure;
    from: Element | null;
  } | null>(null);
  useEffect(() => {
    const held = refusal.current;
    if (pending || !held) return;
    refusal.current = null;
    // A microtask on, so an entry the list read again took away has moved
    // the focus on first (`useFocusWhenGone`). With the list drawn now,
    // which the write read again: a later read takes the refusal away.
    queueMicrotask(() => {
      focusFirst([held.from, CONFIRM_TITLE]);
      setFailure({ failure: held.failure, list: rows });
    });
  }, [pending, rows]);
  /** Approved here, until the list is read again without them. */
  const [approved, setApproved] = useState<readonly string[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list read again is what clears it
  useEffect(() => {
    setApproved([]);
  }, [rows]);
  const waiting = rows.filter((row) => !approved.includes(row.entryId));
  // As drawn now: an entry that goes next time is among them.
  const ids = waiting.map((row) => row.entryId);
  const after = (id: string) => () => afterApproval(ids, id);
  const refused = refusalNow(failure, rows);
  const failed = (className: string) =>
    refused ? (
      <p role="alert" className={className}>
        {t(`failure.${refused}`)}
      </p>
    ) : null;

  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });

  function approve(row: EntryToConfirm, name: string) {
    setBusy(row.entryId);
    setFailure(null);
    // The "אישור" pressed, for the focus to come back to after a refusal.
    const from = document.activeElement;
    refusal.current = null;
    start(async () => {
      try {
        const result = await confirm(row.entryId);
        if (result.ok) {
          setApproved((done) => [...done, row.entryId]);
          setToast({ name, stamp: new Date().toISOString() });
        } else {
          refusal.current = { failure: result.failure, from };
        }
      } catch {
        refusal.current = { failure: "failed", from };
      }
      setBusy(null);
    });
  }

  return (
    <>
      <StatusToast
        message={toast ? t("confirm.done", { name: toast.name }) : null}
        stamp={toast?.stamp}
      />
      {waiting.length > 0 ? (
        <Card tone="float" padding="none" className="overflow-hidden">
          <div className="flex flex-col gap-0.5 px-4 pt-4 pb-2">
            <h2
              data-confirm-title=""
              className="font-semibold text-ink text-md"
            >
              {t("confirm.title", { count: waiting.length })}
            </h2>
            <p className="text-ink-2 text-sm">{t("confirm.body")}</p>
          </div>
          {failed("px-4 pb-2 font-medium text-danger")}
          <ul>
            {waiting.map((row) => {
              const name = row.name ?? t("noName");
              return (
                <WaitingEntry
                  key={row.entryId}
                  row={row}
                  name={name}
                  line={t.rich("confirm.row", {
                    what: row.what,
                    day: day(row.date),
                    time: row.time,
                    ltr,
                  })}
                  approving={pending && busy === row.entryId}
                  disabled={pending || viewOnly}
                  onApprove={() => approve(row, name)}
                  fixHref={`${teamPath}/${row.userId}?month=${row.date.slice(0, 7)}`}
                  after={after(row.entryId)}
                />
              );
            })}
          </ul>
        </Card>
      ) : (
        failed("font-medium text-danger")
      )}
    </>
  );
}

/**
 * One entry waiting: whose, what waits, and its "אישור" and "תיקון". Once
 * approved it goes, and when its "אישור" had the focus, the focus goes
 * where `after` says.
 */
function WaitingEntry({
  row,
  name,
  line,
  approving,
  disabled,
  onApprove,
  fixHref,
  after,
}: {
  row: EntryToConfirm;
  name: string;
  line: ReactNode;
  approving: boolean;
  disabled: boolean;
  onApprove: () => void;
  fixHref: string;
  after: () => readonly FocusCandidate[];
}) {
  const t = useTranslations("app.clock.team");
  const item = useRef<HTMLLIElement>(null);
  useFocusWhenGone(item, after);
  return (
    <li
      ref={item}
      className="relative flex flex-col gap-2 px-4 py-3 before:absolute before:start-4 before:end-0 before:top-0 before:h-px before:bg-line md:flex-row md:items-center md:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PersonAvatar name={row.name} />
        {/* Where the focus goes on to once another entry it held was
            approved (`entryTarget`): the person and what waits, read
            together. */}
        <div
          data-confirm-target={row.entryId}
          className="flex min-w-0 flex-col"
        >
          <span className="font-medium text-ink">{name}</span>
          <span className="text-ink-2 text-sm">{line}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 ps-[52px] md:ms-auto md:ps-0">
        <Button
          variant="secondary"
          aria-label={t("confirm.approveLabel", { name })}
          loading={approving}
          disabled={disabled}
          onClick={onApprove}
        >
          {t("confirm.approve")}
        </Button>
        <Button asChild variant="ghost">
          <Link href={fixHref} aria-label={t("confirm.fixLabel", { name })}>
            {t("confirm.fix")}
          </Link>
        </Button>
      </div>
    </li>
  );
}
