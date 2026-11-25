"use client";

import {
  ABSENCE_KINDS,
  ABSENCE_NOTE_MAX,
  type AbsenceFailure,
  type AbsenceProblem,
  type AbsenceValues,
  parseAbsence,
} from "@domain/absences";
import { addDays } from "@domain/availability";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { type DataColumn, DataTable } from "@ui/data-table";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { focusFirst, focusLost } from "@ui/focus-after";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { TextField } from "@ui/text-field";
import { useSaid } from "@ui/use-sheet-write";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useMonthName, useShortDate } from "../pay/pay-parts";
import type { AbsenceRecordsNot, AbsenceRow } from "./team-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** A day's weekday by name: "יום שני". */
function useWeekday(): (date: string) => string {
  const format = useFormatter();
  return (date) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      timeZone: "UTC",
    });
}

/**
 * A record's count of days in words: "5 ימים בחודש הזה" for one that runs
 * past the month shown, else "3 ימים".
 */
function useDayCount(): (row: Pick<AbsenceRow, "days" | "inMonth">) => string {
  const t = useTranslations("app.clock.absences");
  return (row) =>
    row.inMonth > 0 && row.inMonth < row.days
      ? t("inMonth", { count: row.inMonth })
      : t("days", { count: row.days });
}

/** A record's days in words: "3.12–5.12 · 3 ימים", or "יום שני, 3.12". */
export function useAbsenceDays(): (
  row: Pick<AbsenceRow, "from" | "to" | "days" | "inMonth">,
) => ReactNode {
  const t = useTranslations("app.clock.absences");
  const date = useShortDate();
  const weekday = useWeekday();
  const count = useDayCount();
  return (row) => {
    if (row.from === row.to) {
      return t.rich("oneDay", {
        ltr,
        weekday: weekday(row.from),
        date: date(row.from),
      });
    }
    return (
      <>
        {t.rich("range", { ltr, from: date(row.from), to: date(row.to) })}
        {" · "}
        {count(row)}
      </>
    );
  };
}

/**
 * The builder at the week of the first shift still on a day away, this
 * week's or the next (it opens next week unless asked), else as it opens.
 */
export function builderWeekHref(
  build: string,
  rows: readonly Pick<AbsenceRow, "shiftsWeek">[],
): string {
  const [week] = rows
    .flatMap((row) => (row.shiftsWeek ? [row.shiftsWeek] : []))
    .sort();
  return week ? `${build}?week=${week}` : build;
}

/** What a failure says, the month a closed one names in words. */
export function useAbsenceFailure(): (
  failure: AbsenceFailure,
  month?: string,
) => string {
  const t = useTranslations("app.clock.absences");
  const monthName = useMonthName();
  return (failure, month) =>
    failure === "monthClosed"
      ? month
        ? t("failure.monthClosed", { month: monthName(month) })
        : t("failure.monthClosedPlain")
      : t(`failure.${failure}`);
}

/**
 * One person's days away in the month shown, under their shifts: a row for
 * each on phones and tablets, with its kind, days, note, who recorded it and
 * the shifts the schedule still has on them, and the way to record more; a
 * table on a desktop, with the same words. "הוספת משמרת" stays the page's
 * one main action, so recording is a row, or a quiet pill beside the table.
 * Where the viewer records none here, a quiet line under it says why. A
 * record brought back (`restored`) takes the focus on its row, on the shape
 * drawn, once the list read again has it, and then says so (`shown`).
 */
