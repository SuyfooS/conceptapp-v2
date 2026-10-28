"use client";

import type { AvailabilityRange } from "@domain/availability";
import { weekdayOf } from "@domain/availability";
import {
  AVAILABILITY_NOTE_MAX,
  type AvailabilityFormErrors,
  dayMonth,
  parseAvailabilityForm,
  type RangeProblem,
  type ShabbatLimits,
  WEEKDAY_KEYS,
} from "@domain/availability-form";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { fieldInputClass, ltrInputClass, TextArea } from "@ui/text-field";
import { Plus, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useActionState,
  useState,
} from "react";
import type { AvailabilityState } from "./actions";

const initialState: AvailabilityState = {};

type Row = { id: number; start: string; end: string };

export type AvailabilityFormProps = {
  week: { start: string; dates: string[]; shabbat: ShabbatLimits | null };
  /** What the person sent before, to edit. */
  initial: { ranges: AvailabilityRange[]; note: string | null } | null;
  /** `saveAvailabilityAction`, or the design demo's stand-in. */
  save: (prev: AvailabilityState, form: FormData) => Promise<AvailabilityState>;
};

let nextId = 0;
const row = (start: string, end: string): Row => ({
  id: nextId++,
  start,
  end,
});

/** Hours a new range starts with, inside Shabbat's limits on its days. */
function newRange(date: string, rows: Row[], shabbat: ShabbatLimits | null) {
  if (shabbat && date === shabbat.saturday) {
    return row(shabbat.havdalah, "23:30");
  }
  if (shabbat && date === shabbat.friday) {
    const end =
      shabbat.candleLighting < "15:00" ? shabbat.candleLighting : "15:00";
    return row("08:00", end);
  }
  return rows.length > 0 ? row("18:00", "23:00") : row("09:00", "17:00");
}

/**
 * The worker's availability for one week: hours per day, any number of
 * ranges a day, and a note. Phone: the days one under another; tablet:
 * two columns; desktop: three. The same checks run here and on the server.
 */
