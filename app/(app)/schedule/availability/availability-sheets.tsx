"use client";

import { weekdayOf } from "@domain/availability";
import {
  AVAILABILITY_NOTE_MAX,
  dayMonth,
  dayProblems,
  type RangeProblem,
  type ShabbatLimits,
  suggestedRange,
  WEEKDAY_KEYS,
} from "@domain/availability-form";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { ListGroup } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { fieldInputClass, ltrInputClass } from "@ui/text-field";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type Row = { id: number; start: string; end: string };

let nextId = 0;
export const newRow = ({
  start,
  end,
}: {
  start: string;
  end: string;
}): Row => ({
  id: nextId++,
  start,
  end,
});

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const hairline =
  "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/** A day as it is being edited. Nothing reaches the form until "done". */
export type DayDraft = {
  day: string;
  rows: Row[];
  /** Show the day's problems: "done" failed, or the day failed on sending. */
  checked: boolean;
  /** The range just removed, for taking it back. */
  removed: { row: Row; index: number } | null;
  open: boolean;
};

export const closedDraft = (day: string): DayDraft => ({
  day,
  rows: [],
  checked: false,
  removed: null,
  open: false,
});

/**
 * A day opening in the sheet. An empty day starts with the usual hours filled
 * in, so most days take one tap on "done".
 */
export function openDraft(
  day: string,
  saved: Row[],
  shabbat: ShabbatLimits | null,
  checked: boolean,
): DayDraft {
  return {
    day,
    rows:
      saved.length > 0 ? saved : [newRow(suggestedRange(day, false, shabbat))],
    checked,
    removed: null,
    open: true,
  };
}

export type DaySheetProps = {
  draft: DayDraft;
  week: { start: string; shabbat: ShabbatLimits | null };
  onChange: (patch: Partial<DayDraft>) => void;
  onClose: () => void;
  onDone: (rows: Row[]) => void;
};

/**
 * One day's hours. Closing the sheet any way but "done" leaves the day as it
 * was, which is also the way back from a removal. It stays mounted, and only
 * the draft changes, so the sheet knows the business's colour when it opens.
 */
export function DaySheet({
  draft,
  week,
  onChange,
  onClose,
  onDone,
}: DaySheetProps) {
  const t = useTranslations("app.availability");
  const { day, rows, checked, removed } = draft;
  const problems = dayProblems(rows, day, week.start, week.shabbat);

  function finish() {
    if (Object.keys(problems).length > 0) {
      onChange({ checked: true });
      return;
    }
    onDone([...rows].sort((a, b) => a.start.localeCompare(b.start)));
  }

  return (
    <Sheet
      open={draft.open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("day", {
        day: t(`weekdays.${WEEKDAY_KEYS[weekdayOf(day)] ?? "sun"}`),
        date: dayMonth(day),
      })}
      subtitle={dayHint(t, day, week.shabbat)}
      closeLabel={t("sheet.close")}
      action={{ label: t("sheet.done"), onClick: finish }}
    >
      <ListGroup className="bg-elevated shadow-none">
        {rows.length === 0 ? (
          <p className="px-4 py-3.5 text-ink-2">{t("noHours")}</p>
        ) : null}
        {rows.map((r, index) => (
          <RangeEditor
            key={r.id}
            row={r}
            problem={checked ? problems[index] : undefined}
            shabbat={week.shabbat}
            onChange={(patch) =>
              onChange({
                rows: rows.map((x) => (x.id === r.id ? { ...x, ...patch } : x)),
              })
            }
            onRemove={() =>
              onChange({
                rows: rows.filter((x) => x.id !== r.id),
                removed: { row: r, index },
              })
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              rows: [
                ...rows,
                newRow(suggestedRange(day, rows.length > 0, week.shabbat)),
              ],
            })
          }
          className={cn(
            hairline,
            "flex min-h-14 w-full items-center gap-3 px-4 text-start font-medium transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink [&_svg]:size-[18px]">
            <Plus aria-hidden="true" />
          </span>
          {t("addRange")}
        </button>
      </ListGroup>
      {removed ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 ps-4 pe-1 pt-2 text-base"
        >
          <span>
            {t.rich("sheet.removed", {
              from: removed.row.start,
              to: removed.row.end,
              ltr,
            })}
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({
                rows: rows.toSpliced(removed.index, 0, removed.row),
                removed: null,
              })
            }
          >
            {t("sheet.undo")}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

function RangeEditor({
  row,
  problem,
  shabbat,
  onChange,
  onRemove,
}: {
  row: Row;
  problem?: RangeProblem;
  shabbat: ShabbatLimits | null;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("app.availability");
  const errorId = `range-${row.id}-error`;
  return (
    <div className={cn(hairline, "flex flex-col gap-2 px-4 py-3")}>
      <div className="flex items-end gap-2.5">
        <TimeInput
          label={t("start")}
          value={row.start}
          onChange={(start) => onChange({ start })}
          invalid={problem !== undefined}
          describedBy={problem ? errorId : undefined}
        />
        <TimeInput
          label={t("end")}
          value={row.end}
          onChange={(end) => onChange({ end })}
          invalid={problem !== undefined}
          describedBy={problem ? errorId : undefined}
        />
        <IconButton
          label={t("removeRange", { from: row.start, to: row.end })}
          icon={<X />}
          onClick={onRemove}
          className="-me-1.5 mb-0.5"
        />
      </div>
      {problem ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {t(`errors.ranges.${problem}`, {
            time:
              problem === "friday"
                ? (shabbat?.candleLighting ?? "")
                : (shabbat?.havdalah ?? ""),
          })}
        </p>
      ) : null}
    </div>
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
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="font-medium text-ink-2 text-sm">{label}</span>
      <input
        type="time"
        dir="ltr"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          fieldInputClass,
          ltrInputClass,
          "min-w-0 border-transparent bg-surface-2 font-semibold",
        )}
      />
    </label>
  );
}

/** What Shabbat means for a day, in full, for a business closed on Shabbat. */
function dayHint(
  t: ReturnType<typeof useTranslations<"app.availability">>,
  day: string,
  shabbat: ShabbatLimits | null,
) {
  const hint =
    shabbat && day === shabbat.friday
      ? t.rich("candleLighting", { time: shabbat.candleLighting, ltr })
      : shabbat && day === shabbat.saturday
        ? t.rich("havdalah", { time: shabbat.havdalah, ltr })
        : null;
  return hint ? <span className="block text-balance">{hint}</span> : undefined;
}

/** The note for the manager. Like a day, it reaches the form only on "done". */
export function NoteSheet({
  text,
  open,
  onChange,
  onClose,
  onDone,
}: {
  text: string;
  open: boolean;
  onChange: (text: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("app.availability");
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("note")}
      subtitle={t("noteHint")}
      closeLabel={t("sheet.close")}
      action={{ label: t("sheet.done"), onClick: onDone }}
    >
      <textarea
        aria-label={t("note")}
        rows={4}
        maxLength={AVAILABILITY_NOTE_MAX}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          fieldInputClass,
          "h-auto min-h-32 resize-none rounded-card border-transparent bg-elevated p-4",
        )}
      />
    </Sheet>
  );
}
