"use client";

import {
  type AvailabilityRange,
  dateIn,
  weekdayOf,
} from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import {
  availableFor,
  type CandidateState,
  doubleBooked,
  positionCounts,
  type ScheduledShift,
  type ShiftDetailsProblem,
  scheduleGaps,
  shiftCandidates,
  shiftDetailsProblem,
  shiftSlot,
  stillNeeded,
} from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import type { Position } from "@domain/staffing";
import type { TeamMember } from "@domain/team";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { fieldInputClass, ltrInputClass } from "@ui/text-field";
import { WeekStrip } from "@ui/week-strip";
import { Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  type ReactNode,
  useActionState,
  useId,
  useRef,
  useState,
} from "react";
import type { ScheduleState } from "./actions";

const initialState: ScheduleState = {};

export type ScheduleBuilderProps = {
  week: { start: string; dates: string[]; timeZone: string };
  /** ISO timestamp of the last save, or null while it is a draft. */
  savedAt: string | null;
  /** ISO timestamp of the last publish, or null until it is published. */
  publishedAt: string | null;
  shifts: ScheduledShift[];
  team: Pick<TeamMember, "userId" | "name">[];
  answers: { userId: string; ranges: AvailabilityRange[] }[];
  /** The business's positions (waiter, cook…); none hides the choice. */
  positions: Position[];
  /**
   * `saveScheduleAction`, or the design demo's stand-in. The form's
   * `intent` says whether to save the draft or publish.
   */
  save: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Groups in the "add a person" list, in the order they are shown. */
const GROUPS = ["available", "noAnswer", "unavailable", "busy"] as const;

/**
 * The manager builds next week's schedule: who works each shift, picked
 * from the team with their availability. Phone: one day at a time with
 * the week strip; tablet: the same, the day's shifts in two columns;
 * desktop: the whole week, a column per day. One form, so both shapes
 * edit the same schedule.
 */
export function ScheduleBuilder({
  week,
  savedAt,
  publishedAt,
  shifts: initial,
  team,
  answers,
  positions,
  save,
}: ScheduleBuilderProps) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(save, initialState);
  // Each shift gets an id of its own on this screen, so cards keep their
  // state while shifts are added and removed around them.
  const nextId = useRef(initial.length);
  const [rows, setRows] = useState(() =>
    initial.map((shift, id) => ({ id, shift })),
  );
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(week.dates[0] ?? week.start);
  /** The shift last removed and where it was, until it is put back. */
  const [removed, setRemoved] = useState<{
    row: { id: number; shift: ScheduledShift };
    at: number;
  } | null>(null);
  const [blocked, setBlocked] = useState(false);
  /** The button that sent the form last: save the draft, or publish. */
  const [intent, setIntent] = useState<"save" | "publish">("publish");

  const shifts = rows.map((r) => r.shift);
  const nameOf = new Map(
    team.map((m) => [m.userId, m.name ?? t("app.team.noName")]),
  );
  const rangesOf = new Map(answers.map((a) => [a.userId, a.ranges]));
  const gaps = scheduleGaps(shifts);
  const clashes = doubleBooked(week.start, shifts);
  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  const shortDay = (date: string) =>
    t(`days.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`);

  function edited(next: { id: number; shift: ScheduledShift }[]) {
    setRows(next);
    setDirty(true);
    setBlocked(false);
  }

  function change(id: number, shift: ScheduledShift) {
    // New hours may move the shift within its day.
    const rest = rows.filter((r) => r.id !== id);
    const at = shiftSlot(
      rest.map((r) => r.shift),
      shift,
    );
    edited([...rest.slice(0, at), { id, shift }, ...rest.slice(at)]);
  }

  function remove(id: number) {
    const at = rows.findIndex((r) => r.id === id);
    const row = rows[at];
    if (!row) return;
    setRemoved({ row, at });
    edited(rows.filter((r) => r.id !== id));
  }

  function undoRemove() {
    if (!removed) return;
    const at = Math.min(removed.at, rows.length);
    edited([...rows.slice(0, at), removed.row, ...rows.slice(at)]);
    setRemoved(null);
  }

  function addShift(date: string, details: ShiftDetails) {
    const shift: ScheduledShift = {
      day: date,
      ...details,
      pattern: null,
      assignees: [],
    };
    const at = shiftSlot(shifts, shift);
    const id = nextId.current++;
    edited([...rows.slice(0, at), { id, shift }, ...rows.slice(at)]);
  }

  const onDay = (date: string) =>
    rows
      .map((row, index) => ({ ...row, index }))
      .filter((r) => r.shift.day === date);

  const card = ({
    id,
    shift,
    index,
  }: {
    id: number;
    shift: ScheduledShift;
    index: number;
  }) => (
    <ShiftCard
      key={id}
      label={t("app.build.shift", {
        name: shift.name,
        day: weekday(shift.day),
        date: dayMonth(shift.day),
      })}
      shift={shift}
      candidates={shiftCandidates(week.start, shifts, index, team, answers)}
      nameOf={nameOf}
      positions={positions}
      noteOf={(userId) => {
        if (clashes.has(`${index}:${userId}`)) return "busy";
        const ranges = rangesOf.get(userId);
        if (!ranges) return "noAnswer";
        return availableFor(shift, ranges) ? null : "unavailable";
      }}
      onAdd={(user) =>
        change(id, {
          ...shift,
          assignees: [...shift.assignees, { user, position: null }],
        })
      }
      onPosition={(user, position) =>
        change(id, {
          ...shift,
          assignees: shift.assignees.map((a) =>
            a.user === user ? { ...a, position } : a,
          ),
        })
      }
      onRemove={(user) =>
        change(id, {
          ...shift,
          assignees: shift.assignees.filter((a) => a.user !== user),
        })
      }
      onChange={(details) => change(id, { ...shift, ...details })}
      onDelete={() => remove(id)}
    />
  );

  const addButton = (date: string) => (
    <AddShift
      label={t("app.build.addShiftOn", {
        day: weekday(date),
        date: dayMonth(date),
      })}
      onAdd={(details) => addShift(date, details)}
    />
  );

  const moment = (iso: string | null | undefined) =>
    iso
      ? {
          date: dayMonth(dateIn(new Date(iso), week.timeZone)),
          time: timeIn(new Date(iso), week.timeZone),
        }
      : null;
  const savedMoment = moment(savedAt);
  // The design demo stores nothing, so its publish shows through `state`.
  const publishedMoment = moment(
    publishedAt ?? (state.published ? state.savedAt : null),
  );
  const done = !dirty && !pending;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Saving would fail on someone working two shifts at once.
        if (clashes.size > 0) {
          event.preventDefault();
          setBlocked(true);
          return;
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        setIntent(
          submitter?.getAttribute("value") === "save" ? "save" : "publish",
        );
        setDirty(false);
        setRemoved(null);
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="week" value={week.start} />
      <input type="hidden" name="shifts" value={JSON.stringify(shifts)} />
      {initial.length === 0 ? (
        <Card tone="flat" padding="lg" className="md:max-w-xl">
          <CardText>{t("app.build.noPattern")}</CardText>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {shifts.length === 0 ? null : gaps.shifts.length > 0 ? (
          <Badge tone="warning">
            {t("app.build.gaps", { count: gaps.shifts.length })}
          </Badge>
        ) : (
          <Badge tone="success">{t("app.build.full")}</Badge>
        )}
        {clashes.size > 0 ? (
          <Badge tone="danger">{t("app.build.clashBadge")}</Badge>
        ) : null}
      </div>
      {removed ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface-2 p-3 md:max-w-xl"
        >
          <span className="min-w-0 flex-1">
            {t("app.build.removedShift", {
              name: removed.row.shift.name,
              day: weekday(removed.row.shift.day),
            })}
          </span>
          <Button type="button" variant="secondary" onClick={undoRemove}>
            {t("app.build.undoRemove")}
          </Button>
        </div>
      ) : null}

      {/* Phone and tablet: one day at a time. */}
      <div className="flex flex-col gap-4 xl:hidden">
        <WeekStrip
          label={t("app.build.days")}
          value={day}
          onChange={setDay}
          days={week.dates.map((date) => ({
            key: date,
            label: shortDay(date),
            date: date.slice(8).replace(/^0/, ""),
            muted: onDay(date).length === 0,
            marked: onDay(date).some(({ shift }) => stillNeeded(shift) > 0),
            markLabel: t("app.build.dayMissing"),
          }))}
        />
        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-md">
            {t("app.build.day", { day: weekday(day), date: dayMonth(day) })}
          </h2>
          {onDay(day).length === 0 ? (
            <p className="text-ink-2">{t("app.build.noShifts")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 md:items-start">
              {onDay(day).map(card)}
            </div>
          )}
          <div key={day} className="md:max-w-sm">
            {addButton(day)}
          </div>
        </section>
      </div>

      {/* Desktop: the whole week, a column per day. */}
      <div className="hidden xl:grid xl:grid-cols-7 xl:items-start xl:gap-3">
        {week.dates.map((date) => (
          <section key={date} className="flex min-w-0 flex-col gap-3">
            <h2 className="font-bold">
              {weekday(date)}
              <span className="block font-normal text-ink-2 text-sm">
                {dayMonth(date)}
              </span>
            </h2>
            {onDay(date).length === 0 ? (
              <p className="text-ink-2 text-sm">{t("app.build.noShifts")}</p>
            ) : (
              onDay(date).map(card)
            )}
            {addButton(date)}
          </section>
        ))}
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3">
        <p className="text-ink-2">
          {publishedMoment
            ? dirty
              ? t("app.build.unpublished")
              : t.rich("app.build.publishedAt", { ...publishedMoment, ltr })
            : dirty
              ? t("app.build.unsaved")
              : savedMoment
                ? t.rich("app.build.savedAt", { ...savedMoment, ltr })
                : t("app.build.draft")}
        </p>
        {blocked ? (
          <p role="alert" className="text-danger">
            {t("app.build.errors.clash")}
          </p>
        ) : null}
        {state.failure && done ? (
          <p role="alert" className="text-danger">
            {t(`app.build.errors.${state.failure}`)}
          </p>
        ) : null}
        {state.savedAt && done ? (
          <p role="status" className="font-medium text-success">
            {state.published ? t("app.build.published") : t("app.build.saved")}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
          <Button
            type="submit"
            name="intent"
            value="publish"
            size="lg"
            loading={pending && intent === "publish"}
            disabled={pending}
          >
            <Send aria-hidden="true" className="rtl:-scale-x-100" />
            {publishedMoment
              ? t("app.build.publishChanges")
              : t("app.build.publish")}
          </Button>
          {/* Once published, what is saved is what the team sees. */}
          {publishedMoment ? null : (
            <Button
              type="submit"
              name="intent"
              value="save"
              variant="secondary"
              size="lg"
              loading={pending && intent === "save"}
              disabled={pending}
            >
              <Save aria-hidden="true" />
              {t("app.build.submit")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function ShiftCard({
  label,
  shift,
  candidates,
  nameOf,
  positions,
  noteOf,
  onAdd,
  onPosition,
  onRemove,
  onChange,
  onDelete,
}: {
  label: string;
  shift: ScheduledShift;
  candidates: ReturnType<
    typeof shiftCandidates<Pick<TeamMember, "userId" | "name">>
  >;
  nameOf: Map<string, string>;
  positions: Position[];
  noteOf: (userId: string) => "busy" | "unavailable" | "noAnswer" | null;
  onAdd: (userId: string) => void;
  onPosition: (userId: string, position: string | null) => void;
  onRemove: (userId: string) => void;
  onChange: (details: ShiftDetails) => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const missing = stillNeeded(shift);
  const byState = (state: CandidateState) =>
    candidates.filter((c) => c.state === state);
  const open = candidates.some((c) => c.state !== "assigned");
  const inPositions = positionCounts(shift, positions);
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-card border bg-surface p-3",
        missing > 0 ? "border-warning/40" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate font-bold">{shift.name}</h3>
          <span className="text-ink-2 text-sm">
            {t.rich("app.build.time", {
              start: shift.start,
              end: shift.end,
              ltr,
            })}
          </span>
          <span className="text-ink-2 text-sm">
            {t("app.build.people", {
              assigned: shift.assignees.length,
              needed: shift.needed,
            })}
          </span>
          {inPositions.length > 0 ? (
            <span className="text-ink-2 text-sm">
              {inPositions
                .map(({ position, count }) =>
                  t("app.build.inPosition", { name: position.name, count }),
                )
                .join(" · ")}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {missing > 0 ? (
            <Badge tone="warning">
              {t("app.build.missing", { count: missing })}
            </Badge>
          ) : (
            <Badge tone="success">{t("app.build.staffed")}</Badge>
          )}
          {editing ? null : (
            <IconButton
              label={t("app.build.edit", { name: shift.name })}
              icon={<Pencil />}
              onClick={() => setEditing(true)}
            />
          )}
        </div>
      </div>
      {editing ? (
        <ShiftEditor
          initial={shift}
          submitLabel={t("app.build.editor.apply")}
          onDone={(details) => {
            onChange(details);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          extra={
            <Button type="button" variant="ghost" onClick={onDelete}>
              <Trash2 aria-hidden="true" />
              {t("app.build.editor.delete")}
            </Button>
          }
        />
      ) : null}
      {shift.assignees.length === 0 ? (
        <p className="text-ink-2 text-sm">{t("app.build.nobody")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shift.assignees.map(({ user, position }) => {
            const name = nameOf.get(user) ?? t("app.team.noName");
            const note = noteOf(user);
            return (
              <li key={user} className="flex flex-col gap-1 py-1">
                <span className="flex min-h-11 items-center gap-1">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{name}</span>
                    {note ? (
                      <span
                        className={cn(
                          "text-sm",
                          note === "busy" ? "text-danger" : "text-warning",
                        )}
                      >
                        {t(`app.build.notes.${note}`)}
                      </span>
                    ) : null}
                  </span>
                  <IconButton
                    label={t("app.build.remove", { name })}
                    icon={<X />}
                    onClick={() => onRemove(user)}
                  />
                </span>
                {positions.length > 0 ? (
                  <select
                    aria-label={t("app.build.position", { name })}
                    value={position ?? ""}
                    onChange={(event) =>
                      onPosition(user, event.target.value || null)
                    }
                    className={cn(fieldInputClass, "min-w-0")}
                  >
                    <option value="">{t("app.build.noPosition")}</option>
                    {positions.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {open ? (
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">{t("app.build.add")}</span>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) onAdd(event.target.value);
            }}
            className={cn(fieldInputClass, "min-w-0")}
          >
            <option value="">{t("app.build.choose")}</option>
            {GROUPS.map((group) => {
              const people = byState(group);
              return people.length === 0 ? null : (
                <optgroup key={group} label={t(`app.build.groups.${group}`)}>
                  {people.map(({ member }) => (
                    <option
                      key={member.userId}
                      value={member.userId}
                      disabled={group === "busy"}
                    >
                      {member.name ?? t("app.team.noName")}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
      ) : null}
    </section>
  );
}

type ShiftDetails = Pick<ScheduledShift, "name" | "start" | "end" | "needed">;

/** "Add a shift" under a day: a button that opens the shift's details. */
function AddShift({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (details: ShiftDetails) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <Plus aria-hidden="true" />
        {t("app.build.addShift")}
      </Button>
    );
  }
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3"
    >
      <h3 className="font-bold">{t("app.build.addShift")}</h3>
      <ShiftEditor
        initial={{ name: "", start: "", end: "", needed: 1 }}
        submitLabel={t("app.build.editor.add")}
        onDone={(details) => {
          onAdd(details);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}

/**
 * A shift's name, hours and people needed. It sits inside the schedule's
 * form, so it has no form of its own: its buttons apply the change to the
 * schedule on the screen, and Enter in a field does the same instead of
 * saving the whole week.
 */
function ShiftEditor({
  initial,
  submitLabel,
  onDone,
  onCancel,
  extra,
}: {
  initial: ShiftDetails;
  submitLabel: string;
  onDone: (details: ShiftDetails) => void;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const t = useTranslations("app.build.editor");
  const id = useId();
  const [name, setName] = useState(initial.name);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [needed, setNeeded] = useState(String(initial.needed));
  const [problem, setProblem] = useState<ShiftDetailsProblem | null>(null);

  function apply() {
    const details = { name: name.trim(), start, end, needed: Number(needed) };
    const found = shiftDetailsProblem(details);
    setProblem(found);
    if (!found) onDone(details);
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  };
  const errorId = `${id}-error`;
  const invalid = (field: ShiftDetailsProblem) =>
    problem === field || (field === "time" && problem === "same")
      ? { "aria-invalid": true, "aria-describedby": errorId }
      : {};

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">{t("name")}</span>
        <input
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={onKeyDown}
          className={cn(fieldInputClass, "min-w-0")}
          {...invalid("name")}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-28 flex-1 flex-col gap-1.5">
          <span className="font-medium text-sm">{t("start")}</span>
          <input
            type="time"
            dir="ltr"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            onKeyDown={onKeyDown}
            className={cn(fieldInputClass, ltrInputClass, "min-w-0")}
            {...invalid("time")}
          />
        </label>
        <label className="flex min-w-28 flex-1 flex-col gap-1.5">
          <span className="font-medium text-sm">{t("end")}</span>
          <input
            type="time"
            dir="ltr"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            onKeyDown={onKeyDown}
            className={cn(fieldInputClass, ltrInputClass, "min-w-0")}
            {...invalid("time")}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">{t("needed")}</span>
        <input
          type="number"
          dir="ltr"
          inputMode="numeric"
          min={1}
          max={50}
          value={needed}
          onChange={(event) => setNeeded(event.target.value)}
          onKeyDown={onKeyDown}
          className={cn(fieldInputClass, ltrInputClass, "min-w-0")}
          {...invalid("needed")}
        />
      </label>
      <p className="text-ink-2 text-sm">{t("night")}</p>
      {problem ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {t(`problems.${problem}`)}
        </p>
      ) : null}
      {/* Stacked where the card is narrow: the phone and the desktop's
          day columns. */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap xl:flex-col xl:[&>button]:px-2">
        <Button type="button" variant="secondary" onClick={apply}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        {extra}
      </div>
    </div>
  );
}
