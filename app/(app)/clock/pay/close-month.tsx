"use client";

import { parseReason, REASON_MAX } from "@domain/time-clock";
import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { TextField } from "@ui/text-field";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import type { CloseActionResult, CloseMonth, ReopenMonth } from "./pay-types";

type Failure = Extract<CloseActionResult, { ok: false }>["failure"];

/**
 * The pay screen's second action, beside the file (payroll P9), for an owner
 * or an accountant and a month that has ended. Open: "סגירת החודש", with no
 * "are you sure", since reopening undoes it. Closed: "פתיחת החודש מחדש",
 * which opens a sheet that asks why. One component for both, so what a
 * press says stays on screen while the page reads the month again and the
 * other button takes its place.
 */
export function MonthCloseAction({
  month,
  monthName,
  closed,
  close,
  reopen,
}: {
  /** `YYYY-MM`. */
  month: string;
  /** The month in words, for what a press says. */
  monthName: string;
  /** Closed and not reopened since. */
  closed: boolean;
  close: CloseMonth;
  reopen: ReopenMonth;
}) {
  const t = useTranslations("app.pay");
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  // The sheet stays mounted, closed, so it opens already inside the
  // business's colour (as the wage's).
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const say = (text: string) =>
    setToast({ text, stamp: new Date().toISOString() });

  function closeMonth() {
    start(async () => {
      try {
        const result = await close(month);
        say(
          result.ok
            ? t("close.done", { month: monthName })
            : t(`close.failure.${result.failure}`),
        );
      } catch {
        say(t("close.failure.failed"));
      }
    });
  }

  function reopenMonth(reason: string, onFailure: (failure: Failure) => void) {
    start(async () => {
      try {
        const result = await reopen(month, reason);
        if (!result.ok) {
          onFailure(result.failure);
          return;
        }
        say(t("reopen.done", { month: monthName }));
        setOpen(false);
      } catch {
        onFailure("failed");
      }
    });
  }

  return (
    <div className="flex flex-col">
      {closed ? (
        <Button
          variant="secondary"
          className="w-full md:w-auto"
          onClick={() => {
            setOpened((count) => count + 1);
            setOpen(true);
          }}
        >
          <LockKeyholeOpen aria-hidden="true" />
          {t("reopen.action")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="w-full md:w-auto"
          loading={busy}
          onClick={closeMonth}
        >
          <LockKeyhole aria-hidden="true" />
          {t("close.action")}
        </Button>
      )}
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={6000}
      />
      <Sheet
        open={open && closed}
        onOpenChange={(next) => {
          // A reopening under way finishes first: its answer belongs here.
          if (!busy) setOpen(next);
        }}
        title={t("reopen.title", { month: monthName })}
        subtitle={t("reopen.subtitle")}
        closeLabel={t("reopen.close")}
      >
        <ReopenForm key={opened} busy={busy} save={reopenMonth} />
      </Sheet>
    </div>
  );
}

function ReopenForm({
  busy,
  save,
}: {
  busy: boolean;
  save: (reason: string, onFailure: (failure: Failure) => void) => void;
}) {
  const t = useTranslations("app.pay");
  const field = useRef<HTMLInputElement>(null);
  // The reason starts empty each time: it says why this month opens again.
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);

  /** A missing reason is said under its field, which takes the focus. */
  function fail(next: Failure) {
    setFailure(next);
    if (next === "reasonNeeded") field.current?.focus();
  }

  function submit() {
    if (parseReason(reason) === null) {
      fail("reasonNeeded");
      return;
    }
    setFailure(null);
    save(reason, fail);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        ref={field}
        label={t("reopen.reason")}
        hint={t("reopen.reasonHint")}
        error={
          failure === "reasonNeeded" ? t("reopen.reasonNeeded") : undefined
        }
        value={reason}
        maxLength={REASON_MAX}
        required
        autoComplete="off"
        onChange={(event) => {
          setReason(event.target.value);
          if (failure === "reasonNeeded") setFailure(null);
        }}
      />
      {failure && failure !== "reasonNeeded" ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`close.failure.${failure}`)}
        </p>
      ) : null}
      <Button size="lg" loading={busy} onClick={submit}>
        {t("reopen.save")}
      </Button>
    </div>
  );
}
