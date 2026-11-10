"use client";

import {
  type DetailsForm,
  type DetailsFormErrors,
  type EmploymentPeriod,
  HOURS_LAW,
  type PeriodForm,
  type PeriodFormErrors,
  parseBirth,
  parseDetailsForm,
  parsePeriodForm,
  REST_DAYS,
} from "@domain/payroll-details";
import type { AddressForm } from "@domain/profile";
import {
  type DateParts,
  datePartsOf,
  EMPTY_DATE,
  parseTypedDate,
} from "@domain/typed-date";
import { isMinorOn, youthLabel, youthUntilOf } from "@domain/youth";
import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { DateField } from "@ui/date-field";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextField } from "@ui/text-field";
import { CalendarPlus, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState, useTransition } from "react";
import { useFullDate, useMonthYear } from "./pay-parts";
import type {
  DetailsActionResult,
  PeriodActionResult,
  PersonDetails,
  SetDetails,
  SetPeriod,
} from "./pay-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** How a period reads: from when, until when, and whether it is still on. */
function PeriodLine({
  period,
  today,
  form,
}: {
  period: EmploymentPeriod;
  today: string;
  form: AddressForm;
}) {
  const t = useTranslations("app.pay.details");
  const fullDate = useFullDate();
  if (period.endedOn !== null) {
    return t.rich("between", {
      ltr,
      form,
      from: fullDate(period.startedOn),
      to: fullDate(period.endedOn),
    });
  }
  return period.startedOn > today
    ? t.rich("starts", { ltr, form, date: fullDate(period.startedOn) })
    : t.rich("since", { ltr, form, date: fullDate(period.startedOn) });
}

/**
 * A person's details for payroll on their pay page (payroll P5): their
 * payroll number, rest day, whether the Hours law applies, a minor's "until"
 * and school, and their periods of work, with a start copied from joining the
 * app marked for checking. Those who may change them open a sheet; a birth
 * date, from an owner or the accountant only, is never kept, only the day the
 * person turns 18.
 */
