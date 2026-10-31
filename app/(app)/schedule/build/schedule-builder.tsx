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
  type ScheduledShift,
  scheduleGaps,
  shiftCandidates,
  stillNeeded,
} from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import type { TeamMember } from "@domain/team";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { fieldInputClass } from "@ui/text-field";
import { WeekStrip } from "@ui/week-strip";
import { Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useState } from "react";
import type { ScheduleState } from "./actions";

const initialState: ScheduleState = {};

export type ScheduleBuilderProps = {
  week: { start: string; dates: string[]; timeZone: string };
  /** ISO timestamp of the last save, or null while it is a draft. */
  savedAt: string | null;
  shifts: ScheduledShift[];
  team: Pick<TeamMember, "userId" | "name">[];
  answers: { userId: string; ranges: AvailabilityRange[] }[];
  /** `saveScheduleAction`, or the design demo's stand-in. */
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
  shifts: initial,
  team,
  answers,
  save,
}: ScheduleBuilderProps) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(save, initialState);
  const [shifts, setShifts] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(week.dates[0] ?? week.start);

  const nameOf = new Map(
    team.map((m) => [m.userId, m.name ?? t("app.team.noName")]),
  );
  const rangesOf = new Map(answers.map((a) => [a.userId, a.ranges]));
  const gaps = scheduleGaps(shifts);
  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  const shortDay = (date: string) =>
    t(`days.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`);

  function change(index: number, assignees: ScheduledShift["assignees"]) {
    setShifts((current) =>
      current.map((s, i) => (i === index ? { ...s, assignees } : s)),
    );
    setDirty(true);
  }

  // Shifts keep their place in the week, so their index is their key.
  const indexed = shifts.map((shift, index) => ({ shift, index }));
  const onDay = (date: string) => indexed.filter((s) => s.shift.day === date);

  const card = ({ shift, index }: { shift: ScheduledShift; index: number }) => (
    <ShiftCard
      key={index}
      label={t("app.build.shift", {
        name: shift.name,
        day: weekday(shift.day),
        date: dayMonth(shift.day),
      })}
      shift={shift}
      candidates={shiftCandidates(week.start, shifts, index, team, answers)}
      nameOf={nameOf}
      noteOf={(userId) => {
        const ranges = rangesOf.get(userId);
        if (!ranges) return "noAnswer";
        return availableFor(shift, ranges) ? null : "unavailable";
      }}
      onAdd={(user) =>
        change(index, [...shift.assignees, { user, position: null }])
      }
      onRemove={(user) =>
        change(
          index,
          shift.assignees.filter((a) => a.user !== user),
        )
      }
    />
  );

  const savedMoment = savedAt
    ? {
        date: dayMonth(dateIn(new Date(savedAt), week.timeZone)),
        time: timeIn(new Date(savedAt), week.timeZone),
      }
    : null;

  if (shifts.length === 0) {
    return (
      <Card tone="flat" padding="lg" className="md:max-w-xl">
        <CardText>{t("app.build.noPattern")}</CardText>
      </Card>
    );
  }

  return (
    <form
      action={action}
      onSubmit={() => setDirty(false)}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="week" value={week.start} />
      <input type="hidden" name="shifts" value={JSON.stringify(shifts)} />
      <div className="flex flex-wrap items-center gap-2">
        {gaps.shifts.length > 0 ? (
          <Badge tone="warning">
            {t("app.build.gaps", { count: gaps.shifts.length })}
          </Badge>
        ) : (
          <Badge tone="success">{t("app.build.full")}</Badge>
        )}
      </div>

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
          </section>
        ))}
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3">
        <p className="text-ink-2">
          {dirty
            ? t("app.build.unsaved")
            : savedMoment
              ? t.rich("app.build.savedAt", { ...savedMoment, ltr })
              : t("app.build.draft")}
        </p>
        {state.failure && !dirty && !pending ? (
          <p role="alert" className="text-danger">
            {t(`app.build.errors.${state.failure}`)}
          </p>
        ) : null}
        {state.savedAt && !dirty && !pending ? (
          <p role="status" className="font-medium text-success">
            {t("app.build.saved")}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="md:self-start"
        >
          <Save aria-hidden="true" />
          {t("app.build.submit")}
        </Button>
      </div>
    </form>
  );
}

function ShiftCard({
  label,
  shift,
  candidates,
  nameOf,
  noteOf,
  onAdd,
  onRemove,
}: {
  label: string;
  shift: ScheduledShift;
  candidates: ReturnType<
    typeof shiftCandidates<Pick<TeamMember, "userId" | "name">>
  >;
  nameOf: Map<string, string>;
  noteOf: (userId: string) => "unavailable" | "noAnswer" | null;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const t = useTranslations();
  const missing = stillNeeded(shift);
  const byState = (state: CandidateState) =>
    candidates.filter((c) => c.state === state);
  const open = candidates.some((c) => c.state !== "assigned");
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
        </div>
        {missing > 0 ? (
          <Badge tone="warning">
            {t("app.build.missing", { count: missing })}
          </Badge>
        ) : (
          <Badge tone="success">{t("app.build.staffed")}</Badge>
        )}
      </div>
      {shift.assignees.length === 0 ? (
        <p className="text-ink-2 text-sm">{t("app.build.nobody")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shift.assignees.map(({ user }) => {
            const name = nameOf.get(user) ?? t("app.team.noName");
            const note = noteOf(user);
            return (
              <li key={user} className="flex min-h-11 items-center gap-1">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{name}</span>
                  {note ? (
                    <span className="text-sm text-warning">
                      {t(`app.build.notes.${note}`)}
                    </span>
                  ) : null}
                </span>
                <IconButton
                  label={t("app.build.remove", { name })}
                  icon={<X />}
                  onClick={() => onRemove(user)}
                />
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
