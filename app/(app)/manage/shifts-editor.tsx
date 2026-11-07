"use client";

import { WEEKDAY_KEYS } from "@domain/availability-form";
import {
  newStaffingKey,
  type ShiftPattern,
  shiftPattern,
} from "@domain/staffing";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { Stepper } from "@ui/stepper";
import { ltrInputClass } from "@ui/text-field";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { UndoRow } from "./undo-row";

const SHIFTS_MAX = 30;
const NAME_MAX = 40;
const NEEDED_MAX = 50;

/** A new shift's first values: nothing here is about any kind of business. */
const blank = (): ShiftPattern => ({
  key: newStaffingKey("shift"),
  name: "",
  days: [0, 1, 2, 3, 4],
  start: "08:00",
  end: "16:00",
  needed: 1,
});

/**
 * The shifts every new week starts from. Each row says what it is at a glance,
 * and opens a sheet to change it. Weeks already saved keep their own shifts.
 */
export function ShiftsEditor({
  title,
  hint,
  shifts,
  disabled,
  onChange,
}: {
  title: string;
  hint: string | undefined;
  shifts: ShiftPattern[];
  disabled: boolean;
  onChange: (next: ShiftPattern[]) => void;
}) {
  const t = useTranslations("app.manage.shifts");
  const tDays = useTranslations("days");
  const [open, setOpen] = useState(false);
  // Kept while the sheet slides away, so it doesn't empty as it leaves.
  const [editing, setEditing] = useState<{
    shift: ShiftPattern;
    isNew: boolean;
  } | null>(null);
  const [removed, setRemoved] = useState<{
    shift: ShiftPattern;
    index: number;
  } | null>(null);

  const daysOf = (days: number[]) =>
    days.length === 7
      ? t("everyDay")
      : [...days]
          .sort((a, b) => a - b)
          .map((day) => tDays(`${WEEKDAY_KEYS[day] ?? "sun"}.short`))
          .join(" ");

  function show(shift: ShiftPattern, isNew: boolean) {
    setEditing({ shift, isNew });
    setOpen(true);
  }

  function saveShift(shift: ShiftPattern) {
    setRemoved(null);
    setOpen(false);
    onChange(
      shifts.some((other) => other.key === shift.key)
        ? shifts.map((other) => (other.key === shift.key ? shift : other))
        : [...shifts, shift],
    );
  }

  function removeShift(key: string) {
    const index = shifts.findIndex((shift) => shift.key === key);
    const shift = shifts[index];
    setOpen(false);
    if (!shift) return;
    setRemoved({ shift, index });
    onChange(shifts.filter((other) => other.key !== key));
  }

  function undo() {
    if (!removed) return;
    const next = [...shifts];
    next.splice(removed.index, 0, removed.shift);
    setRemoved(null);
    onChange(next);
  }

  return (
    <PageSection title={title}>
      <ListGroup>
        {shifts.length === 0 ? (
          <p className="px-4 py-3.5 text-ink-2">{t("empty")}</p>
        ) : null}
        {shifts.map((shift) => {
          const summary = (
            <>
              {daysOf(shift.days)}
              {" · "}
              <span dir="ltr">
                {shift.start}–{shift.end}
              </span>
              {" · "}
              {t("people", { count: shift.needed })}
            </>
          );
          return disabled ? (
            <ListRow key={shift.key} title={shift.name} subtitle={summary} />
          ) : (
            <ListRow
              key={shift.key}
              title={shift.name}
              subtitle={summary}
              onClick={() => show(shift, false)}
            />
          );
        })}
        {disabled || shifts.length >= SHIFTS_MAX ? null : (
          <ListRow
            leading={<Plus />}
            title={t("add")}
            onClick={() => show(blank(), true)}
          />
        )}
      </ListGroup>
      {removed ? (
        <UndoRow
          message={t("removed", { name: removed.shift.name })}
          onUndo={undo}
        />
      ) : null}
      {hint ? <p className="px-1 text-ink-2 text-sm">{hint}</p> : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={editing?.isNew ? t("newTitle") : editing?.shift.name}
        closeLabel={t("close")}
      >
        {editing ? (
          <ShiftForm
            key={editing.shift.key}
            shift={editing.shift}
            isNew={editing.isNew}
            onSave={saveShift}
            onRemove={() => removeShift(editing.shift.key)}
          />
        ) : null}
      </Sheet>
    </PageSection>
  );
}

type Problem = "name" | "days" | "needed" | "times";

function ShiftForm({
  shift,
  isNew,
  onSave,
  onRemove,
}: {
  shift: ShiftPattern;
  isNew: boolean;
  onSave: (shift: ShiftPattern) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("app.manage.shifts");
  const tDays = useTranslations("days");
  const id = useId();
  const [name, setName] = useState(shift.name);
  const [days, setDays] = useState(shift.days);
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const [needed, setNeeded] = useState(String(shift.needed));
  const [problem, setProblem] = useState<Problem | null>(null);

  const toggle = (day: number) => {
    setProblem(null);
    setDays((current) =>
      current.includes(day)
        ? current.filter((other) => other !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  function submit() {
    const parsed = shiftPattern.safeParse({
      key: shift.key,
      name,
      days,
      start,
      end,
      needed: Number(needed),
    });
    if (parsed.success) {
      onSave(parsed.data);
      return;
    }
    const field = parsed.error.issues[0]?.path[0];
    setProblem(
      field === "name" || field === "days" || field === "needed"
        ? field
        : "times",
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup className="bg-elevated">
        <GroupedField
          label={t("name")}
          value={name}
          maxLength={NAME_MAX}
          error={problem === "name" ? t("problem.name") : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
        <FieldRow label={t("start")} htmlFor={`${id}-start`}>
          <input
            id={`${id}-start`}
            type="time"
            dir="ltr"
            value={start}
            aria-invalid={problem === "times" || undefined}
            className={cn(rowPillInputClass, ltrInputClass)}
            onChange={(event) => {
              setStart(event.target.value);
              setProblem(null);
            }}
          />
        </FieldRow>
        <FieldRow
          label={t("end")}
          htmlFor={`${id}-end`}
          hint={start && end && end < start ? t("nextDay") : undefined}
        >
          <input
            id={`${id}-end`}
            type="time"
            dir="ltr"
            value={end}
            aria-invalid={problem === "times" || undefined}
            className={cn(rowPillInputClass, ltrInputClass)}
            onChange={(event) => {
              setEnd(event.target.value);
              setProblem(null);
            }}
          />
        </FieldRow>
        <FieldRow label={t("needed")} htmlFor={`${id}-needed`}>
          <Stepper
            id={`${id}-needed`}
            value={needed}
            min={1}
            max={NEEDED_MAX}
            invalid={problem === "needed"}
            decreaseLabel={t("fewer")}
            increaseLabel={t("more")}
            onValueChange={(value) => {
              setNeeded(value);
              setProblem(null);
            }}
          />
        </FieldRow>
      </FieldGroup>

      <fieldset className="flex flex-col gap-2">
        <legend className="px-2 pb-2 font-medium">{t("days")}</legend>
        <div className="flex flex-wrap justify-between gap-1 px-1">
          {WEEKDAY_KEYS.map((day, index) => {
            const on = days.includes(index);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={tDays(`${day}.long`)}
                onClick={() => toggle(index)}
                className={cn(
                  "pressable grid size-11 place-items-center rounded-full font-semibold",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  on ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2",
                )}
              >
                {tDays(`${day}.short`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {problem && problem !== "name" ? (
        <p role="alert" className="px-2 font-medium text-danger">
          {t(`problem.${problem}`)}
        </p>
      ) : null}

      <Button size="lg" onClick={submit}>
        {t(isNew ? "create" : "save")}
      </Button>
      {isNew ? null : (
        <Button
          size="lg"
          variant="ghost"
          className="text-danger"
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
      )}
    </div>
  );
}