export function DetailsCard({
  personId,
  name,
  form,
  data,
  setDetails,
  setPeriod,
}: {
  personId: string;
  /** The person's name, for the sheets' titles. */
  name: string;
  /** How the app writes about them, for an ICU `select`. */
  form: AddressForm;
  data: PersonDetails;
  setDetails: SetDetails;
  setPeriod: SetPeriod;
}) {
  const t = useTranslations("app.pay.details");
  const monthYear = useMonthYear();
  const fullDate = useFullDate();
  const { details, periods, today } = data;
  const youth = youthLabel(details.youthUntil, today);
  // The sheets stay mounted, closed, so they open already inside the
  // business's colour.
  const [sheet, setSheet] = useState<
    | { kind: "details" }
    | { kind: "period"; period: EmploymentPeriod | null }
    | null
  >(null);
  const [opened, setOpened] = useState(0);
  const [saving, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  const canSet = data.can === "set";
  // Why the reader changes nothing here, when they don't.
  const cannot = data.can === "set" ? null : data.can;
  // Today's first, then the rest, newest first.
  const shown = [
    ...(data.current ? [data.current] : []),
    ...[...periods]
      .reverse()
      .filter((period) => period.id !== data.current?.id),
  ];

  const open = (next: NonNullable<typeof sheet>) => {
    setOpened((count) => count + 1);
    setSheet(next);
  };

  function run<R extends DetailsActionResult | PeriodActionResult>(
    action: () => Promise<R>,
    done: string,
    onFailure: (result: Extract<R, { ok: false }>) => void,
  ) {
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          onFailure(result as Extract<R, { ok: false }>);
          return;
        }
        setToast({ text: done, stamp: new Date().toISOString() });
        setSheet(null);
      } catch {
        onFailure({ ok: false, failure: "failed" } as Extract<
          R,
          { ok: false }
        >);
      }
    });
  }

  return (
    <PageSection title={t("title")}>
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <ListGroup>
        <ListRow
          title={t("number")}
          trailing={
            details.payrollNumber ? (
              <span dir="ltr" className="font-semibold text-ink tabular-nums">
                {details.payrollNumber}
              </span>
            ) : (
              <span className="font-semibold text-warning">
                {t("numberMissing")}
              </span>
            )
          }
        />
        <ListRow
          title={t("restDay.label")}
          trailing={
            <span className="text-ink-2">
              {t(`restDay.${details.restDay}`)}
            </span>
          }
        />
        <ListRow
          title={t("hoursLaw.label")}
          subtitle={
            details.hoursLaw === "applies"
              ? undefined
              : t(`hoursLaw.${details.hoursLaw}`)
          }
          trailing={
            <span className="text-ink-2">
              {details.hoursLaw === "applies"
                ? t("hoursLaw.applies")
                : t("hoursLaw.notApplies")}
            </span>
          }
        />
        {youth ? (
          <ListRow
            title={t.rich("youth", { ltr, until: monthYear(youth.until) })}
            subtitle={t("school", {
              school: details.compulsoryEducation ? "yes" : "no",
            })}
          />
        ) : null}
        {shown.length > 0 ? (
          shown.map((period) => {
            const notes = [
              period.source === "joined"
                ? { key: "joined", text: t("joined"), warn: true }
                : null,
              period.lastPaidOn
                ? {
                    key: "paid",
                    text: t.rich("lastPaid", {
                      ltr,
                      date: fullDate(period.lastPaidOn),
                    }),
                    warn: false,
                  }
                : null,
            ].filter((note) => note !== null);
            const content = {
              title: <PeriodLine period={period} today={today} form={form} />,
              subtitle:
                notes.length > 0
                  ? notes.map((note) => (
                      <span
                        key={note.key}
                        className={
                          note.warn ? "block font-medium text-warning" : "block"
                        }
                      >
                        {note.text}
                      </span>
                    ))
                  : undefined,
            };
            return canSet ? (
              <ListRow
                key={period.id}
                {...content}
                onClick={() => open({ kind: "period", period })}
              />
            ) : (
              <ListRow key={period.id} {...content} />
            );
          })
        ) : (
          <ListRow title={t("noPeriod")} />
        )}
      </ListGroup>
      {cannot ? (
        <p className="px-1 text-ink-2 text-sm">{t(`can.${cannot}`)}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => open({ kind: "details" })}>
            <PencilLine aria-hidden="true" />
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => open({ kind: "period", period: null })}
          >
            <CalendarPlus aria-hidden="true" />
            {t("addPeriod")}
          </Button>
        </div>
      )}

      {canSet ? (
        <>
          <Sheet
            open={sheet?.kind === "details"}
            onOpenChange={(next) => {
              if (!saving && !next) setSheet(null);
            }}
            title={t("sheet.title", { name })}
            subtitle={t("sheet.subtitle")}
            closeLabel={t("sheet.close")}
          >
            <DetailsSheetForm
              key={`details-${opened}`}
              data={data}
              form={form}
              saving={saving}
              save={(values, onFailure) =>
                run(() => setDetails(personId, values), t("done"), onFailure)
              }
            />
          </Sheet>
          <Sheet
            open={sheet?.kind === "period"}
            onOpenChange={(next) => {
              if (!saving && !next) setSheet(null);
            }}
            title={
              sheet?.kind === "period" && sheet.period
                ? t("period.title", { name })
                : t("period.titleNew", { name })
            }
            subtitle={t("period.subtitle", { form })}
            closeLabel={t("sheet.close")}
          >
            <PeriodSheetForm
              key={`period-${opened}`}
              period={sheet?.kind === "period" ? sheet.period : null}
              periods={periods}
              today={today}
              form={form}
              name={name}
              saving={saving}
              save={(values, periodId, onFailure) =>
                run(
                  () => setPeriod(personId, values, periodId),
                  t("period.done"),
                  onFailure,
                )
              }
            />
          </Sheet>
        </>
      ) : null}
    </PageSection>
  );
}

