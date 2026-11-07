"use client";

import { DEMO_BUSINESSES } from "@domain/passive-sign-in";
import { Button } from "@ui/button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PersonAvatar } from "@ui/person-row";
import { Spinner } from "@ui/spinner";
import { StatusToast } from "@ui/status-toast";
import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { authFieldsClass } from "../auth-screen";
import type { EnterResult, ResetResult } from "./actions";

/**
 * One press on a person, and they are in. The people are grouped by their
 * demo business, and the door can put both businesses back the way they start.
 */
export function EnterForm({
  enter,
  reset,
}: {
  /** `enterAs`, or the design demo's stand-in. */
  enter: (person: string) => Promise<EnterResult>;
  /** `resetDemo`, or the design demo's stand-in. */
  reset: () => Promise<ResetResult>;
}) {
  const t = useTranslations("auth.enter");
  const id = useId();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function choose(person: string) {
    if (pending) return;
    setChosen(person);
    setFailed(false);
    start(async () => {
      try {
        // Success leaves this screen: the action redirects.
        await enter(person);
        setFailed(true);
      } catch (error) {
        unstable_rethrow(error);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-ink-2">{t("intro")}</p>
      {DEMO_BUSINESSES.map((business) => (
        <section
          key={business.key}
          aria-labelledby={`${id}-${business.key}`}
          className="flex flex-col gap-2"
        >
          <div className="px-1">
            <h2 id={`${id}-${business.key}`} className="font-semibold text-md">
              {t(`businesses.${business.key}.name`)}
            </h2>
            <p className="text-ink-2 text-sm">
              {t(`businesses.${business.key}.body`)}
            </p>
          </div>
          <ListGroup className={authFieldsClass}>
            {business.people.map((person) => (
              <ListRow
                key={person}
                onClick={() => choose(person)}
                leading={<PersonAvatar name={t(`people.${person}.name`)} />}
                title={t(`people.${person}.name`)}
                subtitle={t(`people.${person}.role`)}
                trailing={pending && chosen === person ? <Spinner /> : null}
              />
            ))}
          </ListGroup>
        </section>
      ))}
      {failed ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t("failed")}
        </p>
      ) : null}
      <p className="px-1 text-ink-2 text-sm">{t("warning")}</p>
      <ResetDemo reset={reset} />
    </div>
  );
}

/**
 * Both demo businesses back the way they start. Nothing can bring back what
 * the reset removes, so it says what goes before it runs: the one exception
 * to "undo rather than are you sure" (CLAUDE.md, Orel, 7 November 2026).
 */
function ResetDemo({ reset }: { reset: () => Promise<ResetResult> }) {
  const t = useTranslations("auth.enter.reset");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const warning = useRef<HTMLParagraphElement>(null);
  const opened = useRef(false);

  // Opening reads out what the reset removes; closing, by cancelling or by
  // resetting, goes back to the button that opened it.
  useEffect(() => {
    if (open) {
      opened.current = true;
      warning.current?.focus();
    } else if (opened.current) {
      trigger.current?.focus();
    }
  }, [open]);

  function confirm() {
    setFailed(false);
    start(async () => {
      let result: ResetResult;
      try {
        result = await reset();
      } catch {
        result = { ok: false };
      }
      if (result.ok) {
        setOpen(false);
        setDone((n) => n + 1);
      } else {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        ref={trigger}
        variant="ghost"
        className="self-start"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setFailed(false);
          setOpen((now) => !now);
        }}
      >
        {t("open")}
      </Button>
      {open ? (
        <div
          id={panelId}
          className="flex flex-col gap-3 rounded-card bg-surface-2 p-4"
        >
          <p ref={warning} tabIndex={-1} className="outline-none">
            {t("body")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={pending} onClick={confirm}>
              {t("confirm")}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t("failed")}
        </p>
      ) : null}
      <StatusToast message={done > 0 ? t("done") : null} stamp={String(done)} />
    </div>
  );
}