export function AbsencesSection({
  rows,
  headingRef,
  restored = null,
  addable,
  open,
  add,
  builderHref,
  recordsNot = null,
}: {
  rows: readonly AbsenceRow[];
  /**
   * The section's title, for a screen that puts the focus there when what
   * held it went (a removed record's toast).
   */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /**
   * The record just brought back, a new object each time: its row takes the
   * focus once it is drawn, where the focus was lost or on the section's
   * title (where the toast's "ביטול" left it), never from elsewhere. Then
   * `shown` is called, for the words that say it came back: after the
   * focus's move, which would cut them off.
   */
  restored?: { id: string; shown?: () => void } | null;
  /** The viewer records days away here, writing as themselves. */
  addable: boolean;
  /** Opens a record; leave out where nothing opens (viewing only). */
  open?: (row: AbsenceRow, opener: HTMLElement) => void;
  add: (opener: HTMLElement) => void;
  /** The schedule builder, for whoever builds it: the way to the shifts. */
  builderHref: string | null;
  /**
   * Why the viewer, who records others' days away, records none here: their
   * own (someone else records them), or someone no longer on the staff.
   */
  recordsNot?: AbsenceRecordsNot;
}) {
  const t = useTranslations("app.clock.absences");
  const daysOf = useAbsenceDays();
  const dayCount = useDayCount();
  const date = useShortDate();
  // Each shape's rows, in the order of `rows`: the list's on phones and
  // tablets, the table's buttons on a desktop.
  const list = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const seen = useRef<{ id: string } | null>(null);
  useEffect(() => {
    if (!restored || seen.current === restored) return;
    const at = rows.findIndex((row) => row.id === restored.id);
    // Not drawn yet: the list read again brings it.
    if (at < 0) return;
    seen.current = restored;
    const title = headingRef?.current ?? null;
    if (focusLost() || document.activeElement === title) {
      focusFirst(
        [
          list.current?.children.item(at),
          table.current
            ?.querySelector("tbody")
            ?.children.item(at)
            ?.querySelector("button"),
        ],
        { onlyIfLost: false, title: false },
      );
    }
    restored.shown?.();
  }, [restored, rows, headingRef]);
  const shiftsLine = (row: AbsenceRow) =>
    row.shifts > 0 ? (
      <span className="text-warning">
        {t("shiftsOn", { count: row.shifts })}
      </span>
    ) : null;
  const columns: DataColumn[] = [
    { key: "kind", label: t("columns.kind") },
    { key: "from", label: t("columns.from"), numeric: true },
    { key: "to", label: t("columns.to"), numeric: true },
    // Words, as the phone says them: "5 ימים בחודש הזה".
    { key: "days", label: t("columns.days") },
    { key: "note", label: t("columns.note") },
    { key: "recorded", label: t("columns.recorded") },
  ];
  const recorded = (row: AbsenceRow) =>
    t.rich("recorded", {
      ltr,
      name: row.recordedBy ?? t("someone"),
      date: date(row.recordedOn),
    });
  /**
   * A row's lines: its days, its note, who recorded it, and the shifts still
   * on them, as the desktop's columns say them.
   */
  const subtitleOf = (row: AbsenceRow) => (
    <span className="flex flex-col">
      <span>{daysOf(row)}</span>
      {row.note ? <span>{row.note}</span> : null}
      <span>{recorded(row)}</span>
      {shiftsLine(row)}
    </span>
  );

  return (
    <PageSection
      title={t("title")}
      headingRef={headingRef}
      className="md:mx-auto md:w-full md:max-w-2xl xl:max-w-none"
      action={
        addable ? (
          <Button
            variant="secondary"
            className="hidden xl:inline-flex"
            onClick={(event) => add(event.currentTarget)}
          >
            <Plus aria-hidden="true" />
            {t("add")}
          </Button>
        ) : null
      }
    >
      <ListGroup ref={list} className="xl:hidden">
        {rows.length === 0 ? <ListRow title={t("none")} /> : null}
        {rows.map((row) =>
          open ? (
            <ListRow
              key={row.id}
              title={t(`kinds.${row.kind}`)}
              subtitle={subtitleOf(row)}
              onClick={(event) => open(row, event.currentTarget)}
            />
          ) : (
            <ListRow
              key={row.id}
              title={t(`kinds.${row.kind}`)}
              subtitle={subtitleOf(row)}
            />
          ),
        )}
        {addable ? (
          <ListRow
            leading={<Plus aria-hidden="true" />}
            title={t("add")}
            onClick={(event) => add(event.currentTarget)}
          />
        ) : null}
      </ListGroup>
      {rows.some((row) => row.shifts > 0) && builderHref ? (
        <Link
          href={builderHref}
          className="inline-flex min-h-11 items-center self-start px-1 font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent xl:hidden"
        >
          {t("toBuilder")}
        </Link>
      ) : null}
      <Card
        ref={table}
        padding="none"
        className="hidden overflow-hidden xl:block"
      >
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-ink-2">{t("none")}</p>
        ) : (
          <DataTable
            caption={t("title")}
            columns={columns}
            onSelect={
              open
                ? (key) => {
                    const row = rows.find((one) => one.id === key);
                    const active = document.activeElement;
                    if (row && active instanceof HTMLElement) open(row, active);
                  }
                : undefined
            }
            rows={rows.map((row) => ({
              key: row.id,
              // Two of one kind in a month: the kind, then the days, so
              // each button has a name of its own.
              label:
                row.from === row.to
                  ? t("rowLabelOne", {
                      kind: t(`kinds.${row.kind}`),
                      date: date(row.from),
                    })
                  : t("rowLabel", {
                      kind: t(`kinds.${row.kind}`),
                      from: date(row.from),
                      to: date(row.to),
                    }),
              cells: {
                kind: t(`kinds.${row.kind}`),
                from: date(row.from),
                to: date(row.to),
                days: dayCount(row),
                note: (
                  <span className="flex flex-col">
                    {row.note ? <span>{row.note}</span> : null}
                    {shiftsLine(row)}
                  </span>
                ),
                recorded: recorded(row),
              },
            }))}
          />
        )}
      </Card>
      {rows.some((row) => row.shifts > 0) && builderHref ? (
        <Link
          href={builderHref}
          className="hidden min-h-11 items-center self-start px-1 font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent xl:inline-flex"
        >
          {t("toBuilder")}
        </Link>
      ) : null}
      {recordsNot ? (
        <p className="px-1 text-ink-2 text-sm">
          {t(recordsNot === "own" ? "ownHint" : "offStaffHint")}
        </p>
      ) : null}
    </PageSection>
  );
}