function DetailsSheetForm({
  data,
  form,
  saving,
  save,
}: {
  data: PersonDetails;
  form: AddressForm;
  saving: boolean;
  save: (
    values: DetailsForm,
    onFailure: (result: Extract<DetailsActionResult, { ok: false }>) => void,
  ) => void;
}) {
  const t = useTranslations("app.pay.details");
  const tDate = useTranslations("app.pay.dateParts");
  const monthYear = useMonthYear();
  const restId = useId();
  const schoolId = useId();
  const numberRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);
  const { details, today } = data;
  const [values, setValues] = useState<DetailsForm>({
    payrollNumber: details.payrollNumber ?? "",
    restDay: String(details.restDay),
    hoursLaw: details.hoursLaw,
    compulsoryEducation: details.compulsoryEducation,
    birth: EMPTY_DATE,
  });
  const [errors, setErrors] = useState<DetailsFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const read = parseDetailsForm(values, today, { birth: data.birth });
  // What the typed birth date makes of the age, before saving, read apart
  // from the rest of the sheet: a wrong number elsewhere doesn't hide it, or
  // change whether the school switch shows. Else today's.
  const birth = data.birth ? parseBirth(values.birth, today) : null;
  const typedBirth = birth?.ok ? birth.date : null;
  const youthUntil =
    typedBirth !== null ? youthUntilOf(typedBirth, today) : details.youthUntil;
  const minor = isMinorOn(today, youthUntil);

  function fail(next: DetailsFormErrors) {
    setErrors(next);
    if (next.payrollNumber) numberRef.current?.focus();
    else if (next.birth) birthRef.current?.focus();
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
      setFailure(t(`failure.${result.failure}`));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <TextField
        ref={numberRef}
        label={t("sheet.number")}
        hint={t("sheet.numberHint")}
        value={values.payrollNumber}
        maxLength={20}
        autoComplete="off"
        dir="ltr"
        className={ltrInputClass}
        onChange={(event) => {
          setValues({ ...values, payrollNumber: event.target.value });
          if (errors.payrollNumber) {
            setErrors({ ...errors, payrollNumber: undefined });
          }
        }}
        error={errors.payrollNumber ? t("errors.number") : undefined}
      />

      <ChoiceList legend={t("sheet.restDay")} legendClassName="text-md">
        {REST_DAYS.map((day) => (
          <ChoiceRow
            key={day}
            name={restId}
            value={String(day)}
            checked={values.restDay === String(day)}
            onChange={() => setValues({ ...values, restDay: String(day) })}
            title={t(`restDay.${day}`)}
            hint={day === 6 ? undefined : t("sheet.restDayHint", { form })}
            className="bg-elevated"
          />
        ))}
      </ChoiceList>

      <ChoiceList legend={t("sheet.hoursLaw")} legendClassName="text-md">
        {HOURS_LAW.map((law) => (
          <ChoiceRow
            key={law}
            name={`${restId}-law`}
            value={law}
            checked={values.hoursLaw === law}
            onChange={() => setValues({ ...values, hoursLaw: law })}
            title={t(`sheet.law.${law}.title`)}
            hint={t(`sheet.law.${law}.hint`)}
            className="bg-elevated"
          />
        ))}
      </ChoiceList>

      {data.birth ? (
        <div className="flex flex-col gap-1.5">
          <DateField
            label={t("sheet.birth")}
            parts={{
              day: tDate("day"),
              month: tDate("month"),
              year: tDate("year"),
            }}
            value={values.birth}
            onChange={(birth) => {
              setValues({ ...values, birth });
              if (errors.birth) setErrors({ ...errors, birth: undefined });
            }}
            firstRef={birthRef}
            hint={t("sheet.birthHint")}
            error={errors.birth ? t(`errors.birth.${errors.birth}`) : undefined}
          />
          {typedBirth !== null ? (
            <p aria-live="polite" className="px-1 font-medium text-ink">
              {youthUntil
                ? t.rich("sheet.birthYouth", {
                    ltr,
                    until: monthYear(youthUntil),
                  })
                : t("sheet.birthAdult")}
            </p>
          ) : null}
        </div>
      ) : null}

      {minor ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="flex flex-col">
            <span id={schoolId} className="font-medium text-ink">
              {t("sheet.school", { form })}
            </span>
            <span className="text-ink-2 text-sm">{t("sheet.schoolHint")}</span>
          </span>
          <Switch
            aria-labelledby={schoolId}
            checked={values.compulsoryEducation}
            onChange={(compulsoryEducation) =>
              setValues({ ...values, compulsoryEducation })
            }
          />
        </div>
      ) : null}

      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {failure}
        </p>
      ) : null}
      <Button size="lg" loading={saving} onClick={submit}>
        {t("sheet.save")}
      </Button>
    </div>
  );
}

