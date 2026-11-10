"use client";

import { addDays, dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { minutesOf } from "@domain/hours";
import {
  type ListOpening,
  nextOpenings,
  type OpeningContext,
  type OpeningSchedule,
  restartsOpenings,
  type ScheduleOpenings,
  shabbatTouches,
} from "@domain/list-openings";
import {
  type DraftSchedule,
  MAX_LIST_SCHEDULES,
  newScheduleKey,
  type ScheduleRecipient,
  scheduleGone,
  scheduleProblem,
  type TemplateRecipient,
} from "@domain/lists";
import type { StaffRole } from "@domain/modules";
import { timeIn } from "@domain/shabbat";
import { Button } from "@ui/button";
import { ChoiceMenu } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { DayToggles } from "@ui/day-toggles";
import { FieldGroup } from "@ui/field-group";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Segmented } from "@ui/segmented";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { ltrInputClass } from "@ui/text-field";
import { CalendarClock, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { UndoRow } from "../../manage/undo-row";
import type { EditorTimes } from "../list-types";
import { clockOf, ltr, useTimeWords } from "./schedule-words";

const DAY_MINUTES = 24 * 60;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
/** How long a list may have, to choose from; another saved length is offered too. */
const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
/** How long before a shift's start or end it may open. */
const BEFORE = [0, 15, 30, 45, 60, 90, 120];

type T = ReturnType<typeof useTranslations<"app.lists.schedules">>;

/** Where the editor's times may go, and what the business calls them. */
export type SchedulePlacesData = {
  departments: { id: string; name: string }[];
  departmentNames: Record<string, string>;
  shifts: { key: string; name: string }[];
  roles: readonly StaffRole[];
};

/**
 * A time as the opening rules read it: from when the saved one counts, or
 * from now for a new one and one whose days or hours changed here.
 */
function openingOf(schedule: DraftSchedule, times: EditorTimes) {
  return {
    days: schedule.days,
    anchor: schedule.anchor,
    shift: schedule.shift,
    opensOffset: schedule.opensOffset,
    dueOffset: schedule.dueOffset,
    active: schedule.active,
    startsOn: schedule.startsOn ?? dateIn(new Date(times.now), times.timeZone),
    opensFrom: schedule.opensFrom ?? times.now,
  } satisfies OpeningSchedule;
}

/** "נשלחת מחר ב-08:30", in the business's own clock. */
function openingWords(
  t: T,
  opening: ListOpening,
  times: EditorTimes,
): ReactNode {
  const at = new Date(opening.opensAt);
  const day = dateIn(at, times.timeZone);
  const today = dateIn(new Date(times.now), times.timeZone);
  const time = timeIn(at, times.timeZone);
  if (day === today) return t.rich("next.today", { ltr, time });
  if (day === addDays(today, 1)) return t.rich("next.tomorrow", { ltr, time });
  return t.rich("next.on", {
    ltr,
    time,
    day: t(`dayNames.${WEEKDAY_KEYS[weekdayOf(day)] ?? "sun"}`),
    date: dayMonth(day),
  });
}

/** How long a list has, in words. */
function lengthWords(t: T, minutes: number): string {
  if (minutes < 60) return t("duration.minutes", { count: minutes });
  if (minutes % 60 === 0) return t("duration.hours", { count: minutes / 60 });
  return t("duration.mixed", {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

/**
 * The words of a template's times, the same on each row and in the sheet:
 * its days, when it opens, by when, who it goes to, and what comes next.
 */
function useScheduleWords(times: EditorTimes, places: SchedulePlacesData) {
  const t = useTranslations("app.lists.schedules");
  const { days, when, shiftName } = useTimeWords(places.shifts);
  const live = places.departments.map((d) => d.id);
  const patterns = places.shifts.map((s) => s.key);
  const context: OpeningContext = {
    timeZone: times.timeZone,
    shabbat: times.shabbat,
    shifts: times.shifts,
    patterns,
  };
  const recipient = (to: ScheduleRecipient): string => {
    switch (to.kind) {
      case "person": {
        const name = times.people.find((p) => p.userId === to.user)?.name;
        return name ? t("to.person", { name }) : t("to.aPerson");
      }
      case "department": {
        const name = places.departmentNames[to.department];
        return name && live.includes(to.department)
          ? t("to.department", { name })
          : t("to.aDepartment");
      }
      case "shift":
        return patterns.includes(to.shift)
          ? t("to.shift", { name: shiftName(to.shift) })
          : t("to.aShift");
      case "role":
        return t("to.role", { role: to.role });
    }
  };

  const due = (schedule: DraftSchedule): ReactNode =>
    schedule.anchor === "day"
      ? schedule.dueOffset >= DAY_MINUTES
        ? t.rich("dueNextDay", { ltr, time: clockOf(schedule.dueOffset) })
        : t.rich("dueAt", { ltr, time: clockOf(schedule.dueOffset) })
      : t("lasts", {
          duration: lengthWords(t, schedule.dueOffset - schedule.opensOffset),
        });

  /** What comes next: the database's openings when it has them, else the rules'. */
  const next = (
    schedule: DraftSchedule,
    saved: ListOpening[] | undefined,
  ): ReactNode => {
    if (scheduleGone(schedule, live, patterns)) {
      return schedule.shift !== null && !patterns.includes(schedule.shift)
        ? t("next.goneShift")
        : t("next.goneRecipient", {
            kind:
              schedule.recipient.kind === "department" ? "department" : "shift",
          });
    }
    if (!schedule.active) return t("next.paused");
    const [first] =
      saved ??
      nextOpenings(openingOf(schedule, times), new Date(times.now), context, 1);
    if (first) return openingWords(t, first, times);
    return schedule.anchor === "day"
      ? t("next.none")
      : t("next.waits", { shift: shiftName(schedule.shift) });
  };

  return { t, when, due, recipient, next, days, live, patterns, shiftName };
}

/**
 * A template's times (lists L4): each row says when the list opens (its days
 * and its hour, or around a shift), by when, who it goes to and when it is
 * sent next, as the database will open it, and opens a sheet to change,
 * pause or remove it, with the undo of a removal. Adding is the row at the
 * end, up to seven. A time that points at something gone says so on its
 * row (the editor says on top that it holds the saves, and `fixGone` opens
 * the first such time). A business closed on Shabbat reads its Shabbat rule
 * under them. Used by the template editor.
 */
export function SchedulesEditor({
  schedules,
  readOnly,
  onChange,
  times,
  openings,
  recipient,
  places,
  fixGone = 0,
}: {
  schedules: DraftSchedule[];
  readOnly: boolean;
  /** The times as they are now, in their order. */
  onChange: (next: DraftSchedule[]) => void;
  times: EditorTimes;
  /** The saved times' next openings, by id, while they are current. */
  openings: ScheduleOpenings;
  /** The template's own recipient: a new time goes there to start with. */
  recipient: TemplateRecipient | null;
  places: SchedulePlacesData;
  /** Counts the editor's asks to fix a time that points at something gone. */
  fixGone?: number;
}) {
  // The moment the screen was read, moved on by the time it has been open
  // once it is drawn, so a time added an hour later says when it goes from
  // then (the demo keeps its own day).
  const mounted = useRef<number | null>(null);
  useEffect(() => {
    mounted.current = Date.now();
  }, []);
  const clock =
    mounted.current === null
      ? times.now
      : new Date(
          Date.parse(times.now) + Date.now() - mounted.current,
        ).toISOString();
  const words = useScheduleWords({ ...times, now: clock }, places);
  const { t } = words;
  const [open, setOpen] = useState(false);
  // Kept while the sheet slides away, so it doesn't empty as it leaves.
  const [editing, setEditing] = useState<{
    schedule: DraftSchedule;
    isNew: boolean;
  } | null>(null);
  const [removed, setRemoved] = useState<{
    schedule: DraftSchedule;
    index: number;
  } | null>(null);

  const blank = (): DraftSchedule => ({
    key: newScheduleKey(),
    id: null,
    days: [0, 1, 2, 3, 4],
    anchor: "day",
    shift: null,
    opensOffset: 8 * 60,
    dueOffset: 8 * 60 + 45,
    recipient: recipient ?? { kind: "role", role: "worker" },
    active: true,
    startsOn: null,
    opensFrom: null,
  });

  function show(schedule: DraftSchedule, isNew: boolean) {
    setEditing({ schedule, isNew });
    setOpen(true);
  }

  function save(schedule: DraftSchedule) {
    setOpen(false);
    const known = schedules.some((other) => other.key === schedule.key);
    onChange(
      known
        ? schedules.map((other) =>
            other.key === schedule.key ? schedule : other,
          )
        : [...schedules, schedule],
    );
    setRemoved(null);
  }

  function remove(key: string) {
    setOpen(false);
    const index = schedules.findIndex((schedule) => schedule.key === key);
    const schedule = schedules[index];
    if (!schedule) return;
    setRemoved({ schedule, index });
    onChange(schedules.filter((other) => other.key !== key));
  }

  function undo() {
    if (!removed) return;
    const { schedule, index } = removed;
    setRemoved(null);
    if (schedules.some((other) => other.key === schedule.key)) return;
    const next = [...schedules];
    next.splice(Math.min(index, next.length), 0, schedule);
    onChange(next);
  }

  // The editor's "fix the time" opens the first one that points at something gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the editor asks again
  useEffect(() => {
    if (fixGone === 0 || readOnly) return;
    const first = schedules.find((schedule) =>
      scheduleGone(schedule, words.live, words.patterns),
    );
    if (first) show(first, false);
  }, [fixGone]);

  const shabbat = schedules.some((schedule) =>
    shabbatTouches(schedule, times.closesOnShabbat),
  );

  return (
    <PageSection title={t("title")}>
      <ListGroup>
        {schedules.length === 0 ? (
          <p className="px-4 py-3.5 text-ink-2">
            {readOnly ? t("emptyReadOnly") : t("empty")}
          </p>
        ) : null}
        {schedules.map((schedule) => {
          const gone = scheduleGone(schedule, words.live, words.patterns);
          const saved =
            schedule.id !== null ? openings[schedule.id] : undefined;
          const subtitle = (
            <>
              <span className="block">
                {words.due(schedule)} · {words.recipient(schedule.recipient)}
              </span>
              <span
                className={cn(
                  "block",
                  gone ? "font-medium text-warning" : undefined,
                )}
              >
                {words.next(schedule, saved)}
              </span>
            </>
          );
          return readOnly ? (
            <ListRow
              key={schedule.key}
              leading={<CalendarClock />}
              title={words.when(schedule)}
              subtitle={subtitle}
            />
          ) : (
            <ListRow
              key={schedule.key}
              leading={<CalendarClock />}
              title={words.when(schedule)}
              subtitle={subtitle}
              onClick={() => show(schedule, false)}
            />
          );
        })}
        {readOnly || schedules.length >= MAX_LIST_SCHEDULES ? null : (
          <ListRow
            leading={<Plus />}
            title={t("add")}
            onClick={() => show(blank(), true)}
          />
        )}
      </ListGroup>
      {schedules.length >= MAX_LIST_SCHEDULES && !readOnly ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("full", { count: MAX_LIST_SCHEDULES })}
        </p>
      ) : null}
      {schedules.length > 0 ? (
        <p className="px-1 text-ink-2 text-sm">
          {shabbat ? `${t("hint")} ${t("shabbat")}` : t("hint")}
        </p>
      ) : null}
      {removed ? <UndoRow message={t("removed")} onUndo={undo} /> : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={editing?.isNew ? t("sheet.newTitle") : t("sheet.title")}
        closeLabel={t("sheet.close")}
      >
        {editing ? (
          <ScheduleForm
            key={editing.schedule.key}
            schedule={editing.schedule}
            isNew={editing.isNew}
            times={times}
            places={places}
            words={words}
            onSave={save}
            onRemove={() => remove(editing.schedule.key)}
          />
        ) : null}
      </Sheet>
    </PageSection>
  );
}

type Words = ReturnType<typeof useScheduleWords>;
type Problem = "days" | "times" | "gone" | "recipient";
type Mode = "day" | "shift";

function ScheduleForm({
  schedule,
  isNew,
  times,
  places,
  words,
  onSave,
  onRemove,
}: {
  schedule: DraftSchedule;
  isNew: boolean;
  times: EditorTimes;
  places: SchedulePlacesData;
  words: Words;
  onSave: (schedule: DraftSchedule) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("app.lists.schedules");
  const tSend = useTranslations("app.lists.send");
  const tDays = useTranslations("days");
  const id = useId();
  const byShift = schedule.anchor !== "day";
  const [days, setDays] = useState(schedule.days);
  const [mode, setMode] = useState<Mode>(byShift ? "shift" : "day");
  const [at, setAt] = useState(
    clockOf(byShift ? 8 * 60 : schedule.opensOffset),
  );
  const [shift, setShift] = useState(
    schedule.shift ?? places.shifts[0]?.key ?? "",
  );
  const [edge, setEdge] = useState<"shift_start" | "shift_end">(
    schedule.anchor === "shift_end" ? "shift_end" : "shift_start",
  );
  const [opensAround, setOpensAround] = useState(
    byShift ? schedule.opensOffset : -30,
  );
  const [length, setLength] = useState(
    schedule.dueOffset - schedule.opensOffset,
  );
  const [to, setTo] = useState<ScheduleRecipient | null>(schedule.recipient);
  const [active, setActive] = useState(schedule.active);
  const [problem, setProblem] = useState<Problem | null>(null);

  const kinds: ScheduleRecipient["kind"][] = [
    ...(places.departments.length > 0 ? (["department"] as const) : []),
    ...(places.shifts.length > 0 ? (["shift"] as const) : []),
    "role",
    ...(times.people.length > 0 ? (["person"] as const) : []),
  ];

  const timing = {
    days,
    anchor: mode === "day" ? ("day" as const) : edge,
    shift: mode === "day" ? null : shift || null,
    opensOffset: mode === "day" ? minutesOf(at) : opensAround,
    dueOffset: (mode === "day" ? minutesOf(at) : opensAround) + length,
    active,
  };
  const draft: DraftSchedule = {
    ...schedule,
    ...timing,
    recipient: to ?? schedule.recipient,
    // Other days or hours, or on again: it counts from now, as the database
    // will have it once saved.
    opensFrom: restartsOpenings(schedule, timing) ? null : schedule.opensFrom,
  };
  const valid =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(at) &&
    to !== null &&
    scheduleProblem(draft, {
      departments: words.live,
      shifts: words.patterns,
    }) === null;

  function chooseKind(kind: ScheduleRecipient["kind"]) {
    setProblem(null);
    const department = places.departments[0];
    const pattern = places.shifts[0];
    const person = times.people[0];
    setTo(
      kind === "department" && department
        ? { kind, department: department.id }
        : kind === "shift" && pattern
          ? { kind, shift: pattern.key }
          : kind === "person" && person
            ? { kind, user: person.userId }
            : kind === "role"
              ? { kind, role: "worker" }
              : null,
    );
  }

  function submit() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) {
      setProblem("times");
      return;
    }
    if (to === null) {
      setProblem("recipient");
      return;
    }
    const found = scheduleProblem(draft, {
      departments: words.live,
      shifts: words.patterns,
    });
    if (found) {
      setProblem(found);
      return;
    }
    onSave(draft);
  }

  const lengths = [...new Set([...LENGTHS, length])]
    .filter((minutes) => minutes > 0 && minutes <= DAY_MINUTES)
    .sort((a, b) => a - b);
  const before = [...new Set([...BEFORE.map((m) => -m), opensAround])].sort(
    (a, b) => b - a,
  );
  const shiftLabel =
    places.shifts.find((s) => s.key === shift)?.name ?? t("shiftGone");
  const aroundLabel = (offset: number) =>
    offset <= 0
      ? t("sheet.beforeOption", { minutes: -offset })
      : t(edge === "shift_start" ? "startAfter" : "endAfter", {
          minutes: offset,
          shift: shiftLabel,
        });
  const recipientValue =
    to?.kind === "department"
      ? to.department
      : to?.kind === "shift"
        ? to.shift
        : to?.kind === "person"
          ? to.user
          : to?.kind === "role"
            ? to.role
            : "";

  return (
    <div className="flex flex-col gap-4">
      <DayToggles
        legend={t("sheet.days")}
        value={days}
        onChange={(next) => {
          setProblem(null);
          setDays(next);
        }}
        days={WEEKDAY_KEYS.map((day) => ({
          short: tDays(`${day}.short`),
          long: t(`dayNames.${day}`),
        }))}
      />
      {days.length < 7 ? (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            setProblem(null);
            setDays(EVERY_DAY);
          }}
        >
          {t("sheet.everyDay")}
        </Button>
      ) : null}

      {places.shifts.length > 0 ? (
        <Segmented
          label={t("sheet.anchor")}
          value={mode}
          onChange={(next) => {
            setProblem(null);
            setMode(next);
          }}
          options={(["day", "shift"] as const).map((value) => ({
            value,
            label: t(`sheet.anchors.${value}`),
          }))}
        />
      ) : null}

      <FieldGroup className="bg-elevated">
        {mode === "day" ? (
          <FieldRow label={t("sheet.at")} htmlFor={`${id}-at`}>
            <input
              id={`${id}-at`}
              type="time"
              dir="ltr"
              value={at}
              aria-invalid={problem === "times" || undefined}
              className={cn(rowPillInputClass, ltrInputClass)}
              onChange={(event) => {
                setProblem(null);
                setAt(event.target.value);
              }}
            />
          </FieldRow>
        ) : (
          <>
            <FieldRow label={t("sheet.shift")}>
              <ChoiceMenu
                label={`${t("sheet.shift")}: ${shiftLabel}`}
                value={shift}
                placeholder={t("sheet.choose")}
                options={places.shifts.map((s) => ({
                  key: s.key,
                  label: s.name,
                }))}
                onChange={(key) => {
                  setProblem(null);
                  setShift(key);
                }}
              />
            </FieldRow>
            <FieldRow label={t("sheet.edge")}>
              <ChoiceMenu
                label={`${t("sheet.edge")}: ${t(`sheet.edges.${edge}`)}`}
                value={edge}
                options={(["shift_start", "shift_end"] as const).map((key) => ({
                  key,
                  label: t(`sheet.edges.${key}`),
                }))}
                onChange={(key) =>
                  setEdge(key === "shift_end" ? "shift_end" : "shift_start")
                }
              />
            </FieldRow>
            <FieldRow label={t("sheet.before")}>
              <ChoiceMenu
                label={`${t("sheet.before")}: ${aroundLabel(opensAround)}`}
                value={String(opensAround)}
                options={before.map((offset) => ({
                  key: String(offset),
                  label: aroundLabel(offset),
                }))}
                onChange={(key) => setOpensAround(Number(key))}
              />
            </FieldRow>
          </>
        )}
        <FieldRow label={t("sheet.lasts")}>
          <ChoiceMenu
            label={`${t("sheet.lasts")}: ${lengthWords(t, length)}`}
            value={String(length)}
            options={lengths.map((minutes) => ({
              key: String(minutes),
              label: lengthWords(t, minutes),
            }))}
            onChange={(key) => {
              setProblem(null);
              setLength(Number(key));
            }}
          />
        </FieldRow>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        <span className="px-2 font-medium">{t("sheet.recipient")}</span>
        <Segmented
          label={t("sheet.recipient")}
          value={to?.kind ?? "role"}
          onChange={chooseKind}
          options={kinds.map((value) => ({
            value,
            label: t(`sheet.recipientKinds.${value}`),
          }))}
        />
        {to && to.kind !== "role" && to.kind !== "shift" ? (
          <FieldGroup className="bg-elevated">
            <FieldRow label={t(`sheet.${to.kind}`)}>
              <ChoiceMenu
                label={`${t(`sheet.${to.kind}`)}: ${words.recipient(to)}`}
                value={recipientValue}
                placeholder={t("sheet.choose")}
                options={
                  to.kind === "department"
                    ? places.departments.map((d) => ({
                        key: d.id,
                        label: d.name,
                      }))
                    : times.people.map((p) => ({
                        key: p.userId,
                        label: p.name ?? t("sheet.person"),
                      }))
                }
                onChange={(key) => {
                  setProblem(null);
                  setTo(
                    to.kind === "department"
                      ? { kind: "department", department: key }
                      : { kind: "person", user: key },
                  );
                }}
              />
            </FieldRow>
          </FieldGroup>
        ) : to?.kind === "shift" ? (
          <FieldGroup className="bg-elevated">
            <FieldRow label={t("sheet.shift")}>
              <ChoiceMenu
                label={`${t("sheet.shift")}: ${words.recipient(to)}`}
                value={to.shift}
                options={places.shifts.map((s) => ({
                  key: s.key,
                  label: s.name,
                }))}
                onChange={(key) => {
                  setProblem(null);
                  setTo({ kind: "shift", shift: key });
                }}
              />
            </FieldRow>
          </FieldGroup>
        ) : to?.kind === "role" ? (
          <FieldGroup className="bg-elevated">
            <FieldRow label={t("sheet.role")}>
              <ChoiceMenu
                label={`${t("sheet.role")}: ${tSend(`roles.${to.role}`)}`}
                value={to.role}
                options={places.roles.map((role) => ({
                  key: role,
                  label: tSend(`roles.${role}`),
                }))}
                onChange={(key) => {
                  const role = places.roles.find((r) => r === key);
                  if (role) setTo({ kind: "role", role });
                }}
              />
            </FieldRow>
          </FieldGroup>
        ) : null}
        {to?.kind === "shift" ? (
          <p className="px-2 text-ink-2 text-sm">
            {t("sheet.shiftPeople", { name: words.shiftName(to.shift) })}
          </p>
        ) : null}
      </div>

      {isNew ? null : (
        <FieldGroup className="bg-elevated">
          <FieldRow label={t("sheet.active")} hint={t("sheet.activeHint")}>
            <Switch
              checked={active}
              aria-label={t("sheet.active")}
              title={t("sheet.active")}
              onChange={setActive}
            />
          </FieldRow>
        </FieldGroup>
      )}

      <div role="status" className="flex flex-col gap-1 px-2">
        {valid ? (
          <span className="font-medium">{words.next(draft, undefined)}</span>
        ) : null}
        {shabbatTouches(draft, times.closesOnShabbat) ? (
          <span className="text-ink-2 text-sm">{t("shabbat")}</span>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="px-2 font-medium text-danger">
          {t(`sheet.problem.${problem}`)}
        </p>
      ) : null}

      <Button size="lg" onClick={submit}>
        {t(isNew ? "sheet.create" : "sheet.save")}
      </Button>
      {isNew ? null : (
        <Button
          size="lg"
          variant="ghost"
          className="text-danger"
          onClick={onRemove}
        >
          {t("sheet.remove")}
        </Button>
      )}
    </div>
  );
}