export function AvailabilityForm({
  week,
  initial,
  save,
}: AvailabilityFormProps) {
  const t = useTranslations("app.availability");
  const [state, action, pending] = useActionState(save, initialState);
  const [days, setDays] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(
      week.dates.map((date) => [
        date,
        (initial?.ranges ?? [])
          .filter((r) => r.day === date)
          .map((r) => row(r.start, r.end)),
      ]),
    ),
  );
  const [note, setNote] = useState(initial?.note ?? "");
  // Checked on submit; after a failed try, again on every change.
  const [checked, setChecked] = useState(false);
  const [dirty, setDirty] = useState(false);

  const flat = week.dates.flatMap((date) =>
    (days[date] ?? []).map((r) => ({
      id: r.id,
      day: date,
      start: r.start,
      end: r.end,
    })),
  );
  const local = parseAvailabilityForm(
    { ranges: flat.map(({ id: _, ...range }) => range), note },
    week.start,
    week.shabbat,
  );
  const errors: AvailabilityFormErrors =
    checked && !local.ok ? local.errors : dirty ? {} : (state.errors ?? {});
  const errorOf = new Map<number, RangeProblem>();
  for (const [index, error] of Object.entries(errors.ranges ?? {})) {
    const id = flat[Number(index)]?.id;
    if (id !== undefined) errorOf.set(id, error);
  }

  function change(date: string, rows: Row[]) {
    setDays((current) => ({ ...current, [date]: rows }));
    setDirty(true);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!local.ok) {
      event.preventDefault();
      setChecked(true);
      return;
    }
    setChecked(false);
    setDirty(false);
  }

  const daysWithHours = week.dates.filter(
    (d) => (days[d] ?? []).length > 0,
  ).length;
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const hasErrors = errorOf.size > 0 || errors.note || errors.form;

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="week" value={week.start} />
      <input
        type="hidden"
        name="ranges"
        value={JSON.stringify(flat.map(({ id: _, ...range }) => range))}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {week.dates.map((date) => {
          const rows = days[date] ?? [];
          const weekday = WEEKDAY_KEYS[weekdayOf(date)] ?? "sun";
          const hint =
            week.shabbat && date === week.shabbat.friday
              ? t.rich("candleLighting", {
                  time: week.shabbat.candleLighting,
                  ltr,
                })
              : week.shabbat && date === week.shabbat.saturday
                ? t.rich("havdalah", { time: week.shabbat.havdalah, ltr })
                : null;
          return (
            <Card key={date} tone="flat" padding="md" className="min-w-0">
              <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                <legend className="mb-1 font-bold text-md">
                  {t("day", {
                    day: t(`weekdays.${weekday}`),
                    date: dayMonth(date),
                  })}
                </legend>
                {hint ? <p className="text-ink-2 text-sm">{hint}</p> : null}
                {rows.length === 0 ? (
                  <p className="text-ink-2">{t("noHours")}</p>
                ) : (
                  rows.map((r) => {
                    const error = errorOf.get(r.id);
                    const errorId = `range-${r.id}-error`;
                    const update = (patch: Partial<Row>) =>
                      change(
                        date,
                        rows.map((x) =>
                          x.id === r.id ? { ...x, ...patch } : x,
                        ),
                      );
                    return (
                      <div key={r.id} className="flex flex-col gap-1.5">
                        <div className="flex items-end gap-2">
                          <TimeInput
                            label={t("start")}
                            value={r.start}
                            onChange={(start) => update({ start })}
                            invalid={error !== undefined}
                            describedBy={error ? errorId : undefined}
                          />
                          <TimeInput
                            label={t("end")}
                            value={r.end}
                            onChange={(end) => update({ end })}
                            invalid={error !== undefined}
                            describedBy={error ? errorId : undefined}
                          />
                          <IconButton
                            label={t("removeRange", {
                              from: r.start,
                              to: r.end,
                            })}
                            icon={<X />}
                            onClick={() =>
                              change(
                                date,
                                rows.filter((x) => x.id !== r.id),
                              )
                            }
                          />
                        </div>
                        {error ? (
                          <p id={errorId} className="text-danger text-sm">
                            {t(`errors.ranges.${error}`, {
                              time:
                                error === "friday"
                                  ? (week.shabbat?.candleLighting ?? "")
                                  : (week.shabbat?.havdalah ?? ""),
                            })}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="self-start"
                  onClick={() =>
                    change(date, [...rows, newRange(date, rows, week.shabbat)])
                  }
                >
                  <Plus aria-hidden="true" />
                  {t("addRange")}
                </Button>
              </fieldset>
            </Card>
          );
        })}
      </div>
      <div className="flex w-full max-w-xl flex-col gap-5">
        <TextArea
          name="note"
          label={t("note")}
          rows={3}
          maxLength={AVAILABILITY_NOTE_MAX}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setDirty(true);
          }}
          hint={t("noteHint")}
          error={errors.note ? t(`errors.note.${errors.note}`) : undefined}
        />
        <p className="text-ink-2">{t("summary", { count: daysWithHours })}</p>
        {hasErrors ? (
          <p role="alert" className="text-danger">
            {errors.form ? t(`errors.form.${errors.form}`) : t("fix")}
          </p>
        ) : null}
        {state.failure && !dirty ? (
          <p role="alert" className="text-danger">
            {t(`errors.${state.failure}`)}
          </p>
        ) : null}
        {state.savedAt && !dirty ? (
          <p role="status" className="font-medium text-success">
            {t("saved")}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="md:self-start"
        >
          <Send aria-hidden="true" className="rtl:-scale-x-100" />
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

function TimeInput({
  label,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="font-medium text-ink text-sm">{label}</span>
      <input
        type="time"
        dir="ltr"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(fieldInputClass, ltrInputClass, "min-w-0")}
      />
    </label>
  );
}
