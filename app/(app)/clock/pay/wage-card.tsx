"use client";

import {
  type AgeBand,
  minimumWageTableFrom,
  minimumWageTableStale,
} from "@domain/minimum-wage";
import {
  isDay,
  parseWageForm,
  WAGE_NOTE_MAX,
  type WageForm,
  type WageFormErrors,
  wageWarning,
} from "@domain/wages";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { ltrInputClass, TextField } from "@ui/text-field";
import { PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { type PayT, useFullDate, useShekels, useShortDate } from "./pay-parts";
import type { PersonWage, SetWage, WageActionResult } from "./pay-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The ICU key of a band in `app.pay.wage.warning`, `warningNow` and `warningNext`. */
const BAND_KEYS: Record<AgeBand, string> = {
  adult: "adult",
  "17": "age17",
  "16": "age16",
  under16: "under16",
};

/**
 * Under the minimum, in words: which minimum, from when, and how much it is.
 * `sheet` is the amount being typed, and says it saves anyway; `now` and
 * `next` are the card's saved wages, today's and the next one, and say which.
 */
function WarningLine({
  agorot,
  from,
  which,
  t,
}: {
  agorot: number;
  from: string;
  which: "sheet" | "now" | "next";
  t: PayT;
}) {
  const shekels = useShekels();
  const fullDate = useFullDate();
  // Until payroll P5 knows ages, every minimum is an adult's.
  const warning = wageWarning(agorot, from);
  if (!warning) return null;
  const values = {
    ltr,
    band: BAND_KEYS[warning.band],
    from: fullDate(warning.tableFrom),
    minimum: shekels(warning.minimum),
  };
  return (
    <p className="font-medium text-warning">
      {which === "sheet"
        ? t.rich("wage.warning", values)
        : which === "now"
          ? t.rich("wage.warningNow", values)
          : t.rich("wage.warningNext", { ...values, date: fullDate(from) })}
    </p>
  );
}

/**
 * A person's hourly wage on their pay page (payroll P4): the wage today and
 * the next one set, a warning in words when it is under the minimum, the way
 * to set a new one from a day for those who may, and every wage set before.
 * Setting one opens a sheet; below the minimum it warns and still saves.
 */
export function WageCard({
  personId,
  name,
  wage,
  setWage,
}: {
  personId: string;
  /** The person's name, for the sheet's title. */
  name: string;
  wage: PersonWage;
  setWage: SetWage;
}) {
  const t = useTranslations("app.pay");
  const shekels = useShekels();
  const fullDate = useFullDate();
  // The sheet stays mounted, closed, so it opens already inside the business's
  // colour; a sheet mounted open moves there on its first change and loses focus.
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const [saving, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  const shown = wage.current ?? wage.next;

  function save(
    values: WageForm,
    onFailure: (result: Extract<WageActionResult, { ok: false }>) => void,
  ) {
    start(async () => {
      try {
        const result = await setWage(personId, values);
        if (!result.ok) {
          onFailure(result);
          return;
        }
        setToast({
          text: t("wage.done", { date: fullDate(values.from) }),
          stamp: new Date().toISOString(),
        });
        setOpen(false);
      } catch {
        onFailure({ ok: false, failure: "failed" });
      }
    });
  }

  return (
    <PageSection title={t("wage.title")}>
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <Card padding="lg" className="flex flex-col gap-3">
        {shown ? (
          <div className="flex flex-col gap-0.5">
            <p
              dir="ltr"
              className="self-start font-bold text-ink text-xl tabular-nums"
            >
              {shekels(shown.agorot)}
            </p>
            <p className="text-ink-2">
              {t.rich("wage.since", { ltr, date: fullDate(shown.from) })}
            </p>
            {wage.current && wage.next ? (
              <p className="text-ink-2">
                {t.rich("wage.next", {
                  ltr,
                  date: fullDate(wage.next.from),
                  amount: shekels(wage.next.agorot),
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold text-ink text-md">{t("wage.none")}</p>
            <p className="text-ink-2">{t("wage.noneHint")}</p>
          </div>
        )}
        {wage.current ? (
          <WarningLine
            agorot={wage.current.agorot}
            from={wage.today}
            which="now"
            t={t}
          />
        ) : null}
        {wage.next ? (
          <WarningLine
            agorot={wage.next.agorot}
            from={wage.next.from}
            which="next"
            t={t}
          />
        ) : null}
        {wage.can === "set" ? (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              setOpened((count) => count + 1);
              setOpen(true);
            }}
          >
            <PencilLine aria-hidden="true" />
            {shown ? t("wage.change") : t("wage.set")}
          </Button>
        ) : (
          <p className="text-ink-2 text-sm">{t(`wage.${wage.can}`)}</p>
        )}
      </Card>

      {wage.history.length > 0 ? (
        <PageSection title={t("wage.history.title")} level={3}>
          <ListGroup>
            {wage.history.map((row) => (
              <ListRow
                key={row.id}
                title={t.rich("wage.history.row", {
                  ltr,
                  amount: shekels(row.agorot),
                  date: fullDate(row.from),
                })}
                subtitle={
                  <>
                    <span className="block">
                      {row.setByName
                        ? t.rich("wage.history.setBy", {
                            ltr,
                            name: row.setByName,
                            date: fullDate(row.setOn),
                          })
                        : t.rich("wage.history.setOn", {
                            ltr,
                            date: fullDate(row.setOn),
                          })}
                    </span>
                    {row.superseded ? (
                      <span className="block font-medium text-warning">
                        {t("wage.history.superseded")}
                      </span>
                    ) : null}
                    {row.note ? (
                      <span className="block">
                        {t("wage.history.note", { note: row.note })}
                      </span>
                    ) : null}
                  </>
                }
              />
            ))}
          </ListGroup>
        </PageSection>
      ) : null}

      {wage.can === "set" ? (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            // A save under way finishes first: its answer belongs on this sheet.
            if (!saving) setOpen(next);
          }}
          title={t("wage.sheet.title", { name })}
          subtitle={t("wage.sheet.subtitle")}
          closeLabel={t("wage.sheet.close")}
        >
          <WageSheetForm key={opened} wage={wage} saving={saving} save={save} />
        </Sheet>
      ) : null}
    </PageSection>
  );
}

type FieldKey = "amount" | "from" | "note";

function WageSheetForm({
  wage,
  saving,
  save,
}: {
  wage: PersonWage;
  saving: boolean;
  save: (
    values: WageForm,
    onFailure: (result: Extract<WageActionResult, { ok: false }>) => void,
  ) => void;
}) {
  const t = useTranslations("app.pay");
  const shortDate = useShortDate();
  const fullDate = useFullDate();
  // From the April after the table's newest row, a new minimum may be out
  // that the warning doesn't know yet: the sheet says so.
  const staleFrom = minimumWageTableStale(wage.today.slice(0, 7))
    ? minimumWageTableFrom()
    : null;
  const fields = {
    amount: useRef<HTMLInputElement>(null),
    from: useRef<HTMLInputElement>(null),
    note: useRef<HTMLInputElement>(null),
  };
  const [values, setValues] = useState<WageForm>({
    amount: "",
    from: wage.from.initial,
    note: "",
  });
  const [errors, setErrors] = useState<WageFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  // While typing: under the minimum warns, and never stops the save.
  const read = parseWageForm(values, wage.today);

  /** What is wrong is said under its field, and the first one takes the focus. */
  function fail(next: WageFormErrors) {
    setErrors(next);
    const first = (["amount", "from", "note"] as const).find(
      (key) => next[key],
    );
    if (first) fields[first].current?.focus();
  }

  function submit() {
    setFailure(null);
    if (!read.ok) {
      fail(read.errors);
      return;
    }
    setErrors({});
    save(values, (result) => {
      if (result.errors && Object.keys(result.errors).length > 0) {
        fail(result.errors);
        return;
      }
      setFailure(t(`wage.failure.${result.failure}`));
    });
  }

  const change = (key: FieldKey, value: string) => {
    setValues({ ...values, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <TextField
          ref={fields.amount}
          label={t("wage.sheet.amount")}
          value={values.amount}
          onChange={(event) => change("amount", event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          className={ltrInputClass}
          required
          error={
            errors.amount ? t(`wage.errors.amount.${errors.amount}`) : undefined
          }
        />
        <div aria-live="polite">
          {read.ok ? (
            <WarningLine
              agorot={read.agorot}
              from={read.from}
              which="sheet"
              t={t}
            />
          ) : null}
        </div>
        {staleFrom ? (
          <p className="px-1 text-ink-2 text-sm">
            {t.rich("wage.stale", { ltr, from: fullDate(staleFrom) })}
          </p>
        ) : null}
      </div>
      <TextField
        ref={fields.from}
        type="date"
        label={t("wage.sheet.from")}
        hint={t("wage.sheet.fromHint")}
        value={values.from}
        min={wage.from.earliest}
        max={wage.from.latest}
        onChange={(event) => change("from", event.target.value)}
        dir="ltr"
        className={ltrInputClass}
        required
        error={errors.from ? t(`wage.errors.from.${errors.from}`) : undefined}
      />
      <TextField
        ref={fields.note}
        label={t("wage.sheet.note")}
        hint={t("wage.sheet.noteHint")}
        value={values.note}
        maxLength={WAGE_NOTE_MAX}
        autoComplete="off"
        onChange={(event) => change("note", event.target.value)}
        error={errors.note ? t(`wage.errors.note.${errors.note}`) : undefined}
      />
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {failure}
        </p>
      ) : null}
      <Button size="lg" loading={saving} onClick={submit}>
        {isDay(values.from)
          ? t("wage.sheet.save", { date: shortDate(values.from) })
          : t("wage.sheet.saveNoDate")}
      </Button>
    </div>
  );
}