/** Whether three typed fields name `day`: the same day, or nothing for null. */
function sameDay(parts: DateParts, day: string | null): boolean {
  const typed = parseTypedDate(parts);
  return typed.ok
    ? typed.date === day
    : typed.error === "empty" && day === null;
}

function PeriodSheetForm({
  period,
  periods,
  today,
  form,
  name,
  saving,
  save,
}: {
  /** The period being changed, or null for a new one. */
  period: EmploymentPeriod | null;
  periods: readonly EmploymentPeriod[];
  today: string;
  form: AddressForm;
  name: string;
  saving: boolean;
  save: (
    values: PeriodForm,
    periodId: string | null,
    onFailure: (result: Extract<PeriodActionResult, { ok: false }>) => void,
  ) => void;
}) {
  const t = useTranslations("app.pay.details");
  const tDate = useTranslations("app.pay.dateParts");
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<PeriodForm>({
    from: datePartsOf(period?.startedOn ?? null),
    to: datePartsOf(period?.endedOn ?? null),
    paid: datePartsOf(period?.lastPaidOn ?? null),
  });
  const [errors, setErrors] = useState<PeriodFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const parts = {
    day: tDate("day"),
    month: tDate("month"),
    year: tDate("year"),
  };

  // A start copied from joining, still as it was: saving it confirms it, and
  // the button says so.
  const confirming =
    period?.source === "joined" &&
    sameDay(values.from, period.startedOn) &&
    sameDay(values.to, period.endedOn) &&
    sameDay(values.paid, period.lastPaidOn);

  // The first field that is wrong takes the focus; an overlap, said under all
  // three, sends it to the start.
  function fail(next: PeriodFormErrors) {
    setErrors(next);
    if (next.from) fromRef.current?.focus();
    else if (next.to) toRef.current?.focus();
    else if (next.paid) paidRef.current?.focus();
    else if (next.overlap) fromRef.current?.focus();
  }

  function submit() {
    setFailure(null);
    const read = parsePeriodForm(values, today, periods, period?.id ?? null);
    if (!read.ok) {
      fail(read.errors);
      return;
    }
    setErrors({});
    save(values, period?.id ?? null, (result) => {
      if (result.errors && Object.keys(result.errors).length > 0) {
        fail(result.errors);
        return;
      }
      setFailure(t(`failure.${result.failure}`));
    });
  }

  const change = (key: keyof PeriodForm) => (value: PeriodForm[typeof key]) => {
    setValues({ ...values, [key]: value });
    if (errors[key] || errors.overlap) {
      setErrors({ ...errors, [key]: undefined, overlap: undefined });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {period?.source === "joined" ? (
        <p className="px-1 font-medium text-warning">
          {t("period.joined", { form })}
        </p>
      ) : null}
      <DateField
        label={t("period.from")}
        parts={parts}
        value={values.from}
        onChange={change("from")}
        firstRef={fromRef}
        error={errors.from ? t(`period.errors.from.${errors.from}`) : undefined}
      />
      <DateField
        label={t("period.to")}
        parts={parts}
        value={values.to}
        onChange={change("to")}
        firstRef={toRef}
        hint={t("period.toHint", { form })}
        error={errors.to ? t(`period.errors.to.${errors.to}`) : undefined}
      />
      <DateField
        label={t("period.paid")}
        parts={parts}
        value={values.paid}
        onChange={change("paid")}
        firstRef={paidRef}
        hint={t("period.paidHint")}
        error={errors.paid ? t(`period.errors.paid.${errors.paid}`) : undefined}
      />
      {errors.overlap ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t("period.errors.overlap", { name })}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {failure}
        </p>
      ) : null}
      <Button size="lg" loading={saving} onClick={submit}>
        {confirming ? t("period.confirm") : t("period.save")}
      </Button>
    </div>
  );
}