/** The form's fields, as they start: a record's own, or a new one's. */
export function absenceValuesOf(
  row: AbsenceRow | null,
  firstDay: string,
): AbsenceValues {
  return row
    ? { kind: row.kind, from: row.from, to: row.to, note: row.note ?? "" }
    : { kind: "", from: firstDay, to: firstDay, note: "" };
}

/** The fields a problem is said under, beside its field. */
const FIELD_OF: Record<AbsenceProblem, "kind" | "days" | "note"> = {
  kind: "kind",
  dates: "days",
  order: "days",
  tooLong: "days",
  tooFar: "days",
  note: "note",
};

/**
 * The sheet's form for days away: the kind, from and to (the last day
 * included), and a note with no medical details. A new one's last day
 * follows its first until it is changed. A record's own form saves only
 * once something changed, and offers its removal under it, with "ביטול" in
 * the toast after rather than a question first.
 */
export function AbsenceForm({
  row,
  firstDay,
  today,
  saving,
  failed,
  onSaid,
  save,
  remove,
}: {
  row: AbsenceRow | null;
  /** A new record's first day: today in today's month, else the month's first. */
  firstDay: string;
  today: string;
  saving: boolean;
  /** Why the toast's "ביטול" didn't go, said as it opens. */
  failed: { failure: AbsenceFailure; month?: string } | null;
  /**
   * A refusal is drawn, said: the sheet may close (`@ui/use-sheet-write`'s
   * `useSaid`).
   */
  onSaid: () => void;
  save: (
    values: AbsenceValues,
    onFailure: (failure: AbsenceFailure, month?: string) => void,
  ) => void;
  remove?: (
    onFailure: (failure: AbsenceFailure, month?: string) => void,
  ) => void;
}) {
  const t = useTranslations("app.clock.absences");
  const say = useAbsenceFailure();
  const id = useId();
  const fromField = useRef<HTMLInputElement>(null);
  const noteField = useRef<HTMLInputElement>(null);
  const start = absenceValuesOf(row, firstDay);
  const [values, setValues] = useState<AbsenceValues>(start);
  // A new record's last day follows its first, until it is set.
  const [toSet, setToSet] = useState(row !== null);
  const [failure, setFailure] = useState(failed);
  useSaid(failure !== null, onSaid);
  const changed =
    row === null ||
    values.kind !== start.kind ||
    values.from !== start.from ||
    values.to !== start.to ||
    values.note.trim() !== start.note;
  const field =
    failure && failure.failure in FIELD_OF
      ? FIELD_OF[failure.failure as AbsenceProblem]
      : null;

  // Drawn before the focus moves, also when it comes from the server (after
  // an await, which React would draw only on its next turn): the field it
  // lands on is read with why, its description, once. So a refusal said
  // beside its field is no alert, which would say it a second time.
  function fail(next: AbsenceFailure, month?: string) {
    flushSync(() => setFailure({ failure: next, month }));
    const at = next in FIELD_OF ? FIELD_OF[next as AbsenceProblem] : null;
    if (at === "kind") document.getElementById(`${id}-kind-vacation`)?.focus();
    if (at === "days") fromField.current?.focus();
    if (at === "note") noteField.current?.focus();
  }

  function submit() {
    const parsed = parseAbsence(values, today);
    if (!parsed.ok) {
      fail(parsed.problem);
      return;
    }
    setFailure(null);
    save(values, fail);
  }

  const reach = {
    min: addDays(today, -366),
    max: addDays(today, 366),
  };
  const dateField = (key: "from" | "to") => (
    <FieldRow label={t(`sheet.${key}`)} htmlFor={`${id}-${key}`}>
      <input
        ref={key === "from" ? fromField : undefined}
        id={`${id}-${key}`}
        type="date"
        dir="ltr"
        min={key === "to" && values.from ? values.from : reach.min}
        max={reach.max}
        value={values[key]}
        aria-invalid={field === "days" ? true : undefined}
        aria-describedby={field === "days" ? `${id}-days` : undefined}
        onChange={(event) => {
          const value = event.target.value;
          if (key === "from") {
            setValues({
              ...values,
              from: value,
              to: toSet ? values.to : value,
            });
          } else {
            setToSet(true);
            setValues({ ...values, to: value });
          }
          if (field === "days") setFailure(null);
        }}
        className={rowPillInputClass}
      />
    </FieldRow>
  );

  // Under the kinds, as the list's own error would be, but describing each
  // kind rather than the list: the focus goes to one, and a group's
  // description isn't read with it everywhere (a phone's screen reader).
  const kindError = field === "kind" && failure ? say(failure.failure) : null;

  return (
    <div className="flex flex-col gap-3">
      <ChoiceList
        legend={t("sheet.kind")}
        legendClassName="text-md"
        groupClassName="bg-elevated shadow-none"
      >
        {ABSENCE_KINDS.map((kind) => (
          <ChoiceRow
            key={kind}
            id={`${id}-kind-${kind}`}
            name={`${id}-kind`}
            value={kind}
            aria-describedby={kindError ? `${id}-kind-error` : undefined}
            checked={values.kind === kind}
            onChange={() => {
              setValues({ ...values, kind });
              if (field === "kind") setFailure(null);
            }}
            title={t(`kinds.${kind}`)}
            hint={t(`hints.${kind}`)}
          />
        ))}
      </ChoiceList>
      {kindError ? (
        <p id={`${id}-kind-error`} className="px-1 text-danger text-sm">
          {kindError}
        </p>
      ) : null}
      <ListGroup className="bg-elevated">
        {dateField("from")}
        {dateField("to")}
      </ListGroup>
      {field === "days" && failure ? (
        <p id={`${id}-days`} className="px-1 text-danger text-sm">
          {say(failure.failure)}
        </p>
      ) : null}
      <TextField
        ref={noteField}
        label={t("sheet.note")}
        hint={t("sheet.noteHint")}
        error={field === "note" && failure ? say(failure.failure) : undefined}
        value={values.note}
        maxLength={ABSENCE_NOTE_MAX}
        autoComplete="off"
        onChange={(event) => {
          setValues({ ...values, note: event.target.value });
          if (field === "note") setFailure(null);
        }}
      />
      {failure && field === null ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {say(failure.failure, failure.month)}
        </p>
      ) : null}
      <Button size="lg" loading={saving} disabled={!changed} onClick={submit}>
        {t(row ? "sheet.save" : "sheet.submit")}
      </Button>
      {remove ? (
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            // Cleared as it sends, as the save's is: a refusal in the same
            // words again is drawn anew, so its alert says it again.
            setFailure(null);
            remove(fail);
          }}
          className="text-danger"
        >
          <Trash2 aria-hidden="true" />
          {t("sheet.remove")}
        </Button>
      ) : null}
    </div>
  );
}
